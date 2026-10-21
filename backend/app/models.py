from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

ROLE_PATIENT = "patient"
ROLE_ADMIN = "admin"
STATUS_CONFIRMED = "confirmed"
STATUS_CANCELLED = "cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(30), unique=True)
    full_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=ROLE_PATIENT)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint(f"role IN ('{ROLE_PATIENT}', '{ROLE_ADMIN}')", name="ck_users_role"),
    )


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # SHA-256 of the cookie token; the raw token is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]

    user: Mapped[User] = relationship()


class Specialty(Base):
    __tablename__ = "specialties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(40), default="stethoscope")


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(primary_key=True)
    specialty_id: Mapped[int] = mapped_column(ForeignKey("specialties.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    qualifications: Mapped[str] = mapped_column(String(200))
    bio: Mapped[str] = mapped_column(Text, default="")
    years_experience: Mapped[int] = mapped_column(default=0)
    languages: Mapped[str] = mapped_column(String(200), default="English")
    clinic_name: Mapped[str] = mapped_column(String(150))
    location: Mapped[str] = mapped_column(String(150))
    accent: Mapped[str] = mapped_column(String(20), default="blue")
    is_active: Mapped[bool] = mapped_column(default=True)

    specialty: Mapped[Specialty] = relationship()
    services: Mapped[list["Service"]] = relationship(
        back_populates="doctor", order_by="Service.duration_minutes"
    )
    working_hours: Mapped[list["WorkingHours"]] = relationship(
        order_by="(WorkingHours.weekday, WorkingHours.start_time)"
    )
    breaks: Mapped[list["Break"]] = relationship(order_by="(Break.weekday, Break.start_time)")


class Service(Base):
    """A consultation type offered by a doctor."""

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    duration_minutes: Mapped[int]
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(default=True)

    doctor: Mapped[Doctor] = relationship(back_populates="services")

    __table_args__ = (
        CheckConstraint("duration_minutes BETWEEN 5 AND 240", name="ck_services_duration"),
        CheckConstraint("price >= 0", name="ck_services_price"),
    )


class WorkingHours(Base):
    """Weekly recurring working window, in clinic local time. weekday: 0 = Monday."""

    __tablename__ = "working_hours"

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), index=True)
    weekday: Mapped[int]
    start_time: Mapped[time]
    end_time: Mapped[time]

    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_working_hours_weekday"),
        CheckConstraint("start_time < end_time", name="ck_working_hours_order"),
    )


class Break(Base):
    """Weekly recurring break (e.g. lunch), in clinic local time."""

    __tablename__ = "breaks"

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), index=True)
    weekday: Mapped[int]
    start_time: Mapped[time]
    end_time: Mapped[time]
    label: Mapped[str] = mapped_column(String(60), default="Break")

    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_breaks_weekday"),
        CheckConstraint("start_time < end_time", name="ck_breaks_order"),
    )


class TimeOff(Base):
    """One-off unavailable period (leave, conference, emergency)."""

    __tablename__ = "time_off"

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), index=True)
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    reason: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (CheckConstraint("starts_at < ends_at", name="ck_time_off_order"),)


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(12), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    status: Mapped[str] = mapped_column(String(20), default=STATUS_CONFIRMED)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    cancelled_at: Mapped[datetime | None]
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    cancel_reason: Mapped[str | None] = mapped_column(String(200))

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    doctor: Mapped[Doctor] = relationship()
    service: Mapped[Service] = relationship()

    __table_args__ = (
        CheckConstraint("starts_at < ends_at", name="ck_appointments_order"),
        CheckConstraint(
            f"status IN ('{STATUS_CONFIRMED}', '{STATUS_CANCELLED}')", name="ck_appointments_status"
        ),
        # The database itself guarantees a doctor is never double-booked, and a
        # patient never holds two overlapping appointments, even under races.
        ExcludeConstraint(
            ("doctor_id", "="),
            (text("tstzrange(starts_at, ends_at, '[)')"), "&&"),
            name="ex_appointments_doctor_overlap",
            using="gist",
            where=text(f"status = '{STATUS_CONFIRMED}'"),
        ),
        ExcludeConstraint(
            ("user_id", "="),
            (text("tstzrange(starts_at, ends_at, '[)')"), "&&"),
            name="ex_appointments_patient_overlap",
            using="gist",
            where=text(f"status = '{STATUS_CONFIRMED}'"),
        ),
        Index("ix_appointments_doctor_starts", "doctor_id", "starts_at"),
    )
