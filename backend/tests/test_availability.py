from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.services.availability import WeeklyWindow, compute_slots

TZ = ZoneInfo("Asia/Kolkata")
MONDAY = date(2030, 1, 7)
WORKING = [WeeklyWindow(0, time(9), time(12))]
LUNCH = [WeeklyWindow(0, time(10), time(10, 30))]
STEP = timedelta(minutes=15)
LONG_AGO = datetime(2000, 1, 1, tzinfo=UTC)
FAR_FUTURE = date(2100, 1, 1)


def local(hour: int, minute: int = 0) -> datetime:
    return datetime.combine(MONDAY, time(hour, minute), TZ)


def as_local(slots: list[datetime]) -> list[str]:
    return [s.astimezone(TZ).strftime("%H:%M") for s in slots]


def slots(**overrides) -> list[str]:
    args = dict(
        day=MONDAY,
        tz=TZ,
        working=WORKING,
        breaks=[],
        busy=[],
        duration=timedelta(minutes=30),
        step=STEP,
        earliest=LONG_AGO,
        latest_day=FAR_FUTURE,
    )
    args.update(overrides)
    return as_local(compute_slots(**args))


def test_slots_fill_working_window_and_fit_duration():
    result = slots()
    assert result[0] == "09:00"
    assert result[-1] == "11:30"  # 11:30-12:00 is the last one that fits
    assert len(result) == 11


def test_breaks_are_excluded():
    result = slots(breaks=LUNCH)
    assert "09:30" in result  # ends exactly when the break starts
    assert "09:45" not in result and "10:00" not in result and "10:15" not in result
    assert "10:30" in result


def test_existing_appointments_block_overlapping_starts():
    result = slots(busy=[(local(9, 30), local(10))])
    assert "09:00" in result
    assert "09:15" not in result and "09:30" not in result and "09:45" not in result
    assert "10:00" in result


def test_time_off_spanning_the_day_blocks_everything():
    assert slots(busy=[(local(0), local(23, 59))]) == []


def test_minimum_lead_time_filters_early_slots():
    assert slots(earliest=local(10, 50))[0] == "11:00"


def test_no_working_hours_on_that_weekday():
    assert slots(working=[WeeklyWindow(1, time(9), time(12))]) == []


def test_beyond_booking_horizon_returns_nothing():
    assert slots(latest_day=MONDAY - timedelta(days=1)) == []


def test_longer_services_get_fewer_slots():
    assert len(slots(duration=timedelta(minutes=60))) == 9  # 09:00 ... 11:00


def test_results_are_utc():
    first = compute_slots(MONDAY, TZ, WORKING, [], [], timedelta(minutes=30), STEP, LONG_AGO, FAR_FUTURE)[0]
    assert first.tzinfo == UTC
    assert first == datetime(2030, 1, 7, 3, 30, tzinfo=UTC)  # 09:00 IST
