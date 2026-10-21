"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Baby, Bone, CalendarCheck2, Check, HeartPulse, MousePointer2, ScanFace, Smile, Stethoscope, Undo2 } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { cn } from "@/components/ui";

/** Scenes of the demo, shared by the hero (autoplay) and the scroll showcase. */
export const DEMO_STEPS = [
  { title: "Find the right specialist", body: "Browse by specialty or search by name, clinic or city. Every doctor's fees and timings are upfront." },
  { title: "Real doctor profiles", body: "Qualifications, experience, languages and the next free slot, before you commit to anything." },
  { title: "Live availability", body: "The calendar is computed from working hours, breaks, leave and existing bookings. Full days simply aren't offered." },
  { title: "No double bookings, ever", body: "Two people tapping the same slot at once? The database guarantees only one gets it, and the other is told instantly." },
  { title: "Instant confirmation", body: "You get a unique booking reference the moment you confirm. No calls, no waiting for a callback." },
  { title: "Cancel in one tap", body: "Plans changed? Cancel up to 2 hours before. The slot is released straight away for someone else." },
] as const;

const SCENE_MS = [2600, 2600, 2600, 3600, 2800, 3200];

export function useAutoplayStep(enabled = true) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % DEMO_STEPS.length), SCENE_MS[step]);
    return () => clearTimeout(t);
  }, [step, enabled]);
  return step;
}

export function BookingDemoCard({ step, className }: { step: number; className?: string }) {
  return (
    <div className={cn("w-full max-w-[420px] rounded-[28px] border border-line bg-white p-5 shadow-lift", className)} aria-hidden>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <p className="text-sm font-bold">Book an appointment</p>
        </div>
        <div className="flex gap-1">
          {DEMO_STEPS.map((_, i) => (
            <motion.span
              key={i}
              className="h-1.5 rounded-full"
              animate={{ width: i === step ? 18 : 6, backgroundColor: i <= step ? "#006bff" : "#dbe4ee" }}
            />
          ))}
        </div>
      </div>
      <div className="relative mt-4 h-[340px] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="absolute inset-0"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {[SpecialtyScene, DoctorScene, DateScene, RaceScene, ConfirmScene, CancelScene][step]?.()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SceneTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-soft">{children}</p>;
}

function Cursor({ label, color, from, to, delay = 0.4 }: { label: string; color: string; from: [number, number]; to: [number, number]; delay?: number }) {
  return (
    <motion.div
      className="pointer-events-none absolute z-10 flex items-start"
      initial={{ left: from[0], top: from[1], opacity: 0 }}
      animate={{ left: to[0], top: to[1], opacity: 1 }}
      transition={{ delay, duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
    >
      <MousePointer2 className="size-5 drop-shadow" style={{ color, fill: color }} />
      <span className="ml-0.5 mt-4 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: color }}>
        {label}
      </span>
    </motion.div>
  );
}

function SpecialtyScene() {
  const items = [
    { icon: Stethoscope, name: "General" },
    { icon: HeartPulse, name: "Cardiology" },
    { icon: ScanFace, name: "Dermatology" },
    { icon: Baby, name: "Paediatrics" },
    { icon: Bone, name: "Orthopaedics" },
    { icon: Smile, name: "Dental" },
  ];
  return (
    <div className="relative h-full">
      <SceneTitle>Choose a specialty</SceneTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((it, i) => {
          const chosen = it.name === "Cardiology";
          return (
            <motion.div
              key={it.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                backgroundColor: chosen ? ["#ffffff", "#ffffff", "#006bff"] : "#ffffff",
                color: chosen ? ["#0b3558", "#0b3558", "#ffffff"] : "#0b3558",
              }}
              transition={{ delay: i * 0.06, duration: chosen ? 1.6 : 0.3, times: chosen ? [0, 0.75, 1] : undefined }}
              className="flex items-center gap-2 rounded-2xl border border-line px-3 py-3.5 text-sm font-bold"
            >
              <it.icon className="size-4" /> {it.name}
            </motion.div>
          );
        })}
      </div>
      <Cursor label="You" color="#006bff" from={[40, 300]} to={[290, 38]} delay={0.5} />
    </div>
  );
}

function DoctorScene() {
  const docs = [
    { name: "Dr. Vikram Mehta", meta: "18 yrs · HeartWell Centre", next: "Today, 4:30 PM", grad: "from-[#ff8aa1] to-[#e5486c]", chosen: true },
    { name: "Dr. Meera Krishnan", meta: "15 yrs · Pulse Heart Clinic", next: "Tomorrow, 9:15 AM", grad: "from-[#8b9cff] to-[#3f51e0]" },
  ];
  return (
    <div>
      <SceneTitle>Cardiology · 2 doctors</SceneTitle>
      <div className="space-y-3">
        {docs.map((d, i) => (
          <motion.div
            key={d.name}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0, borderColor: d.chosen ? ["#dbe4ee", "#dbe4ee", "#006bff"] : "#dbe4ee" }}
            transition={{ delay: i * 0.12, duration: d.chosen ? 1.5 : 0.35, times: d.chosen ? [0, 0.7, 1] : undefined }}
            className="rounded-2xl border-2 p-4"
          >
            <div className="flex items-center gap-3">
              <div className={cn("grid size-11 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white", d.grad)}>
                {d.name.split(" ").slice(1).map((p) => p[0]).join("")}
              </div>
              <div>
                <p className="font-bold">{d.name}</p>
                <p className="text-xs text-ink-soft">{d.meta}</p>
              </div>
            </div>
            <p className="mt-3 inline-block rounded-full bg-success-tint px-2.5 py-1 text-xs font-bold text-success">Next: {d.next}</p>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.3 }}
        className="mt-4 rounded-2xl bg-marble p-3 text-xs text-ink-soft"
      >
        MBBS, MD, DM (Cardiology) · English, Hindi, Gujarati
      </motion.div>
    </div>
  );
}

