import re
from datetime import date, datetime, time
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.security import USERNAME_RE, password_problems


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth ---------------------------------------------------------------------


class RegisterIn(BaseModel):
    username: str
    full_name: str = Field(min_length=2, max_length=100)
    password: str

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        value = value.strip().lower()
        if not USERNAME_RE.fullmatch(value):
            raise ValueError(
                "Username must be 3-30 characters: lowercase letters, numbers, dots or underscores."
            )
        return value

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please enter your full name.")
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        problems = password_problems(value)
        if problems:
            raise ValueError("Password must contain " + ", ".join(problems) + ".")
        return value


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORM):
    id: int
    username: str
    full_name: str
    role: str


# --- Catalogue ----------------------------------------------------------------


class SpecialtyOut(ORM):
    id: int
    name: str
    slug: str
    description: str
    icon: str
    doctor_count: int = 0


class SpecialtyBrief(ORM):
    name: str
    slug: str
    icon: str


class ServiceOut(ORM):
    id: int
    name: str
    description: str
    duration_minutes: int
    price: float


class DoctorSummary(ORM):
    id: int
    slug: str
    name: str
    qualifications: str
    years_experience: int
    languages: str
    clinic_name: str
    location: str
    accent: str
    specialty: SpecialtyBrief
    price_from: float | None = None
    next_available: datetime | None = None


class ScheduleWindow(ORM):
    weekday: int
    start_time: time
    end_time: time
    label: str | None = None


class DoctorDetail(DoctorSummary):
    bio: str
    services: list[ServiceOut]
    working_hours: list[ScheduleWindow]
    breaks: list[ScheduleWindow]


class CalendarDay(BaseModel):
    date: date
    available: int


class DaySlots(BaseModel):
    date: date
    timezone: str
    slots: list[datetime]


# --- Bookings -----------------------------------------------------------------


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
# Indian mobile numbers: optional +91 / 0 prefix, then 10 digits starting 6-9.
PHONE_RE = re.compile(r"^(?:\+?91|0)?([6-9]\d{9})$")
REFERENCE_RE = re.compile(r"^MS-[A-Z2-9]{6}$")


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class BookingIn(BaseModel):
    """Slot plus the intake form. Conditional rules (which follow-up questions
    apply) are checked in services.booking.intake_problems, which knows the doctor."""

    service_id: int
    starts_at: AwareDatetime
    patient_name: str
    patient_email: str
    patient_phone: str
    patient_type: Literal["first_time", "returning"]
    consultation_mode: Literal["in_person", "video", "phone"]
    reason: str
    consent: bool
    # Conditional answers
    previous_reference: str | None = None
    allergies: str | None = Field(default=None, max_length=300)
    video_platform: Literal["google_meet", "zoom", "whatsapp"] | None = None
    accessibility_needs: str | None = Field(default=None, max_length=200)
    child_name: str | None = Field(default=None, max_length=100)
    child_age: int | None = Field(default=None, ge=0, le=17)

    @field_validator("patient_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not 2 <= len(value) <= 100:
            raise ValueError("Enter the patient's full name.")
        return value

    @field_validator("patient_email")
    @classmethod
    def check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if len(value) > 254 or not EMAIL_RE.fullmatch(value):
            raise ValueError("Enter a valid email address.")
        return value

    @field_validator("patient_phone")
    @classmethod
    def check_phone(cls, value: str) -> str:
        match = PHONE_RE.fullmatch(re.sub(r"[\s()-]", "", value))
        if not match:
            raise ValueError("Enter a valid 10-digit Indian mobile number.")
        return "+91" + match.group(1)

    @field_validator("reason")
    @classmethod
    def check_reason(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Please describe the reason in at least 10 characters.")
        if len(value) > 1000:
            raise ValueError("Please keep the reason under 1000 characters.")
        return value

    @field_validator("previous_reference")
    @classmethod
    def check_reference(cls, value: str | None) -> str | None:
        value = _clean_text(value)
        if value is None:
            return None
        value = value.upper()
        if not REFERENCE_RE.fullmatch(value):
            raise ValueError("References look like MS-4K7Q9P.")
        return value

    @field_validator("allergies", "accessibility_needs", "child_name")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        return _clean_text(value)


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


class DoctorBrief(ORM):
    slug: str
    name: str
    qualifications: str
    clinic_name: str
    location: str
    accent: str
    specialty: SpecialtyBrief


class ServiceBrief(ORM):
    id: int
    name: str
    duration_minutes: int


class ReferralOut(ORM):
    filename: str
    content_type: str
    size_bytes: int


class AppointmentOut(ORM):
    id: int
    reference: str
    status: str
    starts_at: datetime
    ends_at: datetime
    price: float
    created_at: datetime
    cancelled_at: datetime | None
    cancel_reason: str | None
    doctor: DoctorBrief
    service: ServiceBrief
    patient_name: str | None = None
    patient_email: str | None = None
    patient_phone: str | None = None
    patient_type: str | None = None
    consultation_mode: str | None = None
    reason: str | None = None
    details: dict | None = None
    document: ReferralOut | None = None
    can_cancel: bool = False
    cancel_deadline: datetime | None = None


class PatientBrief(ORM):
    id: int
    username: str
    full_name: str


class AdminAppointmentOut(AppointmentOut):
    user: PatientBrief


# --- Admin --------------------------------------------------------------------


class TimeOffIn(BaseModel):
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    reason: str = Field(default="", max_length=200)


class TimeOffOut(ORM):
    id: int
    doctor_id: int
    starts_at: datetime
    ends_at: datetime
    reason: str


class AdminStats(BaseModel):
    doctors: int
    patients: int
    upcoming: int
    today: int
    cancelled_last_30_days: int
