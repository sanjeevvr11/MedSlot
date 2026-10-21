import { Download, FileText } from "lucide-react";
import { MODE_LABELS, PATIENT_TYPE_LABELS, PLATFORM_LABELS, formatFileSize } from "@/lib/booking-form";
import type { Appointment } from "@/lib/types";

/** Patient details and intake answers collected by the booking form. */
export function IntakeSummary({ appt, referralHref }: { appt: Appointment; referralHref: string }) {
  if (!appt.patient_name) return null;
  const d = appt.details ?? {};
  const rows: [string, string][] = [
    ["Patient", appt.patient_name],
    ...(d.child_name ? ([["Child", `${d.child_name}, ${d.child_age} yrs`]] as [string, string][]) : []),
    ["Email", appt.patient_email ?? ""],
    ["Mobile", appt.patient_phone ?? ""],
    ["Visit", PATIENT_TYPE_LABELS[appt.patient_type ?? ""] ?? ""],
    ["Mode", MODE_LABELS[appt.consultation_mode ?? ""] ?? ""],
  ];
  if (d.video_platform) rows.push(["Video app", PLATFORM_LABELS[String(d.video_platform)] ?? String(d.video_platform)]);
  if (d.previous_reference) rows.push(["Previous reference", String(d.previous_reference)]);
  if (d.allergies) rows.push(["Allergies", String(d.allergies)]);
  if (d.accessibility_needs) rows.push(["Accessibility", String(d.accessibility_needs)]);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
            <dd className="mt-0.5 break-words font-semibold">{value}</dd>
          </div>
        ))}
        {appt.reason && (
          <div className="col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reason for visit</dt>
            <dd className="mt-0.5 whitespace-pre-line font-medium">{appt.reason}</dd>
          </div>
        )}
      </dl>
      {appt.document && (
        <a
          href={referralHref}
          className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:border-signal/50 hover:bg-signal-tint/40"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal-tint text-signal">
            <FileText className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{appt.document.filename}</span>
            <span className="text-xs text-ink-soft">Referral · {formatFileSize(appt.document.size_bytes)}</span>
          </span>
          <Download className="size-4 text-signal" />
        </a>
      )}
    </div>
  );
}
