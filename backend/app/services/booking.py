import re
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    STATUS_CANCELLED,
    STATUS_CONFIRMED,
    Appointment,
    AppointmentDocument,
    Doctor,
    Service,
    User,
)
from app.schemas import BookingIn
from app.security import new_booking_reference
from app.services.availability import clinic_tz, slots_for_range

PAEDIATRICS = "paediatrics"
MAX_REFERRAL_BYTES = 5 * 1024 * 1024
# Detected from the file's first bytes; the browser-supplied type is not trusted.
REFERRAL_SIGNATURES = {
    b"%PDF-": "application/pdf",
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
}


class BookingError(Exception):
    def __init__(
        self, status_code: int, message: str, code: str, fields: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.fields = fields or {}


@dataclass(frozen=True)
class ReferralUpload:
    filename: str
    data: bytes


def _invalid(fields: dict[str, str]) -> BookingError:
    return BookingError(422, next(iter(fields.values())), "validation_error", fields)


def check_referral(upload: ReferralUpload) -> str:
    """Return the detected content type, or raise if the file isn't acceptable."""
    if not upload.data:
        raise _invalid({"referral": "The referral file is empty."})
    if len(upload.data) > MAX_REFERRAL_BYTES:
        raise _invalid({"referral": "The referral file must be 5 MB or smaller."})
    for signature, content_type in REFERRAL_SIGNATURES.items():
        if upload.data.startswith(signature):
            return content_type
    raise _invalid({"referral": "Upload a PDF, JPG or PNG file."})


def _safe_filename(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]).strip()
    return (name or "referral")[:200]


def intake_problems(db: Session, user: User, doctor: Doctor, intake: BookingIn) -> dict[str, str]:
    """Rules that depend on other answers or on the doctor being booked."""
    problems: dict[str, str] = {}
    if not intake.consent:
        problems["consent"] = "Please accept the booking and privacy terms to continue."
    if intake.consultation_mode == "video" and not intake.video_platform:
        problems["video_platform"] = "Choose the app you'd like to use for the video call."
    if doctor.specialty.slug == PAEDIATRICS:
        if not intake.child_name:
            problems["child_name"] = "Enter the child's name."
        if intake.child_age is None:
            problems["child_age"] = "Enter the child's age."
    if intake.patient_type == "returning" and intake.previous_reference:
        owned = db.scalar(
            select(Appointment.id).where(
                Appointment.reference == intake.previous_reference, Appointment.user_id == user.id
            )
        )
        if not owned:
            problems["previous_reference"] = "We couldn't find that reference in your bookings."
    return problems


def intake_details(doctor: Doctor, intake: BookingIn) -> dict:
    """Keep only the conditional answers that apply to the choices made."""
    details: dict = {}
    if intake.patient_type == "returning" and intake.previous_reference:
        details["previous_reference"] = intake.previous_reference
    if intake.patient_type == "first_time" and intake.allergies:
        details["allergies"] = intake.allergies
    if intake.consultation_mode == "video":
        details["video_platform"] = intake.video_platform
    if intake.consultation_mode == "in_person" and intake.accessibility_needs:
        details["accessibility_needs"] = intake.accessibility_needs
    if doctor.specialty.slug == PAEDIATRICS:
        details["child_name"] = intake.child_name
        details["child_age"] = intake.child_age
    return details


def _constraint_name(exc: IntegrityError) -> str | None:
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None)


