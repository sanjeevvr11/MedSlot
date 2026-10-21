# MedSlot: smart medical appointment booking

MedSlot lets patients discover doctors, see real-time availability and book, view and cancel
appointments. Clinic admins can manage bookings and block doctor time off.

Built as a HubTech internship project with **Next.js + TypeScript + Tailwind** (frontend),
**FastAPI + SQLAlchemy + Alembic** (backend) and **PostgreSQL**.

## Features

- **Accounts:** username/password sign-up and login, Argon2id password hashing, server-side
  sessions in an `HttpOnly` cookie, logout that really ends the session, login throttling.
- **Discovery:** search doctors by name, specialty, clinic, city or consultation; filter by
  specialty and fee; doctor profiles with services, prices, durations and weekly hours.
- **Dynamic scheduling:** slots are computed from working hours, breaks, time off, service
  duration, existing bookings, a 1-hour minimum lead time and a 30-day booking window.
- **Safe booking:** every booking is re-validated on the server, and PostgreSQL **exclusion
  constraints** make it impossible for a doctor (or a patient) to have overlapping confirmed
  appointments, even when requests race.
- **Booking management:** unique references (`MS-XXXXXX`), upcoming and past lists, cancellation.
- **Admin:** dashboard stats, filterable appointment list, cancel on behalf of the clinic, and
  doctor time off (with a warning about existing bookings inside the blocked period).
- **UI:** Calendly-style navy and signal-blue design, Motion animations, an animated hero demo
  plus a scroll-driven feature showcase (desktop), responsive layouts, and it honours the
  "reduce motion" setting.

### Booking rules

| Rule | Value |
|---|---|
| Cancellation | Patients can cancel up to **2 hours** before the start time; admins at any time |
| Daily limit | One active booking per patient per doctor per day |
| Lead time / horizon | At least 60 minutes ahead, at most 30 days ahead |
| Time zone | All times are clinic time (Asia/Kolkata), stored in UTC |

## Project layout

```
backend/    FastAPI app (app/), Alembic migrations, pytest suite, demo seed
frontend/   Next.js App Router app (src/app pages, src/components)
render.yaml Render Blueprint (Postgres + API + web)
```

The browser only talks to the Next.js server; `/api/*` is proxied to FastAPI through a Next.js
rewrite, so the session cookie is first-party and no CORS is needed. State-changing requests
must carry an `X-Requested-With: MedSlot` header (a CSRF guard on top of `SameSite=Lax`).

## Run locally

Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 20+, PostgreSQL 14+.

```bash
createdb medslot && createdb medslot_test
```

```bash
cd backend && cp .env.example .env && uv sync
```

```bash
cd backend && uv run alembic upgrade head && set -a && . ./.env && set +a && uv run python -m app.seed
```

```bash
cd backend && uv run uvicorn app.main:app --port 8010 --reload
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. API docs are at http://localhost:8010/api/docs. The frontend
proxies to `http://127.0.0.1:8010` unless `BACKEND_URL` is set.

**Demo accounts** (created by the seed; passwords are in `backend/.env.example`):
`admin` (clinic admin) and `demo.patient` (patient). Doctors and patients in the seed data are
fictional.

## Tests

```bash
cd backend && uv run pytest
```

The suite runs against the real `medslot_test` PostgreSQL database (the constraints under test
don't exist in SQLite). It covers the availability calculator, registration and login
(hashing, duplicate usernames, validation, throttling, CSRF, logout), booking validation, the
daily limit, ownership checks, the cancellation cutoff, admin permissions, time off, and a
concurrency test where 8 patients race for one slot and exactly one wins.

## Deploy to Render

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and pick the repository. `render.yaml` creates
   `medslot-db`, `medslot-api` and `medslot-web`.
3. When prompted, set `SEED_ADMIN_PASSWORD` and `SEED_DEMO_PASSWORD` (the demo data is seeded
   on start) and set `BACKEND_URL` on `medslot-web` to the API's public URL
   (e.g. `https://medslot-api.onrender.com`). Redeploy the web service after setting it.

Free-tier notes: free services sleep when idle (the first request can take about a minute),
and free Postgres databases expire after a limited period. Check Render's current limits
before a demo.

## Future enhancements

Email/SMS reminders, reviews, online payments, analytics, and full doctor and schedule editing
in the admin area (currently doctors and weekly hours come from the seed data).
