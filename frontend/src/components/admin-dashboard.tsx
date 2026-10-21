"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, CalendarClock, ClipboardList, Paperclip, CalendarOff, CalendarX2, Stethoscope, Trash2, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { IntakeSummary } from "@/components/intake-summary";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Skeleton, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { MODE_LABELS } from "@/lib/booking-form";
import { CLINIC_UTC_OFFSET, clinicDayKey, formatDate, formatLongDate, formatPrice, formatTime } from "@/lib/format";
import type { AdminAppointment, AdminStats, DoctorSummary, TimeOff } from "@/lib/types";

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [tab, setTab] = useState<"appointments" | "timeoff">("appointments");

  const loadStats = useCallback(() => {
    api<AdminStats>("/admin/stats").then(setStats).catch(() => toast.error("Couldn't load stats."));
  }, []);

  useEffect(() => {
    loadStats();
    api<DoctorSummary[]>("/admin/doctors").then(setDoctors).catch(() => {});
  }, [loadStats]);

  const cards = stats
    ? [
        { label: "Appointments today", value: stats.today, icon: CalendarClock, tone: "text-signal bg-signal-tint" },
        { label: "Upcoming", value: stats.upcoming, icon: CalendarClock, tone: "text-success bg-success-tint" },
        { label: "Cancelled (30 days)", value: stats.cancelled_last_30_days, icon: CalendarX2, tone: "text-danger bg-danger-tint" },
        { label: "Active doctors", value: stats.doctors, icon: Stethoscope, tone: "text-[#6d4aff] bg-[#f0ecff]" },
        { label: "Patients", value: stats.patients, icon: Users, tone: "text-warning bg-warning-tint" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Clinic admin" title="Dashboard" body="Manage bookings and doctor availability across MedSlot." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats === null
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : cards.map((c, i) => (
              <motion.div key={c.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-5">
                  <div className={cn("mb-3 grid size-10 place-items-center rounded-xl", c.tone)}>
                    <c.icon className="size-5" />
                  </div>
                  <p className="text-3xl font-extrabold">{c.value}</p>
                  <p className="text-sm text-ink-soft">{c.label}</p>
                </Card>
              </motion.div>
            ))}
      </div>

      <div className="mb-6 mt-10 inline-flex rounded-full bg-marble p-1" role="tablist">
        {(
          [
            ["appointments", "Appointments"],
            ["timeoff", "Doctor time off"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("relative rounded-full px-5 py-2 text-sm font-bold", tab === key ? "text-ink" : "text-ink-soft")}
          >
            {tab === key && <motion.span layoutId="admin-tab" className="absolute inset-0 rounded-full bg-white shadow-card" />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {tab === "appointments" ? (
        <AppointmentsPanel doctors={doctors} onChange={loadStats} />
      ) : (
        <TimeOffPanel doctors={doctors} />
      )}
    </div>
  );
}

const selectClass = "h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-signal";

function AppointmentsPanel({ doctors, onChange }: { doctors: DoctorSummary[]; onChange: () => void }) {
  const [doctor, setDoctor] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [upcoming, setUpcoming] = useState(true);
  const [target, setTarget] = useState<AdminAppointment | null>(null);
  const [viewing, setViewing] = useState<AdminAppointment | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const sp = new URLSearchParams();
  if (doctor) sp.set("doctor", doctor);
  if (date) sp.set("date", date);
  if (status) sp.set("status", status);
  if (upcoming) sp.set("upcoming_only", "true");
  const query = sp.toString();
  const [result, setResult] = useState<{ query: string; items: AdminAppointment[] } | null>(null);
  const items = result?.query === query ? result.items : null;

  useEffect(() => {
    api<AdminAppointment[]>(`/admin/appointments?${query}`)
      .then((items) => setResult({ query, items }))
      .catch(() => {
        toast.error("Couldn't load appointments.");
        setResult({ query, items: [] });
      });
  }, [query]);

  async function cancel() {
    if (!target) return;
    setBusy(true);
    try {
      const updated = await api<AdminAppointment>(`/admin/appointments/${target.id}/cancel`, {
        method: "POST",
        body: { reason: reason.trim() || null },
      });
      setResult((r) => r && { ...r, items: r.items.map((a) => (a.id === updated.id ? updated : a)) });
      toast.success(`Cancelled ${updated.reference}.`);
      setTarget(null);
      setReason("");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <select className={selectClass} value={doctor} onChange={(e) => setDoctor(e.target.value)} aria-label="Filter by doctor">
          <option value="">All doctors</option>
          {doctors.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
        <input type="date" className={selectClass} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Filter by date" />
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} className="size-4 accent-[#006bff]" />
          Upcoming only
        </label>
        {items && <span className="ml-auto text-sm text-ink-soft">{items.length} result{items.length === 1 ? "" : "s"}</span>}
      </div>

      {items === null ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={<CalendarClock />} title="No appointments" body="Nothing matches these filters." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-marble text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Doctor</th>
                <th className="px-4 py-3 font-semibold">Consultation</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Ref</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((a) => (
                <tr key={a.id} className="hover:bg-marble/50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="font-semibold">{formatDate(a.starts_at)}</p>
                    <p className="text-ink-soft">{formatTime(a.starts_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{a.user.full_name}</p>
                    <p className="text-ink-soft">@{a.user.username}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold">{a.doctor.name}</td>
                  <td className="px-4 py-3">
                    {a.service.name}
                    <p className="flex items-center gap-1.5 text-ink-soft">
                      {a.consultation_mode ? MODE_LABELS[a.consultation_mode].split(" ")[0] : formatPrice(a.price)}
                      {a.document && <Paperclip className="size-3.5 text-signal" aria-label="Referral attached" />}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {a.status === "cancelled" ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Confirmed</Badge>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.reference}</td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                    {a.patient_name && (
                      <Button variant="secondary" size="sm" onClick={() => setViewing(a)}>
                        <ClipboardList className="size-3.5" /> Details
                      </Button>
                    )}
                    {a.status === "confirmed" && new Date(a.starts_at) > new Date() && (
                      <Button variant="danger" size="sm" onClick={() => setTarget(a)}>
                        <Ban className="size-3.5" /> Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${viewing.reference} · ${viewing.doctor.name}` : ""}>
        {viewing && (
          <>
            <p className="mb-4 text-sm text-ink-soft">
              {viewing.service.name} · {formatLongDate(viewing.starts_at)}, {formatTime(viewing.starts_at)} · booked by @{viewing.user.username}
            </p>
            <div className="max-h-[60vh] overflow-y-auto">
              <IntakeSummary appt={viewing} referralHref={`/api/admin/appointments/${viewing.id}/referral`} />
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!target} onClose={() => !busy && setTarget(null)} title="Cancel on behalf of the clinic?">
        {target && (
          <>
            <p className="text-ink-soft">
              {target.reference} · {target.user.full_name} with {target.doctor.name}, {formatDate(target.starts_at)} {formatTime(target.starts_at)}.
              Admins can cancel at any time, even inside the 2-hour window.
            </p>
            <label className="mt-4 block text-sm font-semibold">
              Reason shown to the patient
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder="Doctor unavailable"
                className="mt-1.5 h-11 w-full rounded-xl border border-line px-3 font-normal outline-none focus:border-signal"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>
                Back
              </Button>
              <Button variant="danger" onClick={cancel} loading={busy}>
                Cancel appointment
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}

function TimeOffPanel({ doctors }: { doctors: DoctorSummary[] }) {
  const [selectedId, setDoctorId] = useState<number | null>(null);
  const doctorId = selectedId ?? doctors[0]?.id ?? null;
  const [form, setForm] = useState({ date: "", start: "09:00", end: "17:00", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Results are tagged with the doctor they belong to; switching doctor shows "loading".
  const [entriesState, setEntriesState] = useState<{ doctorId: number; entries: TimeOff[] } | null>(null);
  const entries = entriesState?.doctorId === doctorId ? entriesState.entries : null;
  const [clashState, setClashState] = useState<{ doctorId: number; items: AdminAppointment[] } | null>(null);
  const clashes = clashState?.doctorId === doctorId ? clashState.items : [];

  const load = useCallback(() => {
    if (!doctorId) return;
    api<TimeOff[]>(`/admin/doctors/${doctorId}/time-off`)
      .then((entries) => setEntriesState({ doctorId, entries }))
      .catch(() => setEntriesState({ doctorId, entries: [] }));
  }, [doctorId]);
  useEffect(load, [load]);

  const doctor = doctors.find((d) => d.id === doctorId);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.date) errs.date = "Pick a date.";
    if (form.start >= form.end) errs.end = "End must be after start.";
    setErrors(errs);
    if (Object.keys(errs).length || !doctor) return;

    const starts_at = `${form.date}T${form.start}:00${CLINIC_UTC_OFFSET}`;
    const ends_at = `${form.date}T${form.end}:00${CLINIC_UTC_OFFSET}`;
    setBusy(true);
    try {
      await api<TimeOff>(`/admin/doctors/${doctor.id}/time-off`, {
        method: "POST",
        body: { starts_at, ends_at, reason: form.reason },
      });
      toast.success("Time off added. Those slots are now hidden from patients.");
      // Existing bookings are kept; flag any that now fall inside the block.
      const sameDay = await api<AdminAppointment[]>(`/admin/appointments?doctor=${doctor.slug}&date=${form.date}&status=confirmed`);
      const s = new Date(starts_at).getTime();
      const en = new Date(ends_at).getTime();
      setClashState({
        doctorId: doctor.id,
        items: sameDay.filter((a) => new Date(a.starts_at).getTime() < en && new Date(a.ends_at).getTime() > s),
      });
      setForm((f) => ({ ...f, reason: "" }));
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add time off.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/admin/time-off/${id}`, { method: "DELETE" });
      toast.success("Time off removed. Slots are bookable again.");
      load();
    } catch {
      toast.error("Couldn't remove it.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="p-5">
        <h2 className="mb-4 font-bold">Block time for a doctor</h2>
        <form onSubmit={add} className="space-y-4" noValidate>
          <label className="block text-sm font-semibold">
            Doctor
            <select
              className={cn(selectClass, "mt-1.5 w-full")}
              value={doctorId ?? ""}
              onChange={(e) => setDoctorId(Number(e.target.value))}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.specialty.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Date" type="date" min={clinicDayKey(new Date())} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} error={errors.date} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" type="time" step={900} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <Field label="To" type="time" step={900} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} error={errors.end} />
          </div>
          <Field label="Reason (internal)" placeholder="Conference, leave…" maxLength={200} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <Button type="submit" className="w-full" loading={busy}>
            <CalendarOff className="size-4" /> Add time off
          </Button>
          <p className="text-xs text-ink-soft">Times are IST. Existing bookings are not cancelled automatically.</p>
        </form>
      </Card>

      <div className="space-y-4">
        <AnimatePresence>
          {clashes.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl border border-warning/30 bg-warning-tint p-4 text-sm">
                <p className="flex items-center gap-2 font-bold text-warning">
                  <TriangleAlert className="size-4" /> {clashes.length} existing booking{clashes.length > 1 ? "s" : ""} fall inside this block
                </p>
                <ul className="mt-2 space-y-1 text-ink">
                  {clashes.map((c) => (
                    <li key={c.id}>
                      {formatTime(c.starts_at)} · {c.user.full_name} · <span className="font-mono">{c.reference}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-ink-soft">Cancel them from the Appointments tab so the patients are informed.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="p-5">
          <h2 className="mb-4 font-bold">Upcoming time off{doctor ? ` · ${doctor.name}` : ""}</h2>
          {entries === null ? (
            <Skeleton className="h-24" />
          ) : entries.length === 0 ? (
            <p className="text-ink-soft">No time off scheduled.</p>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-semibold">
                      {formatDate(t.starts_at)}, {formatTime(t.starts_at)} – {clinicDayKey(t.starts_at) === clinicDayKey(t.ends_at) ? "" : `${formatDate(t.ends_at)}, `}
                      {formatTime(t.ends_at)}
                    </p>
                    {t.reason && <p className="text-sm text-ink-soft">{t.reason}</p>}
                  </div>
                  <button onClick={() => remove(t.id)} className="rounded-full p-2 text-danger hover:bg-danger-tint" aria-label="Remove time off">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
