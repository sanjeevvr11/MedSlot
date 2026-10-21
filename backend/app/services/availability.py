"""Slot calculation.

`compute_slots` is a pure function: it gets a doctor's weekly schedule plus
the busy periods for a day and returns the bookable start times. Everything
that touches the database lives in the loader functions below it.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import STATUS_CONFIRMED, Appointment, Doctor, TimeOff

Interval = tuple[datetime, datetime]


@dataclass(frozen=True)
class WeeklyWindow:
    weekday: int
    start: time
    end: time


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def compute_slots(
    day: date,
    tz: ZoneInfo,
    working: list[WeeklyWindow],
    breaks: list[WeeklyWindow],
    busy: list[Interval],
    duration: timedelta,
    step: timedelta,
    earliest: datetime,
    latest_day: date,
) -> list[datetime]:
    """Return the UTC start times of every free slot of `duration` on `day`.

    Candidate starts sit on a `step` grid anchored at the start of each working
    window. A candidate survives if the whole appointment fits inside the
    window and overlaps no break and no busy period (existing appointments,
    time off), and it starts no earlier than `earliest`.
    """
    if day > latest_day:
        return []

    weekday = day.weekday()
    blocked: list[Interval] = [
        (datetime.combine(day, b.start, tz), datetime.combine(day, b.end, tz))
        for b in breaks
        if b.weekday == weekday
    ]
    blocked.extend(busy)

    slots: list[datetime] = []
    for window in working:
        if window.weekday != weekday:
            continue
        window_start = datetime.combine(day, window.start, tz)
        window_end = datetime.combine(day, window.end, tz)
        start = window_start
        while start + duration <= window_end:
            end = start + duration
            if start >= earliest and not any(_overlaps(start, end, b0, b1) for b0, b1 in blocked):
                slots.append(start.astimezone(UTC))
            start += step
    return sorted(set(slots))


# --- Database-backed helpers -------------------------------------------------


def clinic_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().clinic_timezone)


def booking_window(now: datetime) -> tuple[datetime, date, date]:
    """(earliest bookable instant, first bookable day, last bookable day)."""
    settings = get_settings()
    tz = clinic_tz()
    today = now.astimezone(tz).date()
    earliest = now + timedelta(minutes=settings.min_lead_minutes)
    return earliest, today, today + timedelta(days=settings.booking_horizon_days)


def load_busy(db: Session, doctor_id: int, start: datetime, end: datetime) -> list[Interval]:
    appointments = db.execute(
        select(Appointment.starts_at, Appointment.ends_at).where(
            Appointment.doctor_id == doctor_id,
            Appointment.status == STATUS_CONFIRMED,
            Appointment.starts_at < end,
            Appointment.ends_at > start,
        )
    ).all()
    time_off = db.execute(
        select(TimeOff.starts_at, TimeOff.ends_at).where(
            TimeOff.doctor_id == doctor_id,
            TimeOff.starts_at < end,
            TimeOff.ends_at > start,
        )
    ).all()
    return [(a, b) for a, b in appointments] + [(a, b) for a, b in time_off]


def _weekly(rows) -> list[WeeklyWindow]:
    return [WeeklyWindow(r.weekday, r.start_time, r.end_time) for r in rows]


def slots_for_range(
    db: Session, doctor: Doctor, duration_minutes: int, first_day: date, last_day: date, now: datetime
) -> dict[date, list[datetime]]:
    settings = get_settings()
    tz = clinic_tz()
    earliest, today, horizon_end = booking_window(now)
    first_day = max(first_day, today)
    last_day = min(last_day, horizon_end)
    if first_day > last_day:
        return {}

    range_start = datetime.combine(first_day, time.min, tz)
    range_end = datetime.combine(last_day + timedelta(days=1), time.min, tz)
    busy = load_busy(db, doctor.id, range_start, range_end)
    working = _weekly(doctor.working_hours)
    breaks = _weekly(doctor.breaks)

    result: dict[date, list[datetime]] = {}
    day = first_day
    while day <= last_day:
        day_start = datetime.combine(day, time.min, tz)
        day_end = day_start + timedelta(days=1)
        day_busy = [(a, b) for a, b in busy if _overlaps(a, b, day_start, day_end)]
        result[day] = compute_slots(
            day=day,
            tz=tz,
            working=working,
            breaks=breaks,
            busy=day_busy,
            duration=timedelta(minutes=duration_minutes),
            step=timedelta(minutes=settings.slot_step_minutes),
            earliest=earliest,
            latest_day=horizon_end,
        )
        day += timedelta(days=1)
    return result
