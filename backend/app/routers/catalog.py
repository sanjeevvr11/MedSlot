from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.db import get_db
from app.deps import utcnow
from app.models import Doctor, Service, Specialty
from app.schemas import CalendarDay, DaySlots, DoctorDetail, DoctorSummary, SpecialtyOut
from app.services.availability import booking_window, slots_for_range

router = APIRouter(tags=["catalog"])

# How far ahead to look when showing a doctor's "next available" slot.
NEXT_AVAILABLE_LOOKAHEAD_DAYS = 7


def _summary(db: Session, doctor: Doctor, detail: bool = False) -> dict:
    services = [s for s in doctor.services if s.is_active]
    data = DoctorSummary.model_validate(doctor).model_dump()
    data["price_from"] = float(min(s.price for s in services)) if services else None
    if services:
        now = utcnow()
        _, today, _ = booking_window(now)
        shortest = min(s.duration_minutes for s in services)
        days = slots_for_range(
            db, doctor, shortest, today, today + timedelta(days=NEXT_AVAILABLE_LOOKAHEAD_DAYS), now
        )
        data["next_available"] = next((s[0] for _, s in sorted(days.items()) if s), None)
    if detail:
        data.update(
            bio=doctor.bio,
            services=services,
            working_hours=doctor.working_hours,
            breaks=doctor.breaks,
        )
    return data


def _active_doctors():
    return (
        select(Doctor)
        .where(Doctor.is_active)
        .options(
            selectinload(Doctor.specialty),
            selectinload(Doctor.services),
            selectinload(Doctor.working_hours),
            selectinload(Doctor.breaks),
        )
    )


@router.get("/specialties", response_model=list[SpecialtyOut])
def list_specialties(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(
        select(Specialty, func.count(Doctor.id))
        .outerjoin(Doctor, (Doctor.specialty_id == Specialty.id) & Doctor.is_active)
        .group_by(Specialty.id)
        .order_by(Specialty.name)
    ).all()
    return [
        {**SpecialtyOut.model_validate(s).model_dump(), "doctor_count": count} for s, count in rows
    ]


@router.get("/doctors", response_model=list[DoctorSummary])
def list_doctors(
    q: str | None = Query(default=None, max_length=100),
    specialty: str | None = None,
    max_price: float | None = Query(default=None, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = _active_doctors().join(Doctor.specialty).order_by(Doctor.name)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Doctor.name.ilike(like),
                Specialty.name.ilike(like),
                Doctor.clinic_name.ilike(like),
                Doctor.location.ilike(like),
                Doctor.services.any(Service.name.ilike(like)),
            )
        )
    if specialty:
        stmt = stmt.where(Specialty.slug == specialty)
    if max_price is not None:
        stmt = stmt.where(Doctor.services.any((Service.price <= max_price) & Service.is_active))
    return [_summary(db, d) for d in db.scalars(stmt).unique()]


def _get_doctor(db: Session, slug: str) -> Doctor:
    doctor = db.scalar(_active_doctors().where(Doctor.slug == slug))
    if doctor is None:
        raise HTTPException(404, "Doctor not found.")
    return doctor


def _get_service(doctor: Doctor, service_id: int) -> Service:
    service = next((s for s in doctor.services if s.id == service_id and s.is_active), None)
    if service is None:
        raise HTTPException(404, "This doctor does not offer that consultation.")
    return service


@router.get("/doctors/{slug}", response_model=DoctorDetail)
def get_doctor(slug: str, db: Session = Depends(get_db)) -> dict:
    return _summary(db, _get_doctor(db, slug), detail=True)


@router.get("/doctors/{slug}/calendar", response_model=list[CalendarDay])
def doctor_calendar(slug: str, service_id: int, db: Session = Depends(get_db)) -> list[dict]:
    """Number of free slots for every bookable day, for greying out the calendar."""
    doctor = _get_doctor(db, slug)
    service = _get_service(doctor, service_id)
    now = utcnow()
    _, first, last = booking_window(now)
    days = slots_for_range(db, doctor, service.duration_minutes, first, last, now)
    return [{"date": d, "available": len(s)} for d, s in sorted(days.items())]


@router.get("/doctors/{slug}/slots", response_model=DaySlots)
def doctor_slots(
    slug: str, service_id: int, day: date = Query(alias="date"), db: Session = Depends(get_db)
) -> dict:
    doctor = _get_doctor(db, slug)
    service = _get_service(doctor, service_id)
    slots = slots_for_range(db, doctor, service.duration_minutes, day, day, utcnow()).get(day, [])
    return {"date": day, "timezone": get_settings().clinic_timezone, "slots": slots}
