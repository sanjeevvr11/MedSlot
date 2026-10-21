"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CalendarPlus, CalendarRange, Clock, Copy, FileX2, MapPin, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DoctorAvatar } from "@/components/medical";
import { Badge, Button, ButtonLink, Card, EmptyState, Modal, PageHeader, Skeleton, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatLongDate, formatPrice, formatTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

function StatusBadge({ appt }: { appt: Appointment }) {
  if (appt.status === "cancelled") return <Badge tone="red">Cancelled</Badge>;
  if (new Date(appt.ends_at) < new Date()) return <Badge tone="gray">Completed</Badge>;
  return <Badge tone="green">Confirmed</Badge>;
}

function useCancel(onDone: (a: Appointment) => void) {
  const [target, setTarget] = useState<Appointment | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      const updated = await api<Appointment>(`/bookings/${target.reference}/cancel`, {
        method: "POST",
        body: { reason: reason.trim() || null },
      });
      toast.success("Appointment cancelled. The slot is free for others now.");
      onDone(updated);
      setTarget(null);
      setReason("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <Modal open={!!target} onClose={() => !busy && setTarget(null)} title="Cancel this appointment?">
      {target && (
        <>
          <p className="text-ink-soft">
            {target.service.name} with <strong className="text-ink">{target.doctor.name}</strong> on{" "}
            <strong className="text-ink">{formatLongDate(target.starts_at)}, {formatTime(target.starts_at)}</strong>.
          </p>
          <label className="mt-4 block text-sm font-semibold">
            Reason <span className="font-normal text-ink-soft">(optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="e.g. Feeling better"
              className="mt-1.5 h-11 w-full rounded-xl border border-line px-3 font-normal outline-none focus:border-signal"
            />
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" onClick={submit} loading={busy}>
              Yes, cancel
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
  return { open: setTarget, modal };
}

export function AppointmentList() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [result, setResult] = useState<{ tab: string; items: Appointment[] } | null>(null);
  const items = result?.tab === tab ? result.items : null;

  useEffect(() => {
    api<Appointment[]>(`/bookings/me?scope=${tab}`)
      .then((items) => setResult({ tab, items }))
      .catch(() => {
        toast.error("Couldn't load your appointments.");
        setResult({ tab, items: [] });
      });
  }, [tab]);

  const { open, modal } = useCancel((updated) =>
    setResult((r) => r && { ...r, items: r.items.map((a) => (a.id === updated.id ? updated : a)) }),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageHeader eyebrow="My appointments" title="Your bookings" body="Everything you've booked, in one place." />
        <ButtonLink href="/doctors" className="mb-8">
          <CalendarPlus className="size-4" /> Book new
        </ButtonLink>
      </div>

      <div className="mb-6 inline-flex rounded-full bg-marble p-1" role="tablist">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("relative rounded-full px-5 py-2 text-sm font-bold capitalize transition-colors", tab === t ? "text-ink" : "text-ink-soft")}
          >
            {tab === t && <motion.span layoutId="appt-tab" className="absolute inset-0 rounded-full bg-white shadow-card" />}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CalendarRange />}
          title={tab === "upcoming" ? "No upcoming appointments" : "No past appointments"}
          body={tab === "upcoming" ? "When you book a visit, it'll show up here." : "Your completed visits will appear here."}
          action={tab === "upcoming" && <ButtonLink href="/doctors">Find a doctor</ButtonLink>}
        />
      ) : (
        <ul className="space-y-4">
          <AnimatePresence>
            {items.map((a, i) => (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={cn("flex flex-col gap-5 p-5 sm:flex-row sm:items-center", a.status === "cancelled" && "opacity-70")}>
                  <div className="flex w-20 shrink-0 flex-col items-center rounded-2xl bg-signal-tint py-3 text-signal">
                    <span className="text-xs font-bold uppercase">{formatDate(a.starts_at).split(" ")[0].replace(",", "")}</span>
                    <span className="text-2xl font-extrabold leading-tight">
                      {new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(a.starts_at))}
                    </span>
                    <span className="text-xs font-semibold">
                      {new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(new Date(a.starts_at))}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge appt={a} />
                      <span className="font-mono text-xs font-semibold text-ink-soft">{a.reference}</span>
                    </div>
                    <p className="mt-1.5 text-lg font-bold">{a.doctor.name}</p>
                    <p className="text-sm text-ink-soft">
                      {a.service.name} · <Clock className="inline size-3.5" /> {formatTime(a.starts_at)} ({a.service.duration_minutes} min)
                    </p>
                    <p className="truncate text-sm text-ink-soft">
                      <MapPin className="inline size-3.5" /> {a.doctor.clinic_name}, {a.doctor.location}
                    </p>
                  </div>
                  <div className="flex gap-2 sm:flex-col">
                    <ButtonLink href={`/appointments/${a.reference}`} variant="secondary" size="sm">
                      Details
                    </ButtonLink>
                    {a.can_cancel && (
                      <Button variant="danger" size="sm" onClick={() => open(a)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {modal}
    </div>
  );
}

export function AppointmentDetail() {
  const { reference } = useParams<{ reference: string }>();
  const isNew = useSearchParams().get("new") === "1";
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { open, modal } = useCancel(setAppt);

  useEffect(() => {
    api<Appointment>(`/bookings/${reference}`)
      .then(setAppt)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this appointment."));
  }, [reference]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState icon={<FileX2 />} title="Appointment not found" body={error} action={<ButtonLink href="/appointments">My appointments</ButtonLink>} />
      </div>
    );
  if (!appt)
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Skeleton className="h-[480px]" />
      </div>
    );

  const showCelebration = isNew && appt.status === "confirmed";

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Link href="/appointments" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-signal">
        <ArrowLeft className="size-4" /> My appointments
      </Link>

      {showCelebration && (
        <div className="mb-6 text-center">
          <AnimatedCheck />
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-4 text-3xl font-extrabold">
            You&apos;re booked!
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-1 text-ink-soft">
            Keep your booking reference handy at the clinic.
          </motion.p>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 30, rotateX: 12 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: showCelebration ? 0.8 : 0, type: "spring", stiffness: 140, damping: 18 }}
        style={{ transformPerspective: 900 }}
      >
        <Card className="overflow-hidden">
          <div className="bg-ink p-6 text-white">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white/70">Booking reference</p>
              <StatusBadge appt={appt} />
            </div>
            <button
              className="mt-1 inline-flex items-center gap-2 font-mono text-3xl font-extrabold tracking-wider"
              onClick={() => navigator.clipboard?.writeText(appt.reference).then(() => toast.success("Reference copied"))}
              aria-label="Copy booking reference"
            >
              {appt.reference} <Copy className="size-4 text-white/60" />
            </button>
          </div>
          <div className="relative">
            <div className="absolute -left-3 -top-3 size-6 rounded-full bg-white" />
            <div className="absolute -right-3 -top-3 size-6 rounded-full bg-white" />
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-4">
              <DoctorAvatar name={appt.doctor.name} accent={appt.doctor.accent} />
              <div>
                <p className="text-lg font-bold">{appt.doctor.name}</p>
                <p className="text-sm text-ink-soft">{appt.doctor.specialty.name} · {appt.doctor.qualifications}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-dashed border-line pt-5 text-sm">
              <Info label="Date" value={formatLongDate(appt.starts_at)} wide />
              <Info label="Time" value={`${formatTime(appt.starts_at)} – ${formatTime(appt.ends_at)}`} />
              <Info label="Consultation" value={appt.service.name} />
              <Info label="Clinic" value={`${appt.doctor.clinic_name}, ${appt.doctor.location}`} wide />
              <Info label="Fee (pay at clinic)" value={formatPrice(appt.price)} />
              <Info label="Booked on" value={formatDate(appt.created_at)} />
            </dl>
            {appt.status === "cancelled" ? (
              <div className="rounded-2xl bg-danger-tint p-4 text-sm text-danger">
                <p className="flex items-center gap-2 font-bold"><XCircle className="size-4" /> Cancelled {appt.cancelled_at && `on ${formatDate(appt.cancelled_at)}`}</p>
                {appt.cancel_reason && <p className="mt-1">Reason: {appt.cancel_reason}</p>}
              </div>
            ) : appt.can_cancel ? (
              <div className="flex flex-col gap-3 rounded-2xl bg-marble p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-ink-soft">
                  Free cancellation until <strong className="text-ink">{formatDate(appt.cancel_deadline!)}, {formatTime(appt.cancel_deadline!)}</strong>
                </p>
                <Button variant="danger" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => open(appt)}>
                  Cancel appointment
                </Button>
              </div>
            ) : new Date(appt.starts_at) > new Date() ? (
              <p className="rounded-2xl bg-warning-tint p-4 text-sm text-warning">
                Online cancellation has closed (less than 2 hours to go). Please contact the clinic.
              </p>
            ) : null}
          </div>
        </Card>
      </motion.div>
      {showCelebration && (
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/appointments" variant="secondary">View all bookings</ButtonLink>
          <ButtonLink href="/doctors">Book another</ButtonLink>
        </div>
      )}
      {modal}
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function AnimatedCheck() {
  return (
    <motion.div
      className="mx-auto grid size-20 place-items-center rounded-full bg-success-tint"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 16 }}
    >
      <svg viewBox="0 0 52 52" className="size-12" aria-hidden>
        <motion.circle cx="26" cy="26" r="23" fill="none" stroke="#0e9f6e" strokeWidth="3"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.1 }} />
        <motion.path d="M15 27 l7 7 l15 -16" fill="none" stroke="#0e9f6e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.5 }} />
      </svg>
    </motion.div>
  );
}
