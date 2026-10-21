from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.models import Appointment, Doctor, Specialty, User
from app.seed import DOCTORS, FILLER_PATIENTS, SPECIALTIES, seed_bookings, seed_catalogue
from app.security import hash_password
from app.services.availability import booking_window, slots_for_range


def test_catalogue_is_complete_and_bookable(db):
    seed_catalogue(db)
    assert db.scalar(select(func.count()).select_from(Specialty)) == len(SPECIALTIES)
    doctors = list(db.scalars(select(Doctor)))
    assert len(doctors) == len(DOCTORS)

    now = datetime.now(UTC)
    _, today, _ = booking_window(now)
    for doctor in doctors:
        assert doctor.services, doctor.name
        assert doctor.working_hours, doctor.name
        shortest = min(s.duration_minutes for s in doctor.services)
        week = slots_for_range(db, doctor, shortest, today, today + timedelta(days=7), now)
        assert any(week.values()), f"{doctor.name} has no bookable slots in the next week"


def test_seeding_twice_adds_nothing_new(db):
    seed_catalogue(db)
    seed_catalogue(db)
    assert db.scalar(select(func.count()).select_from(Doctor)) == len(DOCTORS)


def test_sample_bookings_only_fill_doctors_without_bookings(db):
    seed_catalogue(db)
    patients = [User(username=u, full_name=n, password_hash=hash_password("x1234567")) for u, n in FILLER_PATIENTS]
    db.add_all(patients)
    db.commit()

    seed_bookings(db, patients)
    first = db.scalar(select(func.count()).select_from(Appointment))
    booked = set(db.scalars(select(Appointment.doctor_id).distinct()))
    assert first > 0 and len(booked) == len(DOCTORS)

    seed_bookings(db, patients)
    assert db.scalar(select(func.count()).select_from(Appointment)) == first
