"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  CalendarCheck2,
  Check,
  FileText,
  Pencil,
  ShieldCheck,
  UploadCloud,
  UserRound,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Button, Field, SelectField, TextAreaField, cn } from "@/components/ui";
import {
  FIELD_STEP,
  FORM_STEPS,
  MODE_LABELS,
  PATIENT_TYPE_LABELS,
  PLATFORM_LABELS,
  REASON_MAX,
  formatFileSize,
  referralProblem,
  validateStep,
  type FieldErrors,
  type FormStep,
  type IntakeValues,
} from "@/lib/booking-form";
import { formatLongDate, formatPrice, formatTime } from "@/lib/format";
import type { DoctorDetail, Service } from "@/lib/types";

interface BookingFormProps {
  doctor: DoctorDetail;
  service: Service;
  slot: string;
  step: FormStep;
  onStep: (step: FormStep) => void;
  values: IntakeValues;
  onChange: (patch: Partial<IntakeValues>) => void;
  referral: File | null;
  onReferral: (file: File | null) => void;
  onChangeService: (serviceId: number) => void;
  onChangeTime: () => void;
  /** Resolves with field errors from the server, if any. */
  onSubmit: () => Promise<FieldErrors | void>;
  submitting: boolean;
}

const fieldId = (name: string) => `bf-${name}`;

function focusField(name: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(fieldId(name));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  });
}

