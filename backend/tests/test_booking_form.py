from decimal import Decimal

from sqlalchemy import select

from app.models import Appointment, Doctor, Service, Specialty
from tests.conftest import local_slot, login_client, make_user, post_booking

PDF = b"%PDF-1.4\n% referral letter\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def booking(catalogue, **overrides):
    return {"service_id": catalogue["service"].id, "starts_at": local_slot(3, 10).isoformat(), **overrides}


def fields_of(resp) -> dict:
    assert resp.status_code == 422, resp.text
    return resp.json()["detail"]["fields"]


def test_intake_is_saved_and_normalised(patient, catalogue, db):
    resp = post_booking(
        patient,
        booking(catalogue, patient_phone="+91 98765-43210", patient_email=" Alice@Example.COM ", allergies="Penicillin"),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["patient_phone"] == "+919876543210"
    assert body["patient_email"] == "alice@example.com"
    assert body["consultation_mode"] == "in_person"
    assert body["details"] == {"allergies": "Penicillin"}
    assert body["document"] is None
    stored = db.scalar(select(Appointment).where(Appointment.reference == body["reference"]))
    assert stored.consent_at is not None and stored.user.username == "alice"


def test_required_fields_and_formats(patient, catalogue):
    payload = booking(catalogue, patient_name="", patient_email="not-an-email", patient_phone="12345", reason="short")
    errors = fields_of(post_booking(patient, payload))
    assert set(errors) >= {"patient_name", "patient_email", "patient_phone", "reason"}

    errors = fields_of(post_booking(patient, booking(catalogue, patient_type=None, consultation_mode="carrier pigeon")))
    assert {"patient_type", "consultation_mode"} <= set(errors)


def test_consent_is_required(patient, catalogue):
    errors = fields_of(post_booking(patient, booking(catalogue, consent=False)))
    assert "consent" in errors


def test_video_mode_requires_a_platform(patient, catalogue):
    errors = fields_of(post_booking(patient, booking(catalogue, consultation_mode="video")))
    assert "video_platform" in errors
    resp = post_booking(patient, booking(catalogue, consultation_mode="video", video_platform="zoom"))
    assert resp.status_code == 201
    assert resp.json()["details"] == {"video_platform": "zoom"}


def test_answers_for_questions_that_do_not_apply_are_dropped(patient, catalogue):
    resp = post_booking(
        patient,
        booking(catalogue, patient_type="returning", consultation_mode="phone", allergies="x", video_platform="zoom",
                accessibility_needs="ramp"),
    )
    assert resp.status_code == 201
    assert resp.json()["details"] == {}


def test_returning_patient_reference_must_be_their_own(patient, catalogue, db):
    first = post_booking(patient, booking(catalogue)).json()["reference"]
    errors = fields_of(post_booking(patient, booking(catalogue, starts_at=local_slot(4, 10).isoformat(),
                                                     patient_type="returning", previous_reference="MS-ABCDEF")))
    assert "previous_reference" in errors

    resp = post_booking(patient, booking(catalogue, starts_at=local_slot(4, 10).isoformat(),
                                         patient_type="returning", previous_reference=first.lower()))
    assert resp.status_code == 201, resp.text
    assert resp.json()["details"] == {"previous_reference": first}

    make_user(db, "eve")
    other = login_client("eve")
    errors = fields_of(post_booking(other, booking(catalogue, starts_at=local_slot(5, 10).isoformat(),
                                                   patient_type="returning", previous_reference=first)))
    assert "previous_reference" in errors


def test_paediatrics_requires_child_details(patient, catalogue, db):
    spec = Specialty(name="Paediatrics", slug="paediatrics", icon="baby")
    db.add(spec)
    db.flush()
    doctor = db.get(Doctor, catalogue["doctor"].id)
    doctor.specialty_id = spec.id
    db.commit()

    errors = fields_of(post_booking(patient, booking(catalogue)))
    assert {"child_name", "child_age"} <= set(errors)
    assert "child_age" in fields_of(post_booking(patient, booking(catalogue, child_name="Kiaan", child_age=19)))

    resp = post_booking(patient, booking(catalogue, child_name="Kiaan", child_age=6))
    assert resp.status_code == 201
    assert resp.json()["details"] == {"child_name": "Kiaan", "child_age": 6}


def test_invalid_form_does_not_take_the_slot(patient, catalogue):
    assert post_booking(patient, booking(catalogue, consent=False)).status_code == 422
    assert post_booking(patient, booking(catalogue)).status_code == 201


def test_referral_upload_and_download(patient, admin, catalogue, db):
    resp = post_booking(patient, booking(catalogue), referral=("../../etc/letter?.pdf", PDF, "text/plain"))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    # Type comes from the file's bytes, not the browser; the name is sanitised.
    assert body["document"] == {"filename": "letter_.pdf", "content_type": "application/pdf", "size_bytes": len(PDF)}

    download = patient.get(f"/api/bookings/{body['reference']}/referral")
    assert download.status_code == 200
    assert download.content == PDF
    assert download.headers["content-type"] == "application/pdf"
    assert "attachment" in download.headers["content-disposition"]

    make_user(db, "mallory")
    assert login_client("mallory").get(f"/api/bookings/{body['reference']}/referral").status_code == 404
    assert admin.get(f"/api/admin/appointments/{body['id']}/referral").content == PDF
    assert patient.get(f"/api/admin/appointments/{body['id']}/referral").status_code == 403


def test_referral_type_and_size_are_enforced(patient, catalogue):
    errors = fields_of(post_booking(patient, booking(catalogue), referral=("notes.pdf", b"just text", "application/pdf")))
    assert "referral" in errors
    too_big = PNG + b"\x00" * (5 * 1024 * 1024)
    errors = fields_of(post_booking(patient, booking(catalogue), referral=("scan.png", too_big, "image/png")))
    assert "5 MB" in errors["referral"]
    resp = post_booking(patient, booking(catalogue), referral=("scan.png", PNG, "image/png"))
    assert resp.status_code == 201
    assert resp.json()["document"]["content_type"] == "image/png"


def test_appointment_without_referral_has_no_download(patient, catalogue):
    ref = post_booking(patient, booking(catalogue)).json()["reference"]
    assert patient.get(f"/api/bookings/{ref}/referral").status_code == 404


def test_malformed_data_part_is_a_validation_error(patient, catalogue):
    resp = patient.post("/api/bookings", data={"data": "{not json"})
    assert resp.status_code == 422


def test_admin_sees_intake_details(patient, admin, catalogue, db):
    service = db.get(Service, catalogue["service"].id)
    assert service.price == Decimal(500)
    post_booking(patient, booking(catalogue, consultation_mode="video", video_platform="google_meet"))
    rows = admin.get("/api/admin/appointments").json()
    assert rows[0]["patient_email"] == "alice@example.com"
    assert rows[0]["details"] == {"video_platform": "google_meet"}
