"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CalendarClock,
  Clock3,
  LockKeyhole,
  Search,
  ShieldCheck,
  Undo2,
  Zap,
} from "lucide-react";
import { DoctorCard } from "@/components/doctor-card";
import { SpecialtyIcon } from "@/components/medical";
import { ButtonLink, Skeleton, cn } from "@/components/ui";
import { BookingDemoCard, DEMO_STEPS, useAutoplayStep } from "@/components/home/booking-demo";
import { api } from "@/lib/api";
import type { DoctorSummary, Specialty } from "@/lib/types";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: "easeOut" },
} as const;

export function Home() {
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [doctors, setDoctors] = useState<DoctorSummary[] | null>(null);

  useEffect(() => {
    api<Specialty[]>("/specialties").then(setSpecialties).catch(() => setSpecialties([]));
    api<DoctorSummary[]>("/doctors").then(setDoctors).catch(() => setDoctors([]));
  }, []);

  return (
    <>
      <Hero />
      <StatsBand doctors={doctors?.length} specialties={specialties?.length} />
      <Specialties specialties={specialties} />
      <ScrollShowcase />
      <MobileHowItWorks />
      <FeaturedDoctors doctors={doctors} />
      <WhyMedSlot />
      <FinalCta />
    </>
  );
}

/* --------------------------------- Hero ---------------------------------- */

const HEADLINE = ["See", "a", "doctor,", "not", "a", "waiting", "room."];

function Hero() {
  const step = useAutoplayStep();
  const router = useRouter();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const cardY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <section ref={ref} className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <motion.div
        className="absolute -left-40 top-20 size-[28rem] rounded-full bg-signal/15 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-32 top-0 size-[24rem] rounded-full bg-[#7cc4ff]/25 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, 30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:pb-28">
        <div>
          <h1 className="text-[2.75rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            {HEADLINE.map((word, i) => (
              <motion.span
                key={i}
                className={cn("mr-[0.22em] inline-block", (word === "doctor," || word === "room.") && "text-signal")}
                initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: 0.15 + i * 0.07, duration: 0.5, ease: "easeOut" }}
              >
                {word}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl"
          >
            MedSlot shows you which doctors are free, right now, and books your visit in three clicks. No phone
            calls, no back-and-forth, no surprises.
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/doctors${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
            }}
            className="mt-8 flex max-w-xl items-center gap-2 rounded-full border border-line bg-white p-2 shadow-lift"
          >
            <Search className="ml-3 size-5 shrink-0 text-ink-soft" aria-hidden />
            <label htmlFor="hero-search" className="sr-only">
              Search doctors, specialties or cities
            </label>
            <input
              id="hero-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cardiologist, dentist, Pune…"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-soft/60"
            />
            <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full bg-signal px-5 font-semibold text-white transition hover:bg-signal-dark">
              Find doctors <ArrowRight className="hidden size-4 sm:block" />
            </button>
          </motion.form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft"
          >
            <span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-4 text-success" /> Verified profiles</span>
            <span className="inline-flex items-center gap-1.5"><Undo2 className="size-4 text-success" /> Free cancellation</span>
            <span className="inline-flex items-center gap-1.5"><LockKeyhole className="size-4 text-success" /> Secure accounts</span>
          </motion.div>
        </div>

        <motion.div
          style={{ y: cardY }}
          initial={{ opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7, ease: "easeOut" }}
          className="relative mx-auto w-full max-w-[420px]"
        >
          <BookingDemoCard step={step} />
          <FloatingBadge className="-left-24 top-[55%] hidden xl:flex" delay={1.2} icon={<Clock3 className="size-4" />} tone="bg-signal-tint text-signal">
            {DEMO_STEPS[step].title}
          </FloatingBadge>
          <FloatingBadge className="-right-10 -bottom-5 hidden sm:flex" delay={1.5} icon={<ShieldCheck className="size-4" />} tone="bg-success-tint text-success">
            Slot locked for you
          </FloatingBadge>
        </motion.div>
      </div>
    </section>
  );
}

