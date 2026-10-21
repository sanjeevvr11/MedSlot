import json
import os

# Must be set before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg:///medslot_test")

from datetime import UTC, datetime, time, timedelta  # noqa: E402
from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import ROLE_ADMIN, Doctor, Service, Specialty, User, WorkingHours, Break  # noqa: E402
from app.security import hash_password, login_throttle  # noqa: E402
from app.services.availability import clinic_tz  # noqa: E402

PASSWORD = "Testpass123"
HEADERS = {"X-Requested-With": "MedSlot"}
TABLES = "appointments, time_off, breaks, working_hours, services, doctors, specialties, sessions, users"


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_db():
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    login_throttle.reset()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def catalogue(db):
    """One doctor working 09:00-17:00 every day with a 13:00-14:00 lunch break."""
    spec = Specialty(name="General Medicine", slug="general-medicine", icon="stethoscope")
    db.add(spec)
    db.flush()
    doctor = Doctor(
        name="Dr. Test",
        slug="test",
        specialty_id=spec.id,
        qualifications="MBBS",
        clinic_name="Test Clinic",
        location="Testville",
    )
    db.add(doctor)
    db.flush()
    service = Service(doctor_id=doctor.id, name="Consultation", duration_minutes=30, price=Decimal(500))
    db.add(service)
    for wd in range(7):
        db.add(WorkingHours(doctor_id=doctor.id, weekday=wd, start_time=time(9), end_time=time(17)))
        db.add(Break(doctor_id=doctor.id, weekday=wd, start_time=time(13), end_time=time(14), label="Lunch"))
    db.commit()
    return {"doctor": doctor, "service": service}


def local_slot(days_ahead: int, hour: int, minute: int = 0) -> datetime:
    """A clinic-local wall-clock time `days_ahead` days from today, as UTC."""
    tz = clinic_tz()
    day = datetime.now(tz).date() + timedelta(days=days_ahead)
    return datetime.combine(day, time(hour, minute), tz).astimezone(UTC)


def make_user(db, username: str, role: str = "patient") -> User:
    user = User(username=username, full_name=username.title(), password_hash=hash_password(PASSWORD), role=role)
    db.add(user)
    db.commit()
    return user


def login_client(username: str) -> TestClient:
    client = TestClient(app, headers=HEADERS)
    resp = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return client


@pytest.fixture
def client():
    return TestClient(app, headers=HEADERS)


@pytest.fixture
def patient(db):
    make_user(db, "alice")
    return login_client("alice")


@pytest.fixture
def admin(db):
    make_user(db, "boss", role=ROLE_ADMIN)
    return login_client("boss")


VALID_INTAKE = {
    "patient_name": "Alice Patient",
    "patient_email": "alice@example.com",
    "patient_phone": "98765 43210",
    "patient_type": "first_time",
    "consultation_mode": "in_person",
    "reason": "Persistent cough for two weeks.",
    "consent": True,
}


def post_booking(client, payload: dict, referral: tuple[str, bytes, str] | None = None):
    """POST /api/bookings the way the frontend does: multipart with a JSON `data` part."""
    body = {**VALID_INTAKE, **payload}
    files = {"referral": referral} if referral else None
    return client.post("/api/bookings", data={"data": json.dumps(body)}, files=files)

