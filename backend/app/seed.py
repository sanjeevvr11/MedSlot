"""Load demo data: specialties, fictional doctors, schedules and demo accounts.

    uv run python -m app.seed             # add anything missing (idempotent)
    uv run python -m app.seed --reset     # wipe all data first
    python -m app.seed --optional         # skip quietly if passwords aren't set (used on deploy)

Doctors and patients here are fictional. Account passwords come from
SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD (see .env.example).
"""

import os
import random
import sys
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import (
    ROLE_ADMIN,
    ROLE_PATIENT,
    STATUS_CONFIRMED,
    Appointment,
    Break,
    Doctor,
    Service,
    Specialty,
    User,
    WorkingHours,
)
from app.security import hash_password, new_booking_reference
from app.services.availability import clinic_tz, slots_for_range

SPECIALTIES = [
    ("General Medicine", "general-medicine", "stethoscope", "Everyday illnesses, check-ups and preventive care."),
    ("Cardiology", "cardiology", "heart-pulse", "Heart health, blood pressure and cardiac screening."),
    ("Dermatology", "dermatology", "scan-face", "Skin, hair and nail conditions."),
    ("Paediatrics", "paediatrics", "baby", "Care for infants, children and teenagers."),
    ("Orthopaedics", "orthopaedics", "bone", "Bones, joints, sports injuries and back pain."),
    ("Dental", "dental", "smile", "Check-ups, cleaning and dental treatment."),
]

# Weekly patterns: (weekdays, start, end, breaks as (start, end, label))
WEEKDAY_9_TO_5 = ([0, 1, 2, 3, 4], time(9), time(17), [(time(13), time(14), "Lunch")])
SATURDAY_MORNING = ([5], time(9), time(13), [])
LATE_SHIFT = ([0, 1, 2, 3, 4, 5], time(11), time(19), [(time(14, 30), time(15, 15), "Lunch")])
EVENINGS = ([0, 2, 4], time(16), time(20, 30), [(time(18), time(18, 15), "Tea break")])
MORNINGS = ([0, 1, 2, 3, 4, 5], time(8), time(13), [(time(10, 30), time(10, 45), "Rounds")])