function DateScene() {
  const blocked = new Set([0, 6, 7, 13, 14, 20, 21]);
  const full = new Set([3, 10]);
  return (
    <div>
      <SceneTitle>October · pick a date</SceneTitle>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold uppercase text-ink-soft">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 28 }).map((_, i) => {
          const day = i + 1;
          const off = blocked.has(i) || full.has(i);
          const chosen = i === 9;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{
                opacity: 1,
                scale: chosen ? [1, 1, 1.15, 1] : 1,
                backgroundColor: chosen ? ["#e8f1ff", "#e8f1ff", "#006bff", "#006bff"] : off ? "#ffffff" : "#e8f1ff",
                color: chosen ? ["#006bff", "#006bff", "#ffffff", "#ffffff"] : off ? "#c3cfdc" : "#006bff",
              }}
              transition={{ delay: i * 0.015, duration: chosen ? 1.8 : 0.25, times: chosen ? [0, 0.6, 0.8, 1] : undefined }}
              className="grid aspect-square place-items-center rounded-full text-xs font-bold"
            >
              {day}
            </motion.div>
          );
        })}
      </div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="mt-4 text-xs text-ink-soft">
        Weekends, leave days and fully-booked days are greyed out automatically.
      </motion.p>
    </div>
  );
}

function RaceScene() {
  const slots = ["9:15 AM", "9:45 AM", "10:30 AM", "11:00 AM", "4:30 PM", "5:00 PM"];
  const target = 4;
  return (
    <div className="relative h-full">
      <SceneTitle>Fri, 10 Oct · pick a time</SceneTitle>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, y: 6 }}
            animate={{
              opacity: 1,
              y: 0,
              backgroundColor: i === target ? ["#ffffff", "#ffffff", "#006bff"] : "#ffffff",
              color: i === target ? ["#006bff", "#006bff", "#ffffff"] : "#006bff",
            }}
            transition={{ delay: i * 0.04, duration: i === target ? 1.45 : 0.25, times: i === target ? [0, 0.85, 1] : undefined }}
            className="flex h-10 items-center justify-center gap-1 rounded-full border border-signal/40 text-xs font-bold"
          >
            {i === target && (
              <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} transition={{ delay: 1.45 }}>
                <Check className="size-3.5" />
              </motion.span>
            )}
            {s}
          </motion.div>
        ))}
      </div>
      <Cursor label="You" color="#006bff" from={[10, 260]} to={[168, 76]} delay={0.3} />
      <Cursor label="Someone else" color="#476788" from={[330, 280]} to={[214, 94]} delay={0.45} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.9 }}
        className="absolute inset-x-0 bottom-14 rounded-2xl border border-danger/20 bg-danger-tint p-3 text-xs"
      >
        <p className="font-bold text-danger">Someone else: “Someone just booked this slot.”</p>
        <p className="mt-0.5 text-ink-soft">Their screen refreshes with the times still free.</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.3 }}
        className="absolute inset-x-0 bottom-0 rounded-2xl bg-success-tint p-3 text-xs font-bold text-success"
      >
        You: 4:30 PM is yours. Exactly one booking was saved.
      </motion.div>
    </div>
  );
}

