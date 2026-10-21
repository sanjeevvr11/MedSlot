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
# Two clinic sessions a day with a long gap, common for doctors who also work in hospitals.
SPLIT_MORNING = ([0, 1, 2, 3, 4, 5], time(9), time(12, 30), [])
SPLIT_EVENING = ([0, 1, 2, 3, 4], time(17), time(20), [])
WEEKENDS = ([5, 6], time(10), time(16), [(time(13), time(13, 30), "Lunch")])

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
    {
        "name": "Dr. Farhan Siddiqui",
        "specialty": "general-medicine",
        "qualifications": "MBBS, MD (General Medicine)",
        "years": 16,
        "languages": "English, Hindi, Urdu",
        "clinic": "Gomti Family Health Centre",
        "location": "Gomti Nagar, Lucknow",
        "accent": "sky",
        "bio": "Dr. Siddiqui manages diabetes, thyroid disorders and seasonal infections, with a focus on clear explanations and practical lifestyle advice.",
        "schedule": [WEEKDAY_9_TO_5, SATURDAY_MORNING],
        "services": [
            ("General Consultation", "A full consultation for new symptoms or concerns.", 30, 500),
            ("Follow-up Visit", "Review of ongoing treatment or test results.", 15, 300),
            ("Diabetes Review", "Sugar levels, medication and diet review.", 30, 700),
        ],
    },
    {
        "name": "Dr. Deepa Varghese",
        "specialty": "general-medicine",
        "qualifications": "MBBS, DNB (Family Medicine)",
        "years": 10,
        "languages": "English, Malayalam, Tamil",
        "clinic": "Wellspring Family Clinic",
        "location": "Vazhuthacaud, Thiruvananthapuram",
        "accent": "rose",
        "bio": "Dr. Varghese is a family physician caring for patients of all ages, from routine check-ups to managing long-term conditions.",
        "schedule": [SPLIT_MORNING, SPLIT_EVENING],
        "services": [
            ("General Consultation", "Consultation for new symptoms or health concerns.", 20, 450),
            ("Follow-up Visit", "Review of ongoing treatment or reports.", 15, 250),
        ],
    },
    {
        "name": "Dr. Gurpreet Singh Bedi",
        "specialty": "general-medicine",
        "qualifications": "MBBS, MD (Internal Medicine)",
        "years": 21,
        "languages": "English, Hindi, Punjabi",
        "clinic": "Sector 17 Health Hub",
        "location": "Sector 17, Chandigarh",
        "accent": "indigo",
        "bio": "Dr. Bedi has two decades of experience in internal medicine and runs a dedicated preventive health programme for senior citizens.",
        "schedule": [MORNINGS],
        "services": [
            ("General Consultation", "A detailed consultation with an experienced physician.", 30, 800),
            ("Senior Citizen Check-up", "Comprehensive review for patients over 60.", 45, 1300),
        ],
    },
    {
        "name": "Dr. Neha Agarwal",
        "specialty": "general-medicine",
        "qualifications": "MBBS, MD (General Medicine)",
        "years": 6,
        "languages": "English, Hindi, Bengali",
        "clinic": "Salt Lake City Clinic",
        "location": "Salt Lake, Kolkata",
        "accent": "teal",
        "bio": "Dr. Agarwal offers weekend and evening consultations for fevers, infections and everyday health problems.",
        "schedule": [WEEKENDS, EVENINGS],
        "services": [
            ("General Consultation", "Consultation for new symptoms or concerns.", 20, 400),
            ("Fever & Infection Visit", "Quick assessment of fever, cough or infection.", 15, 350),
        ],
    },
    {
        "name": "Dr. Thomas Kurian",
        "specialty": "cardiology",
        "qualifications": "MBBS, MD, DM (Cardiology)",
        "years": 24,
        "languages": "English, Malayalam, Hindi",
        "clinic": "Kochi Heart Institute",
        "location": "Edappally, Kochi",
        "accent": "rose",
        "bio": "Dr. Kurian is a senior cardiologist experienced in coronary artery disease, heart failure and cardiac rehabilitation.",
        "schedule": [WEEKDAY_9_TO_5],
        "services": [
            ("Cardiology Consultation", "Assessment of chest pain, breathlessness or heart risk.", 30, 1600),
            ("Echo Report Review", "Review of echocardiogram and related reports.", 20, 900),
        ],
    },
    {
        "name": "Dr. Ayesha Qureshi",
        "specialty": "cardiology",
        "qualifications": "MBBS, MD, DNB (Cardiology)",
        "years": 12,
        "languages": "English, Hindi, Urdu, Marathi",
        "clinic": "Pulse Point Cardiac Care",
        "location": "Bandra West, Mumbai",
        "accent": "violet",
        "bio": "Dr. Qureshi focuses on preventive cardiology, high blood pressure and cholesterol management for working professionals.",
        "schedule": [SPLIT_MORNING, SPLIT_EVENING],
        "services": [
            ("Cardiology Consultation", "Full cardiac assessment and treatment plan.", 30, 1500),
            ("Preventive Heart Check", "Risk assessment with lifestyle and screening advice.", 45, 2200),
        ],
    },
    {
        "name": "Dr. Sandeep Rathore",
        "specialty": "cardiology",
        "qualifications": "MBBS, MD, DM (Cardiology)",
        "years": 9,
        "languages": "English, Hindi, Marwari",
        "clinic": "Pink City Heart Clinic",
        "location": "C-Scheme, Jaipur",
        "accent": "amber",
        "bio": "Dr. Rathore treats arrhythmias, hypertension and heart-valve conditions and works closely with patients on long-term care plans.",
        "schedule": [LATE_SHIFT],
        "services": [
            ("Cardiology Consultation", "Assessment of heart symptoms and risk factors.", 30, 1200),
            ("BP & Heart Review", "Blood pressure and medication review.", 20, 700),
        ],
    },
    {
        "name": "Dr. Sneha Kulkarni",
        "specialty": "dermatology",
        "qualifications": "MBBS, DDVL",
        "years": 11,
        "languages": "English, Marathi, Hindi",
        "clinic": "SkinFirst Clinic",
        "location": "Baner, Pune",
        "accent": "violet",
        "bio": "Dr. Kulkarni specialises in acne, pigmentation and sensitive skin, with an emphasis on simple, sustainable skincare routines.",
        "schedule": [LATE_SHIFT],
        "services": [
            ("Skin Consultation", "Diagnosis and treatment plan for skin concerns.", 30, 900),
            ("Acne Follow-up", "Progress review of ongoing acne treatment.", 15, 500),
        ],
    },
    {
        "name": "Dr. Imran Shaikh",
        "specialty": "dermatology",
        "qualifications": "MBBS, MD (Dermatology)",
        "years": 15,
        "languages": "English, Hindi, Urdu, Gujarati",
        "clinic": "DermaCare Studio",
        "location": "Navrangpura, Ahmedabad",
        "accent": "teal",
        "bio": "Dr. Shaikh treats psoriasis, fungal infections and hair loss, and has a special interest in scalp and nail disorders.",
        "schedule": [WEEKDAY_9_TO_5, SATURDAY_MORNING],
        "services": [
            ("Skin Consultation", "Assessment of skin, hair or nail conditions.", 30, 850),
            ("Hair Loss Consultation", "Evaluation of hair fall with a treatment plan.", 30, 1000),
        ],
    },
    {
        "name": "Dr. Anjali Bhat",
        "specialty": "dermatology",
        "qualifications": "MBBS, MD (Dermatology)",
        "years": 7,
        "languages": "English, Kannada, Konkani",
        "clinic": "Glow Skin & Hair Clinic",
        "location": "Kadri, Mangaluru",
        "accent": "rose",
        "bio": "Dr. Bhat manages eczema, allergies and childhood skin conditions with gentle, evidence-based treatments.",
        "schedule": [MORNINGS],
        "services": [
            ("Skin Consultation", "Diagnosis and treatment plan for skin concerns.", 20, 700),
            ("Allergy & Eczema Review", "Follow-up for allergic and eczema-prone skin.", 20, 700),
        ],
    },
    {
        "name": "Dr. Kavitha Reddy",
        "specialty": "paediatrics",
        "qualifications": "MBBS, MD (Paediatrics)",
        "years": 13,
        "languages": "English, Telugu, Hindi",
        "clinic": "Tiny Toes Children's Clinic",
        "location": "Kondapur, Hyderabad",
        "accent": "amber",
        "bio": "Dr. Reddy looks after newborns, toddlers and school-age children, covering growth, development and vaccinations.",
        "schedule": [WEEKDAY_9_TO_5, SATURDAY_MORNING],
        "services": [
            ("Child Consultation", "Check-up or illness visit for children.", 20, 700),
            ("Vaccination Visit", "Scheduled immunisation with a brief review.", 15, 450),
            ("Newborn Check-up", "Thorough check-up for babies under 3 months.", 30, 900),
        ],
    },
    {
        "name": "Dr. Manish Tiwari",
        "specialty": "paediatrics",
        "qualifications": "MBBS, DCH, DNB (Paediatrics)",
        "years": 18,
        "languages": "English, Hindi, Bhojpuri",
        "clinic": "Bal Seva Child Care",
        "location": "Boring Road, Patna",
        "accent": "sky",
        "bio": "Dr. Tiwari is an experienced paediatrician known for managing childhood asthma, allergies and recurrent infections.",
        "schedule": [SPLIT_MORNING, SPLIT_EVENING],
        "services": [
            ("Child Consultation", "Check-up or illness visit for children.", 20, 500),
            ("Vaccination Visit", "Scheduled immunisation with a brief review.", 15, 300),
        ],
    },
    {
        "name": "Dr. Ritu Saxena",
        "specialty": "paediatrics",
        "qualifications": "MBBS, MD (Paediatrics), Fellowship in Neonatology",
        "years": 10,
        "languages": "English, Hindi",
        "clinic": "Little Lotus Clinic",
        "location": "Arera Colony, Bhopal",
        "accent": "emerald",
        "bio": "Dr. Saxena has neonatal intensive care experience and supports parents with feeding, growth and early development.",
        "schedule": [MORNINGS, EVENINGS],
        "services": [
            ("Child Consultation", "Check-up or illness visit for children.", 20, 600),
            ("Growth & Nutrition Review", "Growth tracking with feeding and diet advice.", 30, 800),
        ],
    },
    {
        "name": "Dr. Vivek Chauhan",
        "specialty": "orthopaedics",
        "qualifications": "MBBS, MS (Orthopaedics)",
        "years": 19,
        "languages": "English, Hindi, Garhwali",
        "clinic": "BoneWise Ortho Centre",
        "location": "Rajpur Road, Dehradun",
        "accent": "indigo",
        "bio": "Dr. Chauhan treats fractures, arthritis and joint injuries, and guides patients through recovery after orthopaedic surgery.",
        "schedule": [WEEKDAY_9_TO_5],
        "services": [
            ("Orthopaedic Consultation", "Assessment of bone, joint or muscle pain.", 30, 900),
            ("Fracture Follow-up", "Review of healing and plaster or splint care.", 15, 500),
        ],
    },
    {
        "name": "Dr. Harini Subramanian",
        "specialty": "orthopaedics",
        "qualifications": "MBBS, MS (Orthopaedics), DNB",
        "years": 8,
        "languages": "English, Tamil",
        "clinic": "Stride Sports Clinic",
        "location": "Anna Nagar, Chennai",
        "accent": "emerald",
        "bio": "Dr. Subramanian works with runners and athletes on ligament injuries, tendon problems and return-to-sport plans.",
        "schedule": [LATE_SHIFT],
        "services": [
            ("Sports Injury Review", "Evaluation and recovery plan for sports injuries.", 45, 1500),
            ("Orthopaedic Consultation", "Assessment of joint, bone or muscle pain.", 30, 1000),
        ],
    },
    {
        "name": "Dr. Arvind Joshi",
        "specialty": "orthopaedics",
        "qualifications": "MBBS, MS (Orthopaedics), MCh (Spine)",
        "years": 25,
        "languages": "English, Hindi, Marathi",
        "clinic": "SpineCare Clinic",
        "location": "Dharampeth, Nagpur",
        "accent": "sky",
        "bio": "Dr. Joshi is a spine specialist treating back and neck pain, sciatica and posture-related problems, preferring non-surgical care first.",
        "schedule": [MORNINGS],
        "services": [
            ("Spine & Back Pain Consultation", "Assessment of back, neck or nerve pain.", 30, 1200),
            ("Joint Pain Review", "Follow-up for knee, hip or shoulder pain.", 20, 800),
        ],
    },
    {
        "name": "Dr. Nikhil Jain",
        "specialty": "dental",
        "qualifications": "BDS, MDS (Orthodontics)",
        "years": 10,
        "languages": "English, Hindi",
        "clinic": "AlignRight Dental",
        "location": "Vijay Nagar, Indore",
        "accent": "blue",
        "bio": "Dr. Jain is an orthodontist offering braces and clear aligners for teenagers and adults.",
        "schedule": [LATE_SHIFT],
        "services": [
            ("Dental Check-up", "Examination and oral health advice.", 20, 400),
            ("Braces Consultation", "Assessment for braces or clear aligners.", 30, 800),
        ],
    },
    {
        "name": "Dr. Shalini Rao",
        "specialty": "dental",
        "qualifications": "BDS, MDS (Paediatric Dentistry)",
        "years": 9,
        "languages": "English, Kannada, Hindi",
        "clinic": "Happy Teeth Kids Dental",
        "location": "Jayanagar, Bengaluru",
        "accent": "amber",
        "bio": "Dr. Rao makes dental visits easy for children, with preventive care, fillings and habit counselling.",
        "schedule": [WEEKDAY_9_TO_5, SATURDAY_MORNING],
        "services": [
            ("Child Dental Check-up", "Gentle examination and cleaning advice for children.", 20, 500),
            ("Fluoride & Sealant Visit", "Preventive treatment to protect children's teeth.", 30, 1200),
        ],
    },
    {
        "name": "Dr. Rohit Malhotra",
        "specialty": "dental",
        "qualifications": "BDS, MDS (Prosthodontics)",
        "years": 14,
        "languages": "English, Hindi, Punjabi",
        "clinic": "SmileCraft Dental",
        "location": "Rajouri Garden, New Delhi",
        "accent": "indigo",
        "bio": "Dr. Malhotra restores damaged and missing teeth with crowns, bridges and implants.",
        "schedule": [SPLIT_MORNING, SPLIT_EVENING],
        "services": [
            ("Dental Check-up", "Examination and oral health advice.", 20, 500),
            ("Root Canal Consultation", "Assessment of tooth pain and root canal planning.", 30, 900),
            ("Implant Consultation", "Evaluation for dental implants.", 30, 1000),
        ],
    },
    {
        "name": "Dr. Fatima Ansari",
        "specialty": "dental",
        "qualifications": "BDS, MDS (Periodontics)",
        "years": 6,
        "languages": "English, Hindi, Urdu",
        "clinic": "Pearl Dental Care",
        "location": "Mehdipatnam, Hyderabad",
        "accent": "teal",
        "bio": "Dr. Ansari focuses on gum health, bleeding gums and professional cleaning, with weekend appointments available.",
        "schedule": [WEEKENDS, EVENINGS],
        "services": [
            ("Scaling & Cleaning", "Professional cleaning and polishing.", 45, 1400),
            ("Gum Health Check", "Assessment of gum bleeding or sensitivity.", 20, 600),
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
    """Fill roughly a quarter of the next week's slots so calendars look lived-in.

    Only doctors without any bookings are filled, so re-running the seed after
    adding doctors gives the new ones some bookings without touching the rest.
    """
    already_booked = set(db.scalars(select(Appointment.doctor_id).distinct()))
    rng = random.Random(42)
    now = datetime.now(UTC)
    today = now.astimezone(clinic_tz()).date()
    for doctor in db.scalars(select(Doctor).order_by(Doctor.id)):
        if doctor.id in already_booked:
            continue
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
