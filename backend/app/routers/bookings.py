from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.deps import get_current_user, utcnow
from app.models import Appointment, Doctor, User
from app.schemas import AppointmentOut, BookingIn, CancelIn
from app.services.booking import (
    BookingError,
    can_patient_cancel,
    cancel_booking,
    cancellation_deadline,
    create_booking,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])


def booking_error(exc: BookingError) -> HTTPException:
    return HTTPException(exc.status_code, {"message": exc.message, "code": exc.code})


def serialize(appointment: Appointment, schema=AppointmentOut) -> dict:
    data = schema.model_validate(appointment).model_dump()
    data["can_cancel"] = can_patient_cancel(appointment, utcnow())
    data["cancel_deadline"] = cancellation_deadline(appointment)
    return data


def _with_relations():
    return select(Appointment).options(
        selectinload(Appointment.doctor).selectinload(Doctor.specialty),
        selectinload(Appointment.service),
    )


def _own_appointment(db: Session, user: User, reference: str) -> Appointment:
    # Filtering by user_id means another patient's reference looks like a 404.
    appointment = db.scalar(
        _with_relations().where(Appointment.reference == reference.upper(), Appointment.user_id == user.id)
    )
    if appointment is None:
        raise HTTPException(404, "Appointment not found.")
    return appointment


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def book(body: BookingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    try:
        appointment = create_booking(db, user, body.service_id, body.starts_at, utcnow())
    except BookingError as exc:
        raise booking_error(exc) from exc
    return serialize(_own_appointment(db, user, appointment.reference))


@router.get("/me", response_model=list[AppointmentOut])
def my_bookings(
    scope: str = Query(default="all", pattern="^(all|upcoming|past)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    now = utcnow()
    stmt = _with_relations().where(Appointment.user_id == user.id)
    if scope == "upcoming":
        stmt = stmt.where(Appointment.ends_at > now).order_by(Appointment.starts_at)
    elif scope == "past":
        stmt = stmt.where(Appointment.ends_at <= now).order_by(Appointment.starts_at.desc())
    else:
        stmt = stmt.order_by(Appointment.starts_at.desc())
    return [serialize(a) for a in db.scalars(stmt)]


@router.get("/{reference}", response_model=AppointmentOut)
def get_booking(reference: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return serialize(_own_appointment(db, user, reference))


@router.post("/{reference}/cancel", response_model=AppointmentOut)
def cancel(
    reference: str,
    body: CancelIn | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    appointment = _own_appointment(db, user, reference)
    try:
        cancel_booking(db, appointment, user, utcnow(), reason=body.reason if body else None)
    except BookingError as exc:
        raise booking_error(exc) from exc
    return serialize(_own_appointment(db, user, reference))