def create_booking(
    db: Session,
    user: User,
    service_id: int,
    starts_at: datetime,
    now: datetime,
    intake: BookingIn | None = None,
    referral: ReferralUpload | None = None,
) -> Appointment:
    """Book `service_id` at `starts_at` for `user`, re-checking everything server-side.

    `intake` is the booking form; it is optional only for internal callers
    (seed data, tests). The appointment, its intake answers and the referral
    document are written in one transaction.

    Concurrency: the patient's own row is locked so their concurrent requests
    run one at a time (protecting the one-per-doctor-per-day rule), and the
    exclusion constraints on `appointments` make overlapping confirmed
    bookings for the same doctor impossible even when different patients race.
    """
    db.execute(select(User.id).where(User.id == user.id).with_for_update())

    service = db.get(Service, service_id)
    if service is None or not service.is_active or not service.doctor.is_active:
        raise BookingError(404, "This consultation is not available.", "service_not_found")
    doctor = service.doctor

    referral_type = check_referral(referral) if referral else None
    if intake is not None:
        problems = intake_problems(db, user, doctor, intake)
        if problems:
            raise _invalid(problems)

    starts_at = starts_at.astimezone(UTC)
    tz = clinic_tz()
    day = starts_at.astimezone(tz).date()
    open_slots = slots_for_range(db, doctor, service.duration_minutes, day, day, now).get(day, [])
    if starts_at not in open_slots:
        raise BookingError(
            409,
            "That time slot is no longer available. Please pick another one.",
            "slot_unavailable",
        )

    day_start = datetime.combine(day, time.min, tz)
    same_day = db.scalar(
        select(func.count()).where(
            Appointment.user_id == user.id,
            Appointment.doctor_id == doctor.id,
            Appointment.status == STATUS_CONFIRMED,
            Appointment.starts_at >= day_start,
            Appointment.starts_at < day_start + timedelta(days=1),
        )
    )
    if same_day:
        raise BookingError(
            409,
            f"You already have an appointment with {doctor.name} on this day.",
            "daily_limit",
        )

    for _ in range(5):
        appointment = Appointment(
            reference=new_booking_reference(),
            user_id=user.id,
            doctor_id=doctor.id,
            service_id=service.id,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=service.duration_minutes),
            status=STATUS_CONFIRMED,
            price=service.price,
        )
        if intake is not None:
            appointment.patient_name = intake.patient_name
            appointment.patient_email = intake.patient_email
            appointment.patient_phone = intake.patient_phone
            appointment.patient_type = intake.patient_type
            appointment.consultation_mode = intake.consultation_mode
            appointment.reason = intake.reason
            appointment.details = intake_details(doctor, intake)
            appointment.consent_at = now
        try:
            with db.begin_nested():
                db.add(appointment)
                db.flush()
        except IntegrityError as exc:
            name = _constraint_name(exc)
            if name == "ex_appointments_doctor_overlap":
                db.rollback()
                raise BookingError(
                    409,
                    "Someone just booked this slot. Please pick another time.",
                    "slot_taken",
                ) from exc
            if name == "ex_appointments_patient_overlap":
                db.rollback()
                raise BookingError(
                    409,
                    "You already have another appointment at this time.",
                    "patient_overlap",
                ) from exc
            if name == "appointments_reference_key":
                continue  # astronomically unlikely reference collision: retry
            raise
        if referral is not None and referral_type is not None:
            db.add(
                AppointmentDocument(
                    appointment_id=appointment.id,
                    filename=_safe_filename(referral.filename),
                    content_type=referral_type,
                    size_bytes=len(referral.data),
                    data=referral.data,
                )
            )
        db.commit()
        db.refresh(appointment)
        return appointment

    raise BookingError(500, "Could not generate a booking reference.", "reference_exhausted")


def cancellation_deadline(appointment: Appointment) -> datetime:
    return appointment.starts_at - timedelta(hours=get_settings().cancellation_cutoff_hours)


def can_patient_cancel(appointment: Appointment, now: datetime) -> bool:
    return appointment.status == STATUS_CONFIRMED and now < cancellation_deadline(appointment)


def cancel_booking(
    db: Session,
    appointment: Appointment,
    by_user: User,
    now: datetime,
    reason: str | None = None,
    enforce_cutoff: bool = True,
) -> Appointment:
    if appointment.status == STATUS_CANCELLED:
        raise BookingError(409, "This appointment is already cancelled.", "already_cancelled")
    if appointment.starts_at <= now:
        raise BookingError(409, "Past appointments cannot be cancelled.", "in_past")
    if enforce_cutoff and now >= cancellation_deadline(appointment):
        hours = get_settings().cancellation_cutoff_hours
        raise BookingError(
            409,
            f"Appointments can only be cancelled up to {hours} hours before they start. "
            "Please contact the clinic.",
            "cutoff_passed",
        )
    appointment.status = STATUS_CANCELLED
    appointment.cancelled_at = now
    appointment.cancelled_by_id = by_user.id
    appointment.cancel_reason = reason
    db.commit()
    db.refresh(appointment)
    return appointment
