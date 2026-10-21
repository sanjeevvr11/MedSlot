from datetime import date, datetime, time

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


class BookingIn(BaseModel):
    service_id: int
    starts_at: AwareDatetime


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
