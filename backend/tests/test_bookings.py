import re
import threading
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import STATUS_CONFIRMED, Appointment, User
from app.services.availability import clinic_tz
from app.services.booking import BookingError, create_booking
from tests.conftest import local_slot, login_client, make_user, post_booking


def book(client, service_id, starts_at, **intake):
    return post_booking(client, {"service_id": service_id, "starts_at": starts_at.isoformat(), **intake})


def open_slots(client, service_id, starts_at) -> set[datetime]:
    """Free slots on the clinic-local day containing `starts_at`."""
    day = starts_at.astimezone(clinic_tz()).date().isoformat()
    resp = client.get("/api/doctors/test/slots", params={"service_id": service_id, "date": day})
    assert resp.status_code == 200, resp.text
    return {datetime.fromisoformat(s) for s in resp.json()["slots"]}


def test_booking_returns_reference_and_removes_slot(patient, catalogue):
    service_id = catalogue["service"].id
    slot = local_slot(3, 10)
    before = open_slots(patient, service_id, slot)
    assert slot in before

    resp = book(patient, service_id, slot)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert re.fullmatch(r"MS-[A-Z2-9]{6}", body["reference"])
    assert body["status"] == "confirmed"
    assert body["can_cancel"] is True

    after = open_slots(patient, service_id, slot)
    assert slot not in after
    assert patient.get(f"/api/bookings/{body['reference']}").status_code == 200


def test_unavailable_and_invalid_times_are_rejected(patient, catalogue):
    service_id = catalogue["service"].id
    for bad in (
        local_slot(3, 13),  # lunch break
        local_slot(3, 18),  # after hours
        local_slot(3, 10, 7),  # not on the slot grid
        local_slot(-1, 10),  # in the past
        local_slot(60, 10),  # beyond the booking horizon
    ):
        resp = book(patient, service_id, bad)
        assert resp.status_code == 409, (bad, resp.text)
        assert resp.json()["detail"]["code"] == "slot_unavailable"
    assert book(patient, 9999, local_slot(3, 10)).status_code == 404


def test_naive_datetimes_are_rejected(patient, catalogue):
    resp = post_booking(patient, {"service_id": catalogue["service"].id, "starts_at": "2030-01-01T10:00:00"})
    assert resp.status_code == 422


def test_booking_requires_login(client, catalogue):
    assert book(client, catalogue["service"].id, local_slot(3, 10)).status_code == 401


def test_one_booking_per_doctor_per_day(patient, catalogue):
    service_id = catalogue["service"].id
    assert book(patient, service_id, local_slot(3, 10)).status_code == 201
    second = book(patient, service_id, local_slot(3, 15))
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "daily_limit"
    assert book(patient, service_id, local_slot(4, 15)).status_code == 201


def test_patients_cannot_see_or_cancel_each_others_bookings(patient, catalogue, db):
    ref = book(patient, catalogue["service"].id, local_slot(3, 10)).json()["reference"]
    make_user(db, "mallory")
    other = login_client("mallory")
    assert other.get(f"/api/bookings/{ref}").status_code == 404
    assert other.post(f"/api/bookings/{ref}/cancel").status_code == 404
    assert other.get("/api/bookings/me").json() == []


def test_cancelling_frees_the_slot(patient, catalogue):
    service_id = catalogue["service"].id
    slot = local_slot(3, 10)
    ref = book(patient, service_id, slot).json()["reference"]

    resp = patient.post(f"/api/bookings/{ref}/cancel", json={"reason": "Feeling better"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert resp.json()["can_cancel"] is False
    assert slot in open_slots(patient, service_id, slot)
    assert patient.post(f"/api/bookings/{ref}/cancel").json()["detail"]["code"] == "already_cancelled"


def _insert_appointment(db, user_id, catalogue, starts_at):
    service = catalogue["service"]
    appointment = Appointment(
        reference="MS-SOON22",
        user_id=user_id,
        doctor_id=catalogue["doctor"].id,
        service_id=service.id,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(minutes=30),
        status=STATUS_CONFIRMED,
        price=service.price,
    )
    db.add(appointment)
    db.commit()
    return appointment


def test_patient_cannot_cancel_inside_two_hour_cutoff_but_admin_can(patient, admin, catalogue, db):
    alice = db.scalar(select(User).where(User.username == "alice"))
    soon = _insert_appointment(db, alice.id, catalogue, datetime.now(UTC) + timedelta(minutes=90))

    resp = patient.post(f"/api/bookings/{soon.reference}/cancel")
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "cutoff_passed"
    assert patient.get(f"/api/bookings/{soon.reference}").json()["can_cancel"] is False

    resp = admin.post(f"/api/admin/appointments/{soon.id}/cancel", json={"reason": "Doctor unavailable"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert resp.json()["cancel_reason"] == "Doctor unavailable"


def test_upcoming_and_past_lists(patient, catalogue, db):
    alice = db.scalar(select(User).where(User.username == "alice"))
    _insert_appointment(db, alice.id, catalogue, datetime.now(UTC) - timedelta(days=2))
    book(patient, catalogue["service"].id, local_slot(3, 10))
    assert len(patient.get("/api/bookings/me", params={"scope": "upcoming"}).json()) == 1
    past = patient.get("/api/bookings/me", params={"scope": "past"}).json()
    assert len(past) == 1 and past[0]["can_cancel"] is False


def test_concurrent_bookings_for_same_slot_only_one_wins(catalogue, db):
    """Many patients race for one slot; the exclusion constraint lets exactly one through."""
    racers = [make_user(db, f"racer{i}") for i in range(8)]
    slot = local_slot(3, 11)
    barrier = threading.Barrier(len(racers))
    outcomes: list[str] = []
    lock = threading.Lock()

    def attempt(user_id: int) -> None:
        with SessionLocal() as session:
            user = session.get(User, user_id)
            barrier.wait()
            try:
                create_booking(session, user, catalogue["service"].id, slot, datetime.now(UTC))
                result = "ok"
            except BookingError as exc:
                result = exc.code
        with lock:
            outcomes.append(result)

    threads = [threading.Thread(target=attempt, args=(u.id,)) for u in racers]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert outcomes.count("ok") == 1, outcomes
    assert set(outcomes) - {"ok"} <= {"slot_taken", "slot_unavailable"}
    confirmed = db.scalar(
        select(func.count()).where(Appointment.starts_at == slot, Appointment.status == STATUS_CONFIRMED)
    )
    assert confirmed == 1


def test_admin_endpoints_are_admin_only(patient, admin, catalogue):
    assert patient.get("/api/admin/stats").status_code == 403
    assert admin.get("/api/admin/stats").json()["doctors"] == 1


def test_admin_time_off_blocks_availability(patient, admin, catalogue):
    service_id = catalogue["service"].id
    slot = local_slot(4, 10)
    assert slot in open_slots(patient, service_id, slot)
    resp = admin.post(
        f"/api/admin/doctors/{catalogue['doctor'].id}/time-off",
        json={
            "starts_at": local_slot(4, 9).isoformat(),
            "ends_at": local_slot(4, 12).isoformat(),
            "reason": "Conference",
        },
    )
    assert resp.status_code == 201
    assert slot not in open_slots(patient, service_id, slot)
    assert book(patient, service_id, slot).status_code == 409

    admin.delete(f"/api/admin/time-off/{resp.json()['id']}")
    assert slot in open_slots(patient, service_id, slot)
