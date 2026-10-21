"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search, SearchX, X } from "lucide-react";
import { DoctorCard } from "@/components/doctor-card";
import { SpecialtyIcon } from "@/components/medical";
import { Button, EmptyState, PageHeader, Skeleton, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { DoctorSummary, Specialty } from "@/lib/types";

const PRICE_OPTIONS = [
  { label: "Any fee", value: "" },
  { label: "Up to ₹500", value: "500" },
  { label: "Up to ₹1,000", value: "1000" },
  { label: "Up to ₹1,500", value: "1500" },
];

export function DoctorSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const specialty = params.get("specialty") ?? "";
  const maxPrice = params.get("max_price") ?? "";
  const q = params.get("q") ?? "";

  const [query, setQuery] = useState(q);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const requestKey = `${q}|${specialty}|${maxPrice}`;
  const [result, setResult] = useState<{ key: string; doctors?: DoctorSummary[]; error?: string } | null>(null);
  const current = result?.key === requestKey ? result : null;
  const doctors = current?.doctors ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    api<Specialty[]>("/specialties").then(setSpecialties).catch(() => {});
  }, []);

  // Keep the URL as the single source of truth so filters are shareable.
  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }

  // Debounce typing into the URL.
  useEffect(() => {
    if (query === q) return;
    const t = setTimeout(() => update({ q: query.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (specialty) sp.set("specialty", specialty);
    if (maxPrice) sp.set("max_price", maxPrice);
    const key = `${q}|${specialty}|${maxPrice}`;
    api<DoctorSummary[]>(`/doctors?${sp}`, { signal: controller.signal })
      .then((doctors) => setResult({ key, doctors }))
      .catch((err) => {
        if (err.name !== "AbortError")
          setResult({ key, error: err instanceof ApiError ? err.message : "Couldn't load doctors." });
      });
    return () => controller.abort();
  }, [q, specialty, maxPrice]);

  const filtersActive = !!(q || specialty || maxPrice);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Find a doctor" title="Book trusted specialists" body="Search by name, specialty, clinic or city, and see who's available soonest." />

      <div className="sticky top-16 z-30 -mx-4 mb-8 space-y-3 bg-white/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:border-line sm:p-4 sm:shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search doctors</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “cardiology”, “Pune” or “vaccination”"
              className="h-12 w-full rounded-full border border-line bg-white pl-12 pr-10 text-[15px] outline-none transition focus:border-signal focus:ring-4 focus:ring-signal/10"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-soft hover:bg-marble"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
          <select
            value={maxPrice}
            onChange={(e) => update({ max_price: e.target.value })}
            className="h-12 rounded-full border border-line bg-white px-5 text-[15px] font-semibold outline-none focus:border-signal"
            aria-label="Maximum consultation fee"
          >
            {PRICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip active={!specialty} onClick={() => update({ specialty: "" })}>
            All specialties
          </Chip>
          {specialties.map((s) => (
            <Chip key={s.slug} active={specialty === s.slug} onClick={() => update({ specialty: s.slug })}>
              <SpecialtyIcon icon={s.icon} className="size-4" /> {s.name}
            </Chip>
          ))}
        </div>
      </div>

      {error ? (
        <EmptyState icon={<SearchX />} title="Something went wrong" body={error} />
      ) : doctors === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : doctors.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="No doctors match"
          body="Try a different search term, or clear the filters to see everyone."
          action={
            filtersActive && (
              <Button variant="secondary" onClick={() => { setQuery(""); router.replace(pathname); }}>
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-4 text-sm font-semibold text-ink-soft">
            {doctors.length} doctor{doctors.length === 1 ? "" : "s"} available
          </p>
          <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {doctors.map((d, i) => (
                <DoctorCard key={d.id} doctor={d} index={i} />
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        active ? "border-signal text-white" : "border-line bg-white text-ink hover:border-signal hover:text-signal",
      )}
    >
      {active && <motion.span layoutId="chip-active" className="absolute inset-0 -z-10 rounded-full bg-signal" />}
      {children}
    </button>
  );
}
