"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, BriefcaseMedical, Clock, MapPin } from "lucide-react";
import { DoctorAvatar, SpecialtyIcon } from "@/components/medical";
import { formatNextAvailable, formatPrice } from "@/lib/format";
import type { DoctorSummary } from "@/lib/types";

export function DoctorCard({ doctor, index = 0 }: { doctor: DoctorSummary; index?: number }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      whileHover={{ y: -4 }}
      className="h-full"
    >
      <Link
        href={`/doctors/${doctor.slug}`}
        className="group flex h-full flex-col rounded-2xl border border-line bg-white p-5 shadow-card transition-shadow hover:shadow-lift"
      >
        <div className="flex items-start gap-4">
          <DoctorAvatar name={doctor.name} accent={doctor.accent} />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold group-hover:text-signal">{doctor.name}</h3>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-signal">
              <SpecialtyIcon icon={doctor.specialty.icon} className="size-4" />
              {doctor.specialty.name}
            </p>
            <p className="mt-0.5 truncate text-sm text-ink-soft">{doctor.qualifications}</p>
          </div>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm text-ink-soft">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">Location</dt>
            <dd className="truncate">{doctor.clinic_name} · {doctor.location}</dd>
          </div>
          <div className="flex items-center gap-2">
            <BriefcaseMedical className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">Experience</dt>
            <dd>{doctor.years_experience} years experience</dd>
          </div>
        </dl>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            {doctor.next_available ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-1 text-xs font-semibold text-success">
                <Clock className="size-3.5" /> Next: {formatNextAvailable(doctor.next_available)}
              </p>
            ) : (
              <p className="rounded-full bg-marble px-2.5 py-1 text-xs font-semibold text-ink-soft">No slots this week</p>
            )}
            {doctor.price_from !== null && (
              <p className="mt-2 text-sm text-ink-soft">
                From <span className="font-bold text-ink">{formatPrice(doctor.price_from)}</span>
              </p>
            )}
          </div>
          <span className="grid size-10 place-items-center rounded-full bg-signal-tint text-signal transition-all group-hover:bg-signal group-hover:text-white">
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
