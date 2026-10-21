"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";
import type { CalendarDay } from "@/lib/types";

// Dates arrive as clinic-local "YYYY-MM-DD" keys; we do the grid maths in UTC
// so the visitor's own time zone can never shift a day.
const toDate = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (key: string) => key.slice(0, 7);
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function AvailabilityCalendar({
  days,
  selected,
  onSelect,
}: {
  days: CalendarDay[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const byKey = useMemo(() => new Map(days.map((d) => [d.date, d.available])), [days]);
  const months = useMemo(() => [...new Set(days.map((d) => monthKey(d.date)))], [days]);
  const [monthIndex, setMonthIndex] = useState(0);
  const current = months[Math.min(monthIndex, months.length - 1)];
  const today = days[0]?.date;

  const cells = useMemo(() => {
    if (!current) return [];
    const first = toDate(`${current}-01`);
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(toKey(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d))));
    }
    return out;
  }, [current]);

  if (!current) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">{monthLabel.format(toDate(`${current}-01`))}</h3>
        <div className="flex gap-1">
          <button
            className="grid size-9 place-items-center rounded-full text-ink hover:bg-marble disabled:opacity-30"
            onClick={() => setMonthIndex((i) => i - 1)}
            disabled={monthIndex === 0}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            className="grid size-9 place-items-center rounded-full text-ink hover:bg-marble disabled:opacity-30"
            onClick={() => setMonthIndex((i) => i + 1)}
            disabled={monthIndex >= months.length - 1}
            aria-label="Next month"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <motion.div
        key={current}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        className="grid grid-cols-7 gap-1"
        role="grid"
      >
        {cells.map((key, i) => {
          if (!key) return <div key={`pad-${i}`} />;
          const available = byKey.get(key) ?? 0;
          const bookable = available > 0;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              disabled={!bookable}
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              aria-label={`${dayLabel.format(toDate(key))}${bookable ? `, ${available} slots` : ", unavailable"}`}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-full text-[15px] font-semibold transition-colors",
                bookable ? "bg-signal-tint text-signal hover:bg-signal/20" : "text-ink-soft/40",
                isSelected && "bg-signal! text-white!",
              )}
            >
              {isSelected && (
                <motion.span layoutId="calendar-selected" className="absolute inset-0 rounded-full bg-signal" />
              )}
              <span className="relative">{toDate(key).getUTCDate()}</span>
              {key === today && (
                <span className={cn("absolute bottom-1.5 size-1 rounded-full", isSelected ? "bg-white" : "bg-signal")} />
              )}
            </button>
          );
        })}
      </motion.div>
      <p className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
        <span className="inline-block size-3 rounded-full bg-signal-tint" /> Days with free slots
      </p>
    </div>
  );
}

export const formatDayKey = (key: string) => dayLabel.format(toDate(key));