DOCTORS = [
    {
        "name": "Dr. Ananya Rao",
        "specialty": "general-medicine",
        "qualifications": "MBBS, MD (Internal Medicine)",
        "years": 12,
        "languages": "English, Hindi, Kannada",
        "clinic": "MedSlot Care Clinic",
        "location": "Indiranagar, Bengaluru",
        "accent": "blue",
        "bio": "Dr. Rao focuses on preventive care and long-term management of lifestyle conditions such as diabetes and hypertension.",
        "schedule": [WEEKDAY_9_TO_5, SATURDAY_MORNING],
        "services": [
            ("General Consultation", "A full consultation for new symptoms or concerns.", 30, 600),
            ("Follow-up Visit", "Review of ongoing treatment or test results.", 15, 350),
            ("Annual Health Check", "Comprehensive yearly review with a personalised plan.", 45, 1200),
        ],
    },
    {
        "name": "Dr. Vikram Mehta",
        "specialty": "cardiology",
        "qualifications": "MBBS, MD, DM (Cardiology)",
        "years": 18,
        "languages": "English, Hindi, Gujarati",
        "clinic": "HeartWell Centre",
        "location": "Andheri West, Mumbai",
        "accent": "rose",
        "bio": "Dr. Mehta is an interventional cardiologist with a special interest in preventive cardiology and heart-failure care.",
        "schedule": [LATE_SHIFT],
        "services": [
            ("Cardiology Consultation", "Assessment of chest pain, palpitations or heart risk.", 30, 1500),
            ("BP & Heart Review", "Blood pressure and medication review.", 20, 900),
        ],
    },
    {
        "name": "Dr. Kavya Iyer",
        "specialty": "dermatology",
        "qualifications": "MBBS, MD (Dermatology)",
        "years": 9,
        "languages": "English, Tamil, Hindi",
        "clinic": "ClearSkin Dermatology",
        "location": "Adyar, Chennai",
        "accent": "violet",
        "bio": "Dr. Iyer treats acne, eczema, psoriasis and hair-loss conditions with an emphasis on evidence-based skincare.",
        "schedule": [WEEKDAY_9_TO_5],
        "services": [
            ("Skin Consultation", "Diagnosis and treatment plan for skin concerns.", 30, 800),
            ("Hair & Scalp Review", "Assessment of hair fall and scalp conditions.", 20, 700),
        ],
    },
    {
        "name": "Dr. Arjun Nair",
        "specialty": "paediatrics",
        "qualifications": "MBBS, DCH, MD (Paediatrics)",
        "years": 14,
        "languages": "English, Malayalam, Hindi",
        "clinic": "Little Steps Children's Clinic",
        "location": "Kakkanad, Kochi",
        "accent": "amber",
        "bio": "Dr. Nair cares for children from newborns to teens, covering growth, vaccinations and common childhood illnesses.",
        "schedule": [MORNINGS],
        "services": [
            ("Child Consultation", "Check-up or illness visit for children.", 20, 600),
            ("Vaccination Visit", "Scheduled immunisation with a brief review.", 15, 400),
        ],
    },
    {
        "name": "Dr. Sameer Khan",
        "specialty": "orthopaedics",
        "qualifications": "MBBS, MS (Orthopaedics)",
        "years": 11,
        "languages": "English, Hindi, Urdu",
        "clinic": "MotionCare Ortho",
        "location": "Banjara Hills, Hyderabad",
        "accent": "emerald",
        "bio": "Dr. Khan specialises in sports injuries, knee and shoulder problems, and non-surgical management of back pain.",
        "schedule": [WEEKDAY_9_TO_5, SATURDAY_MORNING],
        "services": [
            ("Orthopaedic Consultation", "Assessment of joint, bone or muscle pain.", 30, 1000),
            ("Sports Injury Review", "Evaluation and recovery plan for sports injuries.", 45, 1400),
        ],
    },
    {
        "name": "Dr. Priya Desai",
        "specialty": "dental",
        "qualifications": "BDS, MDS (Conservative Dentistry)",
        "years": 8,
        "languages": "English, Marathi, Hindi",
        "clinic": "BrightSmile Dental Studio",
        "location": "Koregaon Park, Pune",
        "accent": "sky",
        "bio": "Dr. Desai provides gentle, preventive-first dental care including check-ups, fillings and root canal treatment.",
        "schedule": [LATE_SHIFT],
        "services": [
            ("Dental Check-up", "Examination and oral health advice.", 20, 500),
            ("Scaling & Cleaning", "Professional cleaning and polishing.", 45, 1500),
        ],
    },
    {
        "name": "Dr. Rohan Sharma",
        "specialty": "general-medicine",
        "qualifications": "MBBS, DNB (Family Medicine)",
        "years": 7,
        "languages": "English, Hindi, Punjabi",
        "clinic": "CityCare Family Clinic",
        "location": "Saket, New Delhi",
        "accent": "teal",
        "bio": "Dr. Sharma is a family physician offering after-work evening consultations for working professionals.",
        "schedule": [EVENINGS],
        "services": [
            ("Evening Consultation", "General consultation after working hours.", 20, 500),
            ("Follow-up Visit", "Review of ongoing treatment or reports.", 15, 300),
        ],
    },
    {
        "name": "Dr. Meera Krishnan",
        "specialty": "cardiology",
        "qualifications": "MBBS, MD, DNB (Cardiology)",
        "years": 15,
        "languages": "English, Tamil, Telugu",
        "clinic": "Pulse Heart Clinic",
        "location": "Jubilee Hills, Hyderabad",
        "accent": "indigo",
        "bio": "Dr. Krishnan runs a women's heart-health programme and manages arrhythmias and high blood pressure.",
        "schedule": [MORNINGS],
        "services": [
            ("Cardiology Consultation", "Full cardiac assessment and plan.", 30, 1400),
            ("ECG Review", "Review of ECG and related reports.", 15, 600),
        ],
    },
]

FILLER_PATIENTS = [
    ("aarav.k", "Aarav Kulkarni"),
    ("diya.s", "Diya Sen"),
    ("ishaan.p", "Ishaan Patel"),
    ("nisha.r", "Nisha Reddy"),
    ("kabir.m", "Kabir Malhotra"),
    ("tara.j", "Tara Joshi"),
]