function FloatingBadge({
  className,
  delay,
  icon,
  tone,
  children,
}: {
  className?: string;
  delay: number;
  icon: React.ReactNode;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={cn("absolute z-10 items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-sm font-bold shadow-lift", className)}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
      transition={{ opacity: { delay }, scale: { delay }, y: { delay, duration: 4, repeat: Infinity, ease: "easeInOut" } }}
      aria-hidden
    >
      <span className={cn("grid size-7 place-items-center rounded-lg", tone)}>{icon}</span>
      {children}
    </motion.div>
  );
}

/* ------------------------------- Stats band ------------------------------- */

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, { duration: 1.4, ease: "easeOut", onUpdate: (v) => setDisplay(Math.round(v)) });
    return () => controls.stop();
  }, [inView, value]);
  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

function StatsBand({ doctors, specialties }: { doctors?: number; specialties?: number }) {
  const stats = [
    { value: doctors ?? 0, suffix: "", label: "Specialist doctors" },
    { value: specialties ?? 0, suffix: "", label: "Specialties" },
    { value: 30, suffix: " days", label: "Booking window" },
  ];
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8">
        {stats.map((s, i) => (
          <motion.div key={s.label} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="text-center sm:text-left">
            <p className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              {doctors === undefined && i < 2 ? "–" : <Counter value={s.value} suffix={s.suffix} />}
            </p>
            <p className="mt-1 text-sm font-semibold text-white/60">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- Specialties ------------------------------ */

function SectionHeading({ eyebrow, title, body, center }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <motion.div {...fadeUp} className={cn("mb-12 max-w-2xl", center && "mx-auto text-center")}>
      <p className="mb-3 text-sm font-bold uppercase tracking-wider text-signal">{eyebrow}</p>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h2>
      {body && <p className="mt-4 text-lg text-ink-soft">{body}</p>}
    </motion.div>
  );
}

function Specialties({ specialties }: { specialties: Specialty[] | null }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeading eyebrow="Browse by specialty" title="The right specialist, a tap away" body="From a quick check-up to a cardiology review, find doctors by what you need." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {specialties === null
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)
          : specialties.map((s, i) => (
              <motion.div key={s.slug} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.06 }}>
                <Link
                  href={`/doctors?specialty=${s.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-signal/40 hover:shadow-lift sm:p-6"
                >
                  <div className="absolute -right-10 -top-10 size-32 rounded-full bg-signal-tint opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative grid size-12 place-items-center rounded-2xl bg-signal-tint text-signal transition-colors group-hover:bg-signal group-hover:text-white">
                    <SpecialtyIcon icon={s.icon} className="size-6" />
                  </div>
                  <h3 className="relative mt-4 text-lg font-bold">{s.name}</h3>
                  <p className="relative mt-1 hidden text-sm text-ink-soft sm:block">{s.description}</p>
                  <p className="relative mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-signal">
                    {s.doctor_count} doctor{s.doctor_count === 1 ? "" : "s"}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </p>
                </Link>
              </motion.div>
            ))}
      </div>
    </section>
  );
}

/* ---------------------- Scroll-driven showcase (desktop) ------------------ */

function ScrollShowcase() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(DEMO_STEPS.length - 1, Math.max(0, Math.floor(v * DEMO_STEPS.length))));
  });
  const progressHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section ref={ref} id="how" className="relative hidden bg-marble lg:block" style={{ height: `${DEMO_STEPS.length * 75 + 100}vh` }}>
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_440px] items-center gap-16 px-8">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-wider text-signal">How MedSlot works</p>
            <h2 className="max-w-lg text-5xl font-extrabold tracking-tight">From “I need a doctor” to booked.</h2>
            <div className="relative mt-10 pl-8">
              <div className="absolute left-0 top-1 h-[calc(100%-0.5rem)] w-0.5 rounded-full bg-line">
                <motion.div className="w-full rounded-full bg-signal" style={{ height: progressHeight }} />
              </div>
              <ol className="space-y-5">
                {DEMO_STEPS.map((s, i) => (
                  <li key={s.title}>
                    <motion.div animate={{ opacity: i === active ? 1 : 0.35 }} transition={{ duration: 0.3 }}>
                      <p className="flex items-center gap-3 text-lg font-bold">
                        <span
                          className={cn(
                            "grid size-7 place-items-center rounded-full text-xs transition-colors",
                            i <= active ? "bg-signal text-white" : "bg-white text-ink-soft",
                          )}
                        >
                          {i + 1}
                        </span>
                        {s.title}
                      </p>
                      <motion.p
                        initial={false}
                        animate={{ height: i === active ? "auto" : 0, opacity: i === active ? 1 : 0 }}
                        className="ml-10 max-w-md overflow-hidden text-ink-soft"
                      >
                        <span className="block pt-1.5">{s.body}</span>
                      </motion.p>
                    </motion.div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-8 rounded-full bg-signal/20 blur-3xl" />
            <BookingDemoCard step={active} className="relative" />
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileHowItWorks() {
  const steps = [
    { icon: Search, title: "Choose a doctor", body: "Search by specialty, name or city and compare fees and next available slots." },
    { icon: CalendarClock, title: "Pick a slot", body: "See live availability. Booked, break and leave times are never offered." },
    { icon: CalendarCheck2, title: "Get confirmed", body: "Instant booking reference. Cancel free up to 2 hours before." },
  ];
  return (
    <section id="how-mobile" className="bg-marble px-4 py-20 sm:px-6 lg:hidden">
      <SectionHeading eyebrow="How it works" title="Booked in three steps" />
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div key={s.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }} className="rounded-3xl bg-white p-6 shadow-card">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-signal text-white">
                <s.icon className="size-5" />
              </span>
              <span className="text-sm font-bold text-ink-soft">Step {i + 1}</span>
            </div>
            <h3 className="text-lg font-bold">{s.title}</h3>
            <p className="mt-1 text-ink-soft">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- Featured doctors --------------------------- */

function FeaturedDoctors({ doctors }: { doctors: DoctorSummary[] | null }) {
  const featured = doctors
    ? [...doctors].sort((a, b) => (a.next_available ?? "9").localeCompare(b.next_available ?? "9")).slice(0, 3)
    : null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading eyebrow="Available soon" title="Doctors with open slots" body="Sorted by who can see you soonest." />
        <motion.div {...fadeUp} className="mb-12">
          <ButtonLink href="/doctors" variant="secondary">
            View all doctors <ArrowRight className="size-4" />
          </ButtonLink>
        </motion.div>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {featured === null
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 w-[85%] shrink-0 md:w-auto" />)
          : featured.map((d, i) => (
              <div key={d.id} className="w-[85%] shrink-0 snap-start md:w-auto">
                <DoctorCard doctor={d} index={i} />
              </div>
            ))}
      </div>
    </section>
  );
}

/* -------------------------------- Why MedSlot ----------------------------- */

function WhyMedSlot() {
  const features = [
    { icon: Zap, title: "Real-time availability", body: "Slots are calculated live from working hours, breaks, leave and existing bookings." },
    { icon: ShieldCheck, title: "No double bookings", body: "A database-level guarantee: two patients can never hold the same doctor's time." },
    { icon: Undo2, title: "Easy cancellation", body: "Cancel free up to 2 hours before. The slot is released for others instantly." },
    { icon: LockKeyhole, title: "Secure by design", body: "Argon2-hashed passwords, server-side sessions, and you only ever see your own bookings." },
  ];
  return (
    <section className="bg-marble">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading center eyebrow="Why MedSlot" title="Built for trust, not just looks" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className="rounded-3xl border border-line bg-white p-6 shadow-card"
            >
              <div className="grid size-12 place-items-center rounded-2xl bg-ink text-white">
                <f.icon className="size-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-ink-soft">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Final CTA ------------------------------ */

function FinalCta() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <motion.div
        {...fadeUp}
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-ink px-6 py-16 text-center text-white sm:px-16"
      >
        <div className="bg-grid absolute inset-0 opacity-20 invert" />
        <motion.div
          className="absolute left-1/2 top-0 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/50 blur-3xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            Your next appointment is three clicks away.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-white/70">Create a free account and book in under a minute.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/register" size="lg">
              Get started free <ArrowRight className="size-5" />
            </ButtonLink>
            <ButtonLink href="/doctors" size="lg" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              Browse doctors
            </ButtonLink>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