export function BookingForm(props: BookingFormProps) {
  const { doctor, service, slot, step, onStep, values, onChange, referral, onReferral, submitting } = props;
  const paediatrics = doctor.specialty.slug === "paediatrics";
  const ctx = { paediatrics, referral };
  const [errors, setErrors] = useState<FieldErrors>({});
  // Errors appear once a step has been submitted, then track edits live.
  const [attempted, setAttempted] = useState<Set<FormStep>>(new Set());
  const stepIndex = FORM_STEPS.findIndex((s) => s.key === step);

  function update(patch: Partial<IntakeValues>) {
    onChange(patch);
    if (attempted.has(step)) setErrors(validateStep(step, { ...values, ...patch }, ctx));
  }

  function blurCheck(name: keyof IntakeValues) {
    if (!String(values[name] ?? "").trim()) return;
    const problem = validateStep(step, values, ctx)[name];
    setErrors((e) => ({ ...e, [name]: problem }));
  }

  function setReferral(file: File | null) {
    onReferral(file);
    setErrors((e) => ({ ...e, referral: file ? referralProblem(file) ?? undefined : undefined }));
  }

  function goTo(next: FormStep) {
    setErrors({});
    onStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function next() {
    const stepErrors = validateStep(step, values, ctx);
    setAttempted((a) => new Set(a).add(step));
    setErrors(stepErrors);
    const first = Object.keys(stepErrors)[0];
    if (first) return focusField(first);
    if (step !== "review") return goTo(FORM_STEPS[stepIndex + 1].key);

    const serverErrors = await props.onSubmit();
    if (serverErrors && Object.keys(serverErrors).length) {
      const key = Object.keys(serverErrors)[0];
      const target = FIELD_STEP[key] ?? "review";
      setAttempted((a) => new Set(a).add(target));
      onStep(target);
      setErrors(serverErrors);
      focusField(key);
    }
  }

  return (
    <div>
      <Stepper current={stepIndex} onJump={(i) => i < stepIndex && goTo(FORM_STEPS[i].key)} />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-5 p-5 sm:p-6"
          >
            {step === "patient" && (
              <PatientStep values={values} errors={errors} update={update} blurCheck={blurCheck} paediatrics={paediatrics} />
            )}
            {step === "appointment" && (
              <AppointmentStep
                {...props}
                errors={errors}
                update={update}
                setReferral={setReferral}
              />
            )}
            {step === "review" && (
              <ReviewStep
                doctor={doctor}
                service={service}
                slot={slot}
                values={values}
                referral={referral}
                paediatrics={paediatrics}
                errors={errors}
                update={update}
                onEdit={goTo}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 border-t border-line p-5 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (stepIndex === 0 ? props.onChangeTime() : goTo(FORM_STEPS[stepIndex - 1].key))}
            disabled={submitting}
          >
            <ArrowLeft className="size-4" /> {stepIndex === 0 ? "Change time" : "Back"}
          </Button>
          {step === "review" ? (
            <Button type="submit" size="lg" loading={submitting}>
              <CalendarCheck2 className="size-5" /> Confirm booking
            </Button>
          ) : (
            <Button type="submit">
              Continue <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Stepper({ current, onJump }: { current: number; onJump: (index: number) => void }) {
  return (
    <ol className="flex items-center gap-2 border-b border-line px-5 py-4 sm:px-6" aria-label="Booking steps">
      {FORM_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!done}
              aria-current={active ? "step" : undefined}
              className={cn("flex items-center gap-2 text-left text-sm font-bold", done && "hover:text-signal")}
            >
              <motion.span
                className="grid size-7 shrink-0 place-items-center rounded-full text-xs"
                animate={{
                  backgroundColor: done || active ? "#006bff" : "#f4f7fb",
                  color: done || active ? "#ffffff" : "#476788",
                }}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </motion.span>
              <span className={cn("hidden sm:inline", !active && !done && "text-ink-soft")}>{s.label}</span>
            </button>
            {i < FORM_STEPS.length - 1 && (
              <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                <motion.span className="absolute inset-y-0 left-0 bg-signal" animate={{ width: done ? "100%" : "0%" }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="space-y-5 pt-1">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface StepProps {
  values: IntakeValues;
  errors: FieldErrors;
  update: (patch: Partial<IntakeValues>) => void;
}

function PatientStep({
  values,
  errors,
  update,
  blurCheck,
  paediatrics,
}: StepProps & { blurCheck: (name: keyof IntakeValues) => void; paediatrics: boolean }) {
  return (
    <>
      <StepIntro title="Who is the appointment for?" body="We share these details only with the clinic." />
      <Field
        id={fieldId("patient_name")}
        label={paediatrics ? "Parent or guardian's full name" : "Full name"}
        autoComplete="name"
        value={values.patient_name}
        onChange={(e) => update({ patient_name: e.target.value })}
        onBlur={() => blurCheck("patient_name")}
        error={errors.patient_name}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id={fieldId("patient_email")}
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.patient_email}
          onChange={(e) => update({ patient_email: e.target.value })}
          onBlur={() => blurCheck("patient_email")}
          error={errors.patient_email}
        />
        <Field
          id={fieldId("patient_phone")}
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={values.patient_phone}
          onChange={(e) => update({ patient_phone: e.target.value })}
          onBlur={() => blurCheck("patient_phone")}
          error={errors.patient_phone}
          hint="10-digit Indian mobile number, +91 optional."
        />
      </div>

      <Reveal show={paediatrics}>
        <div className="rounded-2xl border border-line bg-marble/60 p-4">
          <p className="mb-4 flex items-center gap-2 text-sm font-bold">
            <Baby className="size-4 text-signal" /> Child&apos;s details
          </p>
          <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
            <Field
              id={fieldId("child_name")}
              label="Child's name"
              value={values.child_name}
              onChange={(e) => update({ child_name: e.target.value })}
              error={errors.child_name}
            />
            <Field
              id={fieldId("child_age")}
              label="Age (years)"
              type="number"
              inputMode="numeric"
              min={0}
              max={17}
              value={values.child_age}
              onChange={(e) => update({ child_age: e.target.value })}
              error={errors.child_age}
            />
          </div>
        </div>
      </Reveal>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Have you seen this doctor before?</legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-invalid={!!errors.patient_type}>
          {(
            [
              ["first_time", UserRound, "First-time patient"],
              ["returning", UserRoundCheck, "Returning patient"],
            ] as const
          ).map(([value, Icon, label], i) => {
            const checked = values.patient_type === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-signal/20",
                  checked ? "border-signal bg-signal-tint/60" : errors.patient_type ? "border-danger/50" : "border-line hover:border-signal/50",
                )}
              >
                <input
                  type="radio"
                  name="patient_type"
                  id={i === 0 ? fieldId("patient_type") : undefined}
                  value={value}
                  checked={checked}
                  onChange={() => update({ patient_type: value })}
                  className="sr-only"
                />
                <span className={cn("grid size-9 place-items-center rounded-xl", checked ? "bg-signal text-white" : "bg-marble text-ink-soft")}>
                  <Icon className="size-5" />
                </span>
                <span className="font-bold">{label}</span>
              </label>
            );
          })}
        </div>
        {errors.patient_type && <p className="mt-1.5 text-sm text-danger">{errors.patient_type}</p>}
      </fieldset>

      <Reveal show={values.patient_type === "returning"}>
        <Field
          id={fieldId("previous_reference")}
          label="Previous booking reference (optional)"
          placeholder="MS-4K7Q9P"
          autoCapitalize="characters"
          value={values.previous_reference}
          onChange={(e) => update({ previous_reference: e.target.value.toUpperCase() })}
          onBlur={() => blurCheck("previous_reference")}
          error={errors.previous_reference}
          hint="Helps the clinic find your last visit. You'll find it under My appointments."
        />
      </Reveal>
      <Reveal show={values.patient_type === "first_time"}>
        <Field
          id={fieldId("allergies")}
          label="Known allergies (optional)"
          placeholder="e.g. Penicillin, peanuts"
          maxLength={300}
          value={values.allergies}
          onChange={(e) => update({ allergies: e.target.value })}
          error={errors.allergies}
        />
      </Reveal>
    </>
  );
}

function AppointmentStep({
  doctor,
  service,
  values,
  errors,
  update,
  referral,
  setReferral,
  onChangeService,
}: StepProps &
  Pick<BookingFormProps, "doctor" | "service" | "referral" | "onChangeService"> & {
    setReferral: (file: File | null) => void;
  }) {
  const reasonLength = values.reason.trim().length;
  return (
    <>
      <StepIntro title="About your visit" body="This helps the doctor prepare for your appointment." />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id={fieldId("service_id")}
          label="Appointment type"
          value={service.id}
          onChange={(e) => onChangeService(Number(e.target.value))}
          hint={`${service.duration_minutes} min · ${formatPrice(service.price)}`}
        >
          {doctor.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id={fieldId("consultation_mode")}
          label="Consultation mode"
          value={values.consultation_mode}
          onChange={(e) => update({ consultation_mode: e.target.value as IntakeValues["consultation_mode"] })}
          error={errors.consultation_mode}
        >
          <option value="" disabled>
            Choose a mode
          </option>
          {Object.entries(MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>

      <Reveal show={values.consultation_mode === "video"}>
        <SelectField
          id={fieldId("video_platform")}
          label="Video app"
          value={values.video_platform}
          onChange={(e) => update({ video_platform: e.target.value as IntakeValues["video_platform"] })}
          error={errors.video_platform}
          hint="The clinic will send the call link to your email before the appointment."
        >
          <option value="" disabled>
            Choose an app
          </option>
          {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </Reveal>
      <Reveal show={values.consultation_mode === "phone"}>
        <p className="rounded-2xl bg-signal-tint/70 px-4 py-3 text-sm text-ink">
          The doctor will call <strong>{values.patient_phone || "your mobile number"}</strong> at the appointment time.
        </p>
      </Reveal>
      <Reveal show={values.consultation_mode === "in_person"}>
        <Field
          id={fieldId("accessibility_needs")}
          label="Accessibility needs (optional)"
          placeholder="e.g. wheelchair access, interpreter"
          maxLength={200}
          value={values.accessibility_needs}
          onChange={(e) => update({ accessibility_needs: e.target.value })}
          error={errors.accessibility_needs}
        />
      </Reveal>

      <TextAreaField
        id={fieldId("reason")}
        label="Reason for appointment"
        placeholder="Describe your symptoms or what you'd like to discuss, and how long it's been going on."
        maxLength={REASON_MAX}
        value={values.reason}
        onChange={(e) => update({ reason: e.target.value })}
        error={errors.reason}
        hint={
          <span className="flex justify-between gap-3">
            <span>Don&apos;t include passwords or payment details.</span>
            <span className="tabular-nums">
              {reasonLength}/{REASON_MAX}
            </span>
          </span>
        }
      />

      <ReferralInput file={referral} onFile={setReferral} error={errors.referral} />
    </>
  );
}

function ReferralInput({ file, onFile, error }: { file: File | null; onFile: (f: File | null) => void; error?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: FileList | null) {
    if (files?.[0]) onFile(files[0]);
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">
        Referral document <span className="font-normal text-ink-soft">(optional)</span>
      </p>
      <AnimatePresence mode="wait" initial={false}>
        {file ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={cn("flex items-center gap-3 rounded-2xl border p-3", error ? "border-danger bg-danger-tint/40" : "border-line bg-marble/60")}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-signal shadow-card">
              <FileText className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{file.name}</span>
              <span className="text-xs text-ink-soft">{formatFileSize(file.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                onFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="rounded-full p-2 text-ink-soft hover:bg-white hover:text-danger"
              aria-label="Remove referral document"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ) : (
          <motion.label
            key="drop"
            htmlFor={fieldId("referral")}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-signal/20",
              dragging ? "border-signal bg-signal-tint/60" : error ? "border-danger/60" : "border-line hover:border-signal/60",
            )}
          >
            <UploadCloud className={cn("size-7", dragging ? "text-signal" : "text-ink-soft")} />
            <span className="mt-2 text-sm font-bold">
              Drop a file here or <span className="text-signal">browse</span>
            </span>
            <span className="text-xs text-ink-soft">PDF, JPG or PNG, up to 5 MB</span>
          </motion.label>
        )}
      </AnimatePresence>
      <input
        ref={inputRef}
        id={fieldId("referral")}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        onChange={(e) => pick(e.target.files)}
      />
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

function ReviewStep({
  doctor,
  service,
  slot,
  values,
  referral,
  paediatrics,
  errors,
  update,
  onEdit,
}: StepProps & {
  doctor: DoctorDetail;
  service: Service;
  slot: string;
  referral: File | null;
  paediatrics: boolean;
  onEdit: (step: FormStep) => void;
}) {
  const patientRows: [string, string][] = [
    [paediatrics ? "Parent / guardian" : "Name", values.patient_name.trim()],
    ...(paediatrics ? ([["Child", `${values.child_name.trim()}, ${values.child_age} yrs`]] as [string, string][]) : []),
    ["Email", values.patient_email.trim()],
    ["Mobile", values.patient_phone.trim()],
    ["Visit", PATIENT_TYPE_LABELS[values.patient_type] ?? ""],
  ];
  if (values.patient_type === "returning" && values.previous_reference.trim())
    patientRows.push(["Previous reference", values.previous_reference.trim()]);
  if (values.patient_type === "first_time" && values.allergies.trim()) patientRows.push(["Allergies", values.allergies.trim()]);

  const appointmentRows: [string, string][] = [
    ["Doctor", `${doctor.name} · ${doctor.specialty.name}`],
    ["When", `${formatLongDate(slot)}, ${formatTime(slot)}`],
    ["Appointment type", `${service.name} · ${service.duration_minutes} min`],
    ["Mode", MODE_LABELS[values.consultation_mode] ?? ""],
  ];
  if (values.consultation_mode === "video") appointmentRows.push(["Video app", PLATFORM_LABELS[values.video_platform] ?? ""]);
  if (values.consultation_mode === "in_person") appointmentRows.push(["Location", `${doctor.clinic_name}, ${doctor.location}`]);
  if (values.consultation_mode === "in_person" && values.accessibility_needs.trim())
    appointmentRows.push(["Accessibility", values.accessibility_needs.trim()]);
  appointmentRows.push(["Referral", referral ? referral.name : "None attached"]);

  return (
    <>
      <StepIntro title="Check everything before confirming" body="You can edit any section. Your slot is re-checked when you confirm." />
      <ReviewSection title="Patient details" onEdit={() => onEdit("patient")} rows={patientRows} />
      <ReviewSection title="Appointment details" onEdit={() => onEdit("appointment")} rows={appointmentRows}>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reason</dt>
          <dd className="mt-0.5 whitespace-pre-line font-medium">{values.reason.trim()}</dd>
        </div>
      </ReviewSection>
      <div className="flex items-center justify-between rounded-2xl bg-marble px-4 py-3">
        <span className="text-sm font-semibold text-ink-soft">Fee (pay at clinic)</span>
        <span className="text-xl font-extrabold">{formatPrice(service.price)}</span>
      </div>

      <div>
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-signal/20",
            values.consent ? "border-signal bg-signal-tint/50" : errors.consent ? "border-danger/60" : "border-line",
          )}
        >
          <input
            id={fieldId("consent")}
            type="checkbox"
            checked={values.consent}
            onChange={(e) => update({ consent: e.target.checked })}
            className="mt-0.5 size-5 shrink-0 accent-[#006bff]"
            aria-invalid={!!errors.consent}
          />
          <span className="text-sm">
            I confirm these details are correct, agree to the booking terms (free cancellation up to 2 hours before,
            fee paid at the clinic) and consent to MedSlot sharing them with {doctor.clinic_name} for this appointment.
          </span>
        </label>
        {errors.consent && <p className="mt-1.5 text-sm text-danger">{errors.consent}</p>}
        <details className="mt-2 text-xs text-ink-soft">
          <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold hover:text-signal">
            <ShieldCheck className="size-3.5" /> How we use your information
          </summary>
          <p className="mt-2 leading-relaxed">
            Your details, reason for visit and any referral are visible only to you and clinic staff. They are used to
            manage this appointment and are never sold or shared with third parties. MedSlot is not for emergencies.
          </p>
        </details>
      </div>
    </>
  );
}

function ReviewSection({
  title,
  rows,
  onEdit,
  children,
}: {
  title: string;
  rows: [string, string][];
  onEdit: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold text-signal hover:bg-signal-tint">
          <Pencil className="size-3.5" /> Edit
        </button>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
            <dd className="mt-0.5 break-words font-medium">{value}</dd>
          </div>
        ))}
        {children}
      </dl>
    </section>
  );
}

function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-xl font-extrabold">{title}</h2>
      <p className="text-sm text-ink-soft">{body}</p>
    </div>
  );
}
