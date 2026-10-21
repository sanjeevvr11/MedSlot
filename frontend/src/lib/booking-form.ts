// Booking intake form: values, per-step validation (mirrors the API's rules),
// display labels and draft persistence.

export type FormStep = "patient" | "appointment" | "review";
export const FORM_STEPS: { key: FormStep; label: string }[] = [
  { key: "patient", label: "Patient details" },
  { key: "appointment", label: "Appointment details" },
  { key: "review", label: "Review & confirm" },
];

export interface IntakeValues {
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  patient_type: "" | "first_time" | "returning";
  previous_reference: string;
  allergies: string;
  child_name: string;
  child_age: string;
  consultation_mode: "" | "in_person" | "video" | "phone";
  video_platform: "" | "google_meet" | "zoom" | "whatsapp";
  accessibility_needs: string;
  reason: string;
  consent: boolean;
}

export const EMPTY_INTAKE: IntakeValues = {
  patient_name: "",
  patient_email: "",
  patient_phone: "",
  patient_type: "",
  previous_reference: "",
  allergies: "",
  child_name: "",
  child_age: "",
  consultation_mode: "",
  video_platform: "",
  accessibility_needs: "",
  reason: "",
  consent: false,
};

export const MODE_LABELS: Record<string, string> = {
  in_person: "In person at the clinic",
  video: "Video consultation",
  phone: "Phone consultation",
};

export const PLATFORM_LABELS: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  whatsapp: "WhatsApp video",
};

export const PATIENT_TYPE_LABELS: Record<string, string> = {
  first_time: "First visit with this doctor",
  returning: "Returning patient",
};

export const REASON_MIN = 10;
export const REASON_MAX = 1000;
export const MAX_REFERRAL_BYTES = 5 * 1024 * 1024;
export const REFERRAL_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;
const REFERENCE_RE = /^MS-[A-Z2-9]{6}$/;

/** Which step each field lives on, so server errors can jump to the right place. */
export const FIELD_STEP: Record<string, FormStep> = {
  patient_name: "patient",
  patient_email: "patient",
  patient_phone: "patient",
  patient_type: "patient",
  previous_reference: "patient",
  allergies: "patient",
  child_name: "patient",
  child_age: "patient",
  service_id: "appointment",
  consultation_mode: "appointment",
  video_platform: "appointment",
  accessibility_needs: "appointment",
  reason: "appointment",
  referral: "appointment",
  consent: "review",
};

export type FieldErrors = Partial<Record<keyof IntakeValues | "referral", string>>;

export function validateStep(
  step: FormStep,
  v: IntakeValues,
  ctx: { paediatrics: boolean; referral: File | null },
): FieldErrors {
  const e: FieldErrors = {};
  if (step === "patient") {
    if (v.patient_name.trim().replace(/\s+/g, " ").length < 2) e.patient_name = "Enter the patient's full name.";
    if (!v.patient_email.trim()) e.patient_email = "Enter an email address.";
    else if (!EMAIL_RE.test(v.patient_email.trim())) e.patient_email = "Enter a valid email address.";
    if (!v.patient_phone.trim()) e.patient_phone = "Enter a mobile number.";
    else if (!PHONE_RE.test(v.patient_phone.replace(/[\s()-]/g, "")))
      e.patient_phone = "Enter a valid 10-digit Indian mobile number.";
    if (!v.patient_type) e.patient_type = "Tell us whether you've seen this doctor before.";
    if (v.patient_type === "returning" && v.previous_reference.trim() && !REFERENCE_RE.test(v.previous_reference.trim().toUpperCase()))
      e.previous_reference = "References look like MS-4K7Q9P.";
    if (ctx.paediatrics) {
      if (!v.child_name.trim()) e.child_name = "Enter the child's name.";
      const age = Number(v.child_age);
      if (v.child_age.trim() === "") e.child_age = "Enter the child's age.";
      else if (!Number.isInteger(age) || age < 0 || age > 17) e.child_age = "Age must be between 0 and 17.";
    }
  }
  if (step === "appointment") {
    if (!v.consultation_mode) e.consultation_mode = "Choose how you'd like to consult.";
    if (v.consultation_mode === "video" && !v.video_platform) e.video_platform = "Choose a video app.";
    const reason = v.reason.trim();
    if (!reason) e.reason = "Tell the doctor why you're booking.";
    else if (reason.length < REASON_MIN) e.reason = `Please add a little more detail (at least ${REASON_MIN} characters).`;
    else if (reason.length > REASON_MAX) e.reason = `Please keep it under ${REASON_MAX} characters.`;
    if (ctx.referral) {
      const problem = referralProblem(ctx.referral);
      if (problem) e.referral = problem;
    }
  }
  if (step === "review" && !v.consent) e.consent = "Please accept the booking and privacy terms to continue.";
  return e;
}

export function referralProblem(file: File): string | null {
  if (!REFERRAL_TYPES.includes(file.type)) return "Upload a PDF, JPG or PNG file.";
  if (file.size > MAX_REFERRAL_BYTES) return "The file must be 5 MB or smaller.";
  if (file.size === 0) return "The file is empty.";
  return null;
}

/** The JSON the API expects; answers that don't apply are left out. */
export function toPayload(v: IntakeValues, serviceId: number, startsAt: string, paediatrics: boolean) {
  return {
    service_id: serviceId,
    starts_at: startsAt,
    patient_name: v.patient_name.trim(),
    patient_email: v.patient_email.trim(),
    patient_phone: v.patient_phone.trim(),
    patient_type: v.patient_type,
    consultation_mode: v.consultation_mode,
    reason: v.reason.trim(),
    consent: v.consent,
    previous_reference: v.patient_type === "returning" ? v.previous_reference.trim() || null : null,
    allergies: v.patient_type === "first_time" ? v.allergies.trim() || null : null,
    video_platform: v.consultation_mode === "video" ? v.video_platform : null,
    accessibility_needs: v.consultation_mode === "in_person" ? v.accessibility_needs.trim() || null : null,
    child_name: paediatrics ? v.child_name.trim() : null,
    child_age: paediatrics && v.child_age !== "" ? Number(v.child_age) : null,
  };
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// --- Drafts --------------------------------------------------------------------
// Unfinished bookings are kept in this browser only, per user and doctor.
// Files can't be stored, so a referral has to be re-attached after resuming.

export interface BookingDraft {
  v: 1;
  savedAt: string;
  serviceId: number;
  day: string;
  slot: string;
  step: FormStep;
  values: IntakeValues;
}

const DRAFT_PREFIX = "medslot:booking-draft:";
const DRAFT_EVENT = "medslot:draft-change";
export const draftKey = (userId: number, slug: string) => `${DRAFT_PREFIX}${userId}:${slug}`;

export function readDraftRaw(key: string | null): string | null {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseDraft(raw: string | null): BookingDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as BookingDraft;
    if (d.v !== 1 || !d.slot || new Date(d.slot) <= new Date()) return null;
    return { ...d, values: { ...EMPTY_INTAKE, ...d.values } };
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: BookingDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event(DRAFT_EVENT));
  } catch {
    // Storage unavailable (private mode, quota): drafts are a convenience only.
  }
}

export function subscribeDrafts(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DRAFT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DRAFT_EVENT, onChange);
  };
}

/** Remove a user's drafts, e.g. on logout on a shared computer. */
export function clearUserDrafts(userId: number) {
  try {
    const prefix = `${DRAFT_PREFIX}${userId}:`;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