def _password(env_name: str) -> str:
    value = os.environ.get(env_name)
    if not value:
        if "--optional" in sys.argv:
            print(f"{env_name} not set; skipping demo seed.")
            sys.exit(0)
        sys.exit(f"Set {env_name} (see backend/.env.example) before seeding.")
    return value


def _upsert_user(db: Session, username: str, full_name: str, password: str, role: str) -> User:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(username=username, full_name=full_name, role=role, password_hash=hash_password(password))
        db.add(user)
        db.flush()
    return user


def seed_catalogue(db: Session) -> None:
    specialties = {}
    for name, slug, icon, description in SPECIALTIES:
        spec = db.scalar(select(Specialty).where(Specialty.slug == slug))
        if spec is None:
            spec = Specialty(name=name, slug=slug, icon=icon, description=description)
            db.add(spec)
            db.flush()
        specialties[slug] = spec

    for d in DOCTORS:
        slug = d["name"].lower().replace("dr. ", "").replace(" ", "-")
        if db.scalar(select(Doctor.id).where(Doctor.slug == slug)):
            continue
        doctor = Doctor(
            name=d["name"],
            slug=slug,
            specialty_id=specialties[d["specialty"]].id,
            qualifications=d["qualifications"],
            years_experience=d["years"],
            languages=d["languages"],
            clinic_name=d["clinic"],
            location=d["location"],
            accent=d["accent"],
            bio=d["bio"],
        )
        db.add(doctor)
        db.flush()
        for name, description, minutes, price in d["services"]:
            db.add(
                Service(
                    doctor_id=doctor.id,
                    name=name,
                    description=description,
                    duration_minutes=minutes,
                    price=Decimal(price),
                )
            )
        for weekdays, start, end, breaks in d["schedule"]:
            for wd in weekdays:
                db.add(WorkingHours(doctor_id=doctor.id, weekday=wd, start_time=start, end_time=end))
                for b_start, b_end, label in breaks:
                    db.add(Break(doctor_id=doctor.id, weekday=wd, start_time=b_start, end_time=b_end, label=label))
    db.commit()


def seed_bookings(db: Session, patients: list[User]) -> None:
    """Fill roughly a quarter of the next week's slots so the calendar looks lived-in."""
    if db.scalar(select(Appointment.id).limit(1)):
        return
    rng = random.Random(42)
    now = datetime.now(UTC)
    today = now.astimezone(clinic_tz()).date()
    for doctor in db.scalars(select(Doctor)):
        service = min(doctor.services, key=lambda s: s.duration_minutes)
        days = slots_for_range(db, doctor, service.duration_minutes, today, today + timedelta(days=7), now)
        for slots in days.values():
            for start in slots:
                if rng.random() > 0.25:
                    continue
                appointment = Appointment(
                    reference=new_booking_reference(),
                    user_id=rng.choice(patients).id,
                    doctor_id=doctor.id,
                    service_id=service.id,
                    starts_at=start,
                    ends_at=start + timedelta(minutes=service.duration_minutes),
                    status=STATUS_CONFIRMED,
                    price=service.price,
                )
                try:
                    with db.begin_nested():
                        db.add(appointment)
                except IntegrityError:
                    pass  # overlaps an earlier random pick; skip it
    db.commit()


def main() -> None:
    reset = "--reset" in sys.argv
    admin_password = _password("SEED_ADMIN_PASSWORD")
    demo_password = _password("SEED_DEMO_PASSWORD")
    print(f"Seeding {get_settings().database_url.split('@')[-1]}")
    with SessionLocal() as db:
        if reset:
            db.execute(
                text(
                    "TRUNCATE appointments, time_off, breaks, working_hours, services, doctors, "
                    "specialties, sessions, users RESTART IDENTITY CASCADE"
                )
            )
            db.commit()
        seed_catalogue(db)
        _upsert_user(db, "admin", "Clinic Admin", admin_password, ROLE_ADMIN)
        _upsert_user(db, "demo.patient", "Demo Patient", demo_password, ROLE_PATIENT)
        fillers = [_upsert_user(db, u, n, demo_password, ROLE_PATIENT) for u, n in FILLER_PATIENTS]
        db.commit()
        seed_bookings(db, fillers)
        counts = {
            table: db.scalar(text(f"SELECT count(*) FROM {table}"))
            for table in ("specialties", "doctors", "services", "users", "appointments")
        }
    print("Done:", ", ".join(f"{v} {k}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
