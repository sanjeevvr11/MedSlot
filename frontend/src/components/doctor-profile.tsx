"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, BriefcaseMedical, CalendarClock, Clock, Languages, MapPin, UserX } from "lucide-react";
import { DoctorAvatar, SpecialtyIcon } from "@/components/medical";
import { ButtonLink, Card, EmptyState, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { WEEKDAYS, formatClock, formatNextAvailable, formatPrice } from "@/lib/format";
import type { DoctorDetail } from "@/lib/types";

export function DoctorProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DoctorDetail>(`/doctors/${slug}`)
      .then(setDoctor)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this doctor."));
  }, [slug]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState icon={<UserX />} title="Doctor not found" body={error} action={<ButtonLink href="/doctors">Browse doctors</ButtonLink>} />
      </div>
    );
  if (!doctor)
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <Skeleton className="h-48" />
        <Skeleton className="h-72" />
      </div>
    );

  const hoursByDay = WEEKDAYS.map((day, i) => ({
    day,
    windows: doctor.working_hours.filter((w) => w.weekday === i),
    breaks: doctor.breaks.filter((b) => b.weekday === i),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/doctors" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-signal">
        <ArrowLeft className="size-4" /> All doctors
      </Link>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-signal-tint via-white to-signal-tint" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
            <DoctorAvatar name={doctor.name} accent={doctor.accent} size="lg" />
            <div className="flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-signal">
                <SpecialtyIcon icon={doctor.specialty.icon} className="size-4" /> {doctor.specialty.name}
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{doctor.name}</h1>
              <p className="text-ink-soft">{doctor.qualifications}</p>
            </div>
            {doctor.next_available && (
              <div className="rounded-2xl bg-success-tint px-4 py-3 text-success">
                <p className="text-xs font-bold uppercase tracking-wide">Next available</p>
                <p className="font-bold">{formatNextAvailable(doctor.next_available)}</p>
              </div>
            )}
          </div>
          <div className="relative mt-6 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
            <p className="flex items-center gap-2"><MapPin className="size-4 text-signal" /> {doctor.clinic_name}, {doctor.location}</p>
            <p className="flex items-center gap-2"><BriefcaseMedical className="size-4 text-signal" /> {doctor.years_experience} years experience</p>
            <p className="flex items-center gap-2"><Languages className="size-4 text-signal" /> {doctor.languages}</p>
          </div>
        </Card>
      </motion.div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xl font-bold">About</h2>
            <p className="leading-relaxed text-ink-soft">{doctor.bio}</p>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold">Consultations</h2>
            <div className="space-y-3">
              {doctor.services.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                >
                  <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <h3 className="font-bold">{s.name}</h3>
                      <p className="text-sm text-ink-soft">{s.description}</p>
                      <p className="mt-2 flex items-center gap-4 text-sm">
                        <span className="inline-flex items-center gap-1 text-ink-soft"><Clock className="size-4" /> {s.duration_minutes} min</span>
                        <span className="font-bold">{formatPrice(s.price)}</span>
                      </p>
                    </div>
                    <ButtonLink href={`/book/${doctor.slug}?service=${s.id}`}>
                      <CalendarClock className="size-4" /> Book
                    </ButtonLink>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>
        </div>

        <aside>
          <Card className="p-5">
            <h2 className="mb-4 font-bold">Weekly hours</h2>
            <ul className="space-y-2.5 text-sm">
              {hoursByDay.map(({ day, windows, breaks }) => (
                <li key={day} className="flex justify-between gap-3">
                  <span className="font-semibold">{day.slice(0, 3)}</span>
                  <span className="text-right text-ink-soft">
                    {windows.length ? (
                      <>
                        {windows.map((w) => `${formatClock(w.start_time)} – ${formatClock(w.end_time)}`).join(", ")}
                        {breaks.map((b) => (
                          <span key={b.start_time} className="block text-xs">
                            {b.label}: {formatClock(b.start_time)} – {formatClock(b.end_time)}
                          </span>
                        ))}
                      </>
                    ) : (
                      "Closed"
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-4 text-xs text-ink-soft">All times are India Standard Time (IST).</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
