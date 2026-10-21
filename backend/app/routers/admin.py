from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.deps import require_admin, utcnow
from app.models import (
    ROLE_PATIENT,
    STATUS_CANCELLED,
    STATUS_CONFIRMED,
    Appointment,
    Doctor,
    TimeOff,
    User,
)
from app.routers.bookings import booking_error, serialize
from app.schemas import AdminAppointmentOut, AdminStats, CancelIn, DoctorSummary, TimeOffIn, TimeOffOut
from app.services.availability import clinic_tz
from app.services.booking import BookingError, cancel_booking

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _appointments():
    return select(Appointment).options(
        selectinload(Appointment.doctor).selectinload(Doctor.specialty),
        selectinload(Appointment.service),
        selectinload(Appointment.user),
    )


@router.get("/stats", response_model=AdminStats)
def stats(db: Session = Depends(get_db)) -> dict:
    now = utcnow()
    tz = clinic_tz()
    today_start = datetime.combine(now.astimezone(tz).date(), time.min, tz)
    confirmed = Appointment.status == STATUS_CONFIRMED
    count = lambda *where: db.scalar(select(func.count()).select_from(Appointment).where(*where))  # noqa: E731
    return {
        "doctors": db.scalar(select(func.count()).select_from(Doctor).where(Doctor.is_active)),
        "patients": db.scalar(select(func.count()).select_from(User).where(User.role == ROLE_PATIENT)),
        "upcoming": count(confirmed, Appointment.starts_at > now),
        "today": count(
            confirmed,
            Appointment.starts_at >= today_start,
            Appointment.starts_at < today_start + timedelta(days=1),
        ),
        "cancelled_last_30_days": count(
            Appointment.status == STATUS_CANCELLED,
            Appointment.cancelled_at >= now - timedelta(days=30),
        ),
    }


@router.get("/doctors", response_model=list[DoctorSummary])
def doctors(db: Session = Depends(get_db)) -> list[Doctor]:
    return list(db.scalars(select(Doctor).options(selectinload(Doctor.specialty)).order_by(Doctor.name)))


@router.get("/appointments", response_model=list[AdminAppointmentOut])
def appointments(
    doctor: str | None = None,
    day: date | None = Query(default=None, alias="date"),
    status_filter: str | None = Query(default=None, alias="status", pattern="^(confirmed|cancelled)$"),
    upcoming_only: bool = False,
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = _appointments().join(Appointment.doctor)
    if doctor:
        stmt = stmt.where(Doctor.slug == doctor)
    if day:
        tz = clinic_tz()
        start = datetime.combine(day, time.min, tz)
        stmt = stmt.where(Appointment.starts_at >= start, Appointment.starts_at < start + timedelta(days=1))
    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)
    if upcoming_only:
        stmt = stmt.where(Appointment.starts_at > utcnow())
    stmt = stmt.order_by(Appointment.starts_at).limit(500)
    return [serialize(a, AdminAppointmentOut) for a in db.scalars(stmt)]


@router.post("/appointments/{appointment_id}/cancel", response_model=AdminAppointmentOut)
def cancel_appointment(
    appointment_id: int,
    body: CancelIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    appointment = db.scalar(_appointments().where(Appointment.id == appointment_id))
    if appointment is None:
        raise HTTPException(404, "Appointment not found.")
    try:
        cancel_booking(
            db, appointment, admin, utcnow(), reason=body.reason or "Cancelled by clinic", enforce_cutoff=False
        )
    except BookingError as exc:
        raise booking_error(exc) from exc
    return serialize(db.scalar(_appointments().where(Appointment.id == appointment_id)), AdminAppointmentOut)


def _doctor(db: Session, doctor_id: int) -> Doctor:
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(404, "Doctor not found.")
    return doctor


@router.get("/doctors/{doctor_id}/time-off", response_model=list[TimeOffOut])
def list_time_off(doctor_id: int, db: Session = Depends(get_db)) -> list[TimeOff]:
    _doctor(db, doctor_id)
    return list(
        db.scalars(
            select(TimeOff)
            .where(TimeOff.doctor_id == doctor_id, TimeOff.ends_at > utcnow())
            .order_by(TimeOff.starts_at)
        )
    )


@router.post("/doctors/{doctor_id}/time-off", response_model=TimeOffOut, status_code=status.HTTP_201_CREATED)
def add_time_off(doctor_id: int, body: TimeOffIn, db: Session = Depends(get_db)) -> TimeOff:
    """Block a period. Existing bookings inside it are kept; the response lets the
    admin see clashes in the appointments list and cancel them explicitly."""
    _doctor(db, doctor_id)
    if body.ends_at <= body.starts_at:
        raise HTTPException(422, "End must be after start.")
    if body.ends_at <= utcnow():
        raise HTTPException(422, "Time off must end in the future.")
    entry = TimeOff(doctor_id=doctor_id, starts_at=body.starts_at, ends_at=body.ends_at, reason=body.reason)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/time-off/{time_off_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time_off(time_off_id: int, db: Session = Depends(get_db)) -> None:
    entry = db.get(TimeOff, time_off_id)
    if entry is None:
        raise HTTPException(404, "Time off not found.")
    db.delete(entry)
    db.commit()