function Ticket({ cancelled = false }: { cancelled?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Booking reference</p>
          <p className="font-mono text-xl font-extrabold tracking-wider">MS-4K7Q9P</p>
        </div>
        <motion.span
          animate={{ backgroundColor: cancelled ? ["#0e9f6e", "#0e9f6e", "#d93f4c"] : "#0e9f6e" }}
          transition={{ duration: 1.6, times: [0, 0.8, 1] }}
          className="rounded-full px-2.5 py-1 text-[10px] font-bold"
        >
          {cancelled ? <DelayedText first="CONFIRMED" then="CANCELLED" delay={1300} /> : "CONFIRMED"}
        </motion.span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 text-xs">
        <div>
          <p className="font-semibold uppercase text-ink-soft">Doctor</p>
          <p className="font-bold">Dr. Vikram Mehta</p>
        </div>
        <div>
          <p className="font-semibold uppercase text-ink-soft">When</p>
          <p className="font-bold">Fri 10 Oct, 4:30 PM</p>
        </div>
        <div>
          <p className="font-semibold uppercase text-ink-soft">Consultation</p>
          <p className="font-bold">Cardiology · 30 min</p>
        </div>
        <div>
          <p className="font-semibold uppercase text-ink-soft">Fee</p>
          <p className="font-bold">₹1,500</p>
        </div>
      </div>
    </div>
  );
}

function DelayedText({ first, then, delay }: { first: string; then: string; delay: number }) {
  const [text, setText] = useState(first);
  useEffect(() => {
    const t = setTimeout(() => setText(then), delay);
    return () => clearTimeout(t);
  }, [then, delay]);
  return <>{text}</>;
}

function ConfirmScene() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="grid size-12 place-items-center rounded-full bg-success-tint"
        >
          <svg viewBox="0 0 24 24" className="size-7">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="#0e9f6e"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            />
          </svg>
        </motion.div>
        <div>
          <p className="text-lg font-extrabold">You&apos;re booked!</p>
          <p className="text-xs text-ink-soft">Confirmed in under a second</p>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, y: 20, rotateX: 20 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.4, type: "spring", stiffness: 140, damping: 16 }} style={{ transformPerspective: 800 }}>
        <Ticket />
      </motion.div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
        <CalendarCheck2 className="size-3.5 text-signal" /> Saved to My appointments
      </motion.p>
    </div>
  );
}

function CancelScene() {
  return (
    <div className="relative h-full">
      <Ticket cancelled />
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-marble p-3 text-xs">
        <span className="text-ink-soft">Free cancellation until Fri, 2:30 PM</span>
        <motion.span
          animate={{ scale: [1, 1, 0.92, 1] }}
          transition={{ duration: 1.3, times: [0, 0.7, 0.85, 1] }}
          className="rounded-full border border-danger/30 bg-white px-3 py-1.5 font-bold text-danger"
        >
          Cancel
        </motion.span>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.7 }}
        className="mt-3 flex items-center gap-3 rounded-2xl border border-signal/30 bg-signal-tint p-3 text-xs"
      >
        <Undo2 className="size-4 text-signal" />
        <span>
          <strong className="text-signal">4:30 PM is free again</strong>
          <span className="block text-ink-soft">Released instantly for other patients.</span>
        </span>
      </motion.div>
      <Cursor label="You" color="#006bff" from={[60, 300]} to={[318, 178]} delay={0.2} />
    </div>
  );
}
