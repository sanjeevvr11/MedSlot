"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarX2, Clock, History, Info, MapPin, Moon, ShieldCheck, Sun, Sunrise, UserX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { AvailabilityCalendar, formatDayKey } from "@/components/availability-calendar";
import { BookingForm } from "@/components/booking-form";
import { DoctorAvatar } from "@/components/medical";
import { Button, ButtonLink, Card, EmptyState, Skeleton, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import {
  EMPTY_INTAKE,
  MODE_LABELS,
  draftKey,
  parseDraft,
  readDraftRaw,
  subscribeDrafts,
  toPayload,
  writeDraft,
  type BookingDraft,
  type FieldErrors,
  type FormStep,
  type IntakeValues,
} from "@/lib/booking-form";
import { clinicHour, formatDate, formatLongDate, formatPrice, formatTime } from "@/lib/format";
import type { Appointment, CalendarDay, DaySlots, DoctorDetail } from "@/lib/types";

const PERIODS = [
  { label: "Morning", icon: Sunrise, test: (h: number) => h < 12 },
  { label: "Afternoon", icon: Sun, test: (h: number) => h >= 12 && h < 17 },
  { label: "Evening", icon: Moon, test: (h: number) => h >= 17 },
];

export function BookingFlow() {
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(Number(params.get("service")) || null);
  const [day, setDay] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Each result remembers the request it answers; a mismatch means "loading".
  const [calendarState, setCalendarState] = useState<{ serviceId: number; days: CalendarDay[] } | null>(null);
  const calendar = calendarState?.serviceId === serviceId ? calendarState.days : null;
  const slotsKey = `${serviceId}|${day}`;
  const [slotsState, setSlotsState] = useState<{ key: string; slots: string[] } | null>(null);
  const slots = slotsState?.key === slotsKey ? slotsState.slots : null;
  const [slotState, setSlotState] = useState<{ key: string; value: string } | null>(null);
  const slot = slotState?.key === slotsKey ? slotState.value : null;
  const setSlot = (value: string | null) => setSlotState(value ? { key: slotsKey, value } : null);

  // "slot" is the time picker; the other phases are the intake form's steps.
  // The form only shows while a slot is held, so losing the slot (taken by
  // someone else, day changed) always falls back to the picker.
  const [phase, setPhase] = useState<"slot" | FormStep>("slot");
  const [values, setValues] = useState<IntakeValues>(EMPTY_INTAKE);
  const [referral, setReferral] = useState<File | null>(null);
  const formPhase = slot && phase !== "slot" ? phase : null;
  const formSlotRef = useRef<string | null>(null);
  useEffect(() => {
    formSlotRef.current = formPhase ? slot : null;
  });
  const prefilled = useRef(false);

  // Drafts: resume an unfinished booking for this doctor (this browser only).
  const storageKey = user ? draftKey(user.id, slug) : null;
  const rawDraft = useSyncExternalStore(subscribeDrafts, () => readDraftRaw(storageKey), () => null);
  const savedDraft = useMemo(() => parseDraft(rawDraft), [rawDraft]);
  const [draftDecided, setDraftDecided] = useState(false);
  const showDraftOffer = !!savedDraft && !draftDecided && !formPhase;

  useEffect(() => {
    if (!storageKey || !formPhase || !slot || !serviceId || !day) return;
    const t = setTimeout(
      () =>
        writeDraft(storageKey, { v: 1, savedAt: new Date().toISOString(), serviceId, day, slot, step: formPhase, values }),
      400,
    );
    return () => clearTimeout(t);
  }, [storageKey, formPhase, slot, serviceId, day, values]);

  useEffect(() => {
    api<DoctorDetail>(`/doctors/${slug}`)
      .then((d) => {
        setDoctor(d);
        setServiceId((id) => (d.services.some((s) => s.id === id) ? id : d.services[0]?.id ?? null));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this doctor."));
  }, [slug]);

  const service = doctor?.services.find((s) => s.id === serviceId) ?? null;

  // Bumped after a failed booking to re-fetch what's actually free.
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!serviceId) return;
    api<CalendarDay[]>(`/doctors/${slug}/calendar?service_id=${serviceId}`)
      .then((days) => {
        setCalendarState({ serviceId, days });
        setDay((current) => {
          if (current && days.some((d) => d.date === current && d.available > 0)) return current;
          return days.find((d) => d.available > 0)?.date ?? null;
        });
      })
      .catch(() => toast.error("Couldn't load availability."));
  }, [slug, serviceId, refresh]);

  useEffect(() => {
    if (!serviceId || !day) return;
    api<DaySlots>(`/doctors/${slug}/slots?service_id=${serviceId}&date=${day}`)
      .then((res) => {
        setSlotsState({ key: `${serviceId}|${day}`, slots: res.slots });
        // A held slot (e.g. from a resumed draft) may have gone in the meantime.
        const held = formSlotRef.current;
        if (held && !res.slots.includes(held)) {
          setSlotState(null);
          setPhase("slot");
          toast.error("The time you chose is no longer available. Please pick another.");
        }
      })
      .catch(() => toast.error("Couldn't load time slots."));
  }, [slug, serviceId, day, refresh]);

  const grouped = useMemo(
    () => PERIODS.map((p) => ({ ...p, slots: (slots ?? []).filter((s) => p.test(clinicHour(s))) })).filter((p) => p.slots.length),
    [slots],
  );

  function chooseService(id: number) {
    setServiceId(id);
    const sp = new URLSearchParams(params.toString());
    sp.set("service", String(id));
    router.replace(`/book/${slug}?${sp}`, { scroll: false });
  }

  const paediatrics = doctor?.specialty.slug === "paediatrics";

  function startForm() {
    if (!slot || !user) return;
    setDraftDecided(true);
    setPhase("patient");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (prefilled.current) return;
    prefilled.current = true;
    setValues((v) => ({ ...v, patient_name: v.patient_name || user.full_name }));
    // Reuse contact details from the patient's most recent booking.
    api<Appointment[]>("/bookings/me")
      .then((list) => {
        const last = list.find((a) => a.patient_email && a.patient_phone);
        if (!last) return;
        setValues((v) => ({
          ...v,
          patient_email: v.patient_email || last.patient_email!,
          patient_phone: v.patient_phone || last.patient_phone!.replace(/^\+91/, ""),
        }));
      })
      .catch(() => {});
  }

  function resumeDraft(d: BookingDraft) {
    setDraftDecided(true);
    prefilled.current = true;
    if (d.serviceId !== serviceId) chooseService(d.serviceId);
    setDay(d.day);
    setSlotState({ key: `${d.serviceId}|${d.day}`, value: d.slot });
    setValues(d.values);
    setReferral(null);
    setPhase(d.step);
  }

  function discardDraft() {
    if (storageKey) writeDraft(storageKey, null);
    setDraftDecided(true);
  }

  /** Switch appointment type from inside the form, keeping the time if it still fits. */
  async function changeServiceKeepingSlot(id: number) {
    const target = doctor?.services.find((s) => s.id === id);
    if (!target || !day || !slot || id === serviceId) return;
    try {
      const res = await api<DaySlots>(`/doctors/${slug}/slots?service_id=${id}&date=${day}`);
      const key = `${id}|${day}`;
      chooseService(id);
      setSlotsState({ key, slots: res.slots });
      if (res.slots.includes(slot)) {
        setSlotState({ key, value: slot });
      } else {
        setSlotState(null);
        setPhase("slot");
        toast.error(`${formatTime(slot)} isn't free for a ${target.duration_minutes}-min ${target.name}. Please pick another time.`);
      }
    } catch {
      toast.error("Couldn't check availability for that appointment type.");
    }
  }

  async function submit(): Promise<FieldErrors | void> {
    if (!service || !slot) return;
    setSubmitting(true);
    const form = new FormData();
    form.set("data", JSON.stringify(toPayload(values, service.id, slot, paediatrics)));
    if (referral) form.set("referral", referral);
    try {
      const appt = await api<Appointment>("/bookings", { method: "POST", body: form });
      if (storageKey) writeDraft(storageKey, null);
      router.push(`/appointments/${appt.reference}?new=1`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Your session expired. Please log in again. Your answers are saved as a draft.");
        router.push(`/login?next=${encodeURIComponent(`/book/${slug}?service=${service.id}`)}`);
        return;
      }
      if (err instanceof ApiError && err.status === 422 && Object.keys(err.fields).length) {
        toast.error("Please fix the highlighted fields.");
        return err.fields as FieldErrors;
      }
      toast.error(err instanceof ApiError ? err.message : "Booking failed. Please try again.");
      if (err instanceof ApiError && err.status === 409) {
        // The slot was taken or a rule blocked it: back to the picker with fresh availability.
        setSlotState(null);
        setPhase("slot");
        setRefresh((n) => n + 1);
      }
    }
  }

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState icon={<UserX />} title="Doctor not found" body={error} action={<ButtonLink href="/doctors">Browse doctors</ButtonLink>} />
      </div>
    );

  if (!doctor)
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-80" />
      </div>
    );

  const nextUrl = `/book/${slug}?service=${serviceId ?? ""}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href={`/doctors/${slug}`} className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-signal">
        <ArrowLeft className="size-4" /> Back to profile
      </Link>

      <AnimatePresence>
        {showDraftOffer && savedDraft && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="mb-6 flex flex-col gap-3 rounded-2xl border border-signal/30 bg-signal-tint/60 p-4 sm:flex-row sm:items-center"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-signal shadow-card">
              <History className="size-5" />
            </span>
            <p className="flex-1 text-sm">
              <strong>You have an unfinished booking</strong> for {formatDate(savedDraft.slot)}, {formatTime(savedDraft.slot)}.
              <span className="block text-ink-soft">Saved {formatDate(savedDraft.savedAt)}, {formatTime(savedDraft.savedAt)}. Attached files need to be added again.</span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={discardDraft}>
                Discard
              </Button>
              <Button size="sm" onClick={() => resumeDraft(savedDraft)}>
                Resume
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 border-b border-line p-5 sm:p-6">
            <DoctorAvatar name={doctor.name} accent={doctor.accent} />
            <div>
              <p className="text-sm font-semibold text-signal">{doctor.specialty.name}</p>
              <h1 className="text-xl font-extrabold">Book with {doctor.name}</h1>
              <p className="flex items-center gap-1 text-sm text-ink-soft"><MapPin className="size-3.5" /> {doctor.clinic_name}</p>
            </div>
          </div>

          {formPhase && service && slot ? (
            <BookingForm
              doctor={doctor}
              service={service}
              slot={slot}
              step={formPhase}
              onStep={setPhase}
              values={values}
              onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
              referral={referral}
              onReferral={setReferral}
              onChangeService={changeServiceKeepingSlot}
              onChangeTime={() => setPhase("slot")}
              onSubmit={submit}
              submitting={submitting}
            />
          ) : (
            <div className="space-y-8 p-5 sm:p-6">
              <Step n={1} title="Choose a consultation">
                <div className="grid gap-3 sm:grid-cols-2">
                  {doctor.services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => chooseService(s.id)}
                      aria-pressed={s.id === serviceId}
                      className={cn(
                        "rounded-2xl border-2 p-4 text-left transition-all",
                        s.id === serviceId ? "border-signal bg-signal-tint/60" : "border-line hover:border-signal/50",
                      )}
                    >
                      <p className="font-bold">{s.name}</p>
                      <p className="mt-1 flex items-center gap-3 text-sm text-ink-soft">
                        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {s.duration_minutes} min</span>
                        <span className="font-semibold text-ink">{formatPrice(s.price)}</span>
                      </p>
                    </button>
                  ))}
                </div>
              </Step>

              <div className="grid gap-8 md:grid-cols-2">
                <Step n={2} title="Pick a date">
                  {calendar === null ? (
                    <Skeleton className="h-80" />
                  ) : calendar.some((d) => d.available > 0) ? (
                    <AvailabilityCalendar days={calendar} selected={day} onSelect={setDay} />
                  ) : (
                    <EmptyState icon={<CalendarX2 />} title="Fully booked" body="No free slots in the next 30 days. Try another consultation or doctor." />
                  )}
                </Step>

                <Step n={3} title={day ? formatDayKey(day) : "Pick a time"}>
                  {!day ? (
                    <p className="text-ink-soft">Select a date to see times.</p>
                  ) : slots === null ? (
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <Skeleton key={i} className="h-11 rounded-full" />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-ink-soft">No times left on this day. Pick another date.</p>
                  ) : (
                    <div className="max-h-[420px] space-y-5 overflow-y-auto pr-1">
                      {grouped.map((group) => (
                        <div key={group.label}>
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                            <group.icon className="size-3.5" /> {group.label}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {group.slots.map((s, i) => (
                              <motion.button
                                key={s}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: Math.min(i, 12) * 0.02 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                  setSlot(s);
                                  setPhase("slot");
                                }}
                                aria-pressed={s === slot}
                                className={cn(
                                  "h-11 rounded-full border text-sm font-bold transition-colors",
                                  s === slot
                                    ? "border-signal bg-signal text-white shadow-[0_8px_20px_-8px_rgb(0_107_255/0.7)]"
                                    : "border-signal/30 text-signal hover:border-signal hover:bg-signal-tint",
                                )}
                              >
                                {formatTime(s)}
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Step>
              </div>
            </div>
          )}
        </Card>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <h2 className="text-lg font-bold">{formPhase ? "Your appointment" : "Review your appointment"}</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <Row label="Doctor" value={doctor.name} />
              <Row label="Consultation" value={service ? `${service.name} · ${service.duration_minutes} min` : "—"} />
              <AnimatePresence mode="wait">
                <motion.div key={slot ?? "none"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <Row
                    label="Date & time"
                    value={slot ? `${formatLongDate(slot)}, ${formatTime(slot)}` : "Pick a time slot"}
                    muted={!slot}
                  />
                </motion.div>
              </AnimatePresence>
              {formPhase && values.consultation_mode ? (
                <Row label="Mode" value={MODE_LABELS[values.consultation_mode]} />
              ) : (
                <Row label="Location" value={`${doctor.clinic_name}, ${doctor.location}`} />
              )}
              <div className="flex items-center justify-between border-t border-line pt-4">
                <dt className="font-semibold text-ink-soft">Fee (pay at clinic)</dt>
                <dd className="text-xl font-extrabold">{service ? formatPrice(service.price) : "—"}</dd>
              </div>
            </dl>

            <div className="mt-6">
              {authLoading ? (
                <Skeleton className="h-13 rounded-full" />
              ) : formPhase ? (
                <Button variant="secondary" className="w-full" onClick={() => setPhase("slot")} disabled={submitting}>
                  <Clock className="size-4" /> Change date or time
                </Button>
              ) : user ? (
                <Button size="lg" className="w-full" disabled={!slot} onClick={startForm}>
                  Continue <ArrowRight className="size-5" />
                </Button>
              ) : (
                <ButtonLink href={`/login?next=${encodeURIComponent(nextUrl)}`} size="lg" className="w-full">
                  Log in to book
                </ButtonLink>
              )}
            </div>

            <div className="mt-5 space-y-2 rounded-2xl bg-marble p-4 text-xs text-ink-soft">
              <p className="flex gap-2"><Info className="size-4 shrink-0 text-signal" /> Free cancellation up to 2 hours before your appointment.</p>
              <p className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-signal" /> Your slot is checked again the moment you confirm, so it can never be double-booked.</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-3 font-bold">
        <span className="grid size-7 place-items-center rounded-full bg-ink text-sm text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className={cn("mt-0.5 font-semibold", muted && "text-ink-soft")}>{value}</dd>
    </div>
  );
}
