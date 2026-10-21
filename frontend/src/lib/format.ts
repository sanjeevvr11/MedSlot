// All appointment times are shown in the clinic's time zone, whatever the
// visitor's device is set to.
export const CLINIC_TZ = "Asia/Kolkata";
// India has no daylight saving, so the offset is fixed. Used to build ISO
// strings from admin date/time inputs.
export const CLINIC_UTC_OFFSET = "+05:30";

const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: CLINIC_TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: CLINIC_TZ, weekday: "short", day: "numeric", month: "short" });
const longDateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: CLINIC_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TZ, hour: "2-digit", hourCycle: "h23" });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso)).toUpperCase();
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatLongDate = (iso: string) => longDateFmt.format(new Date(iso));

/** YYYY-MM-DD of an instant, in clinic time. */
export const clinicDayKey = (d: Date | string) => dayKeyFmt.format(new Date(d));
export const clinicHour = (iso: string) => Number(hourFmt.format(new Date(iso)));

export function formatRelativeDay(iso: string): string {
  const key = clinicDayKey(iso);
  const today = clinicDayKey(new Date());
  const tomorrow = clinicDayKey(new Date(Date.now() + 86_400_000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return formatDate(iso);
}

export const formatNextAvailable = (iso: string) => `${formatRelativeDay(iso)}, ${formatTime(iso)}`;

const priceFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatPrice = (value: number) => priceFmt.format(value);

/** "09:00:00" -> "9:00 AM" */
export function formatClock(hms: string): string {
  const [h, m] = hms.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function initials(name: string): string {
  return name
    .replace(/^Dr\.\s*/, "")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
