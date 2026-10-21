from datetime import UTC, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import STATUS_CANCELLED, STATUS_CONFIRMED, Appointment, Service, User
from app.security import new_booking_reference
from app.services.availability import clinic_tz, slots_for_range


class BookingError(Exception):
    def __init__(self, status_code: int, message: str, code: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code


def _constraint_name(exc: IntegrityError) -> str | None:
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None)


def create_booking(
    db: Session, user: User, service_id: int, starts_at: datetime, now: datetime
) -> Appointment:
    """Book `service_id` at `starts_at` for `user`, re-checking everything server-side.

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
