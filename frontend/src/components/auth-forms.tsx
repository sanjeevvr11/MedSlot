"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CalendarCheck2, Check, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button, Field, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

/** Only allow redirects back into this site (no open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/doctors";
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12 sm:px-6">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-ink-soft">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
      <AuthArt />
    </div>
  );
}

function AuthArt() {
  const cards = [
    { icon: CalendarCheck2, title: "Appointment confirmed", body: "Dr. Ananya Rao · Tomorrow, 10:30 AM", tone: "text-success bg-success-tint", x: "8%", y: "34%", delay: 0.2 },
    { icon: Clock3, title: "3 slots left today", body: "Cardiology · HeartWell Centre", tone: "text-signal bg-signal-tint", x: "36%", y: "55%", delay: 0.45 },
    { icon: ShieldCheck, title: "Your data stays yours", body: "Argon2 hashing · secure sessions", tone: "text-[#6d4aff] bg-[#f0ecff]", x: "10%", y: "76%", delay: 0.7 },
  ];
  return (
    <div className="relative m-4 hidden overflow-hidden rounded-[2rem] bg-ink lg:block">
      <div className="bg-grid absolute inset-0 opacity-[0.15] invert" />
      <motion.div
        className="absolute -right-24 -top-24 size-96 rounded-full bg-signal/40 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative p-12">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">
          <Sparkles className="size-4" /> Healthcare, without the waiting room
        </p>
        <h2 className="mt-5 max-w-sm text-3xl font-extrabold leading-tight text-white">
          Your next appointment is three clicks away.
        </h2>
      </div>
      {cards.map((c) => (
        <motion.div
          key={c.title}
          className="absolute w-72 rounded-2xl bg-white p-4 shadow-lift"
          style={{ left: c.x, top: c.y }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: [0, -8, 0] }}
          transition={{
            opacity: { delay: c.delay, duration: 0.5 },
            y: { delay: c.delay, duration: 5, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          <div className="flex items-center gap-3">
            <div className={cn("grid size-10 place-items-center rounded-xl", c.tone)}>
              <c.icon className="size-5" />
            </div>
            <div>
              <p className="font-bold text-ink">{c.title}</p>
              <p className="text-sm text-ink-soft">{c.body}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function useRedirectIfLoggedIn() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);
  return next;
}

export function LoginForm() {
  const { setUser } = useAuth();
  const router = useRouter();
  const next = useRedirectIfLoggedIn();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!username.trim()) errs.username = "Enter your username.";
    if (!password) errs.password = "Enter your password.";
    setFieldErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const user = await api<User>("/auth/login", { method: "POST", body: { username, password } });
      setUser(user);
      toast.success(`Welcome back, ${user.full_name.split(" ")[0]}!`);
      router.replace(user.role === "admin" && next === "/doctors" ? "/admin" : next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to book and manage your appointments.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <FormAlert message={error} />}
        <Field
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Log in
        </Button>
        <p className="text-center text-ink-soft">
          New to MedSlot?{" "}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-signal hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

const PASSWORD_RULES = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "A letter", test: (p: string) => /[A-Za-z]/.test(p) },
  { label: "A number", test: (p: string) => /\d/.test(p) },
];

export function RegisterForm() {
  const { setUser } = useAuth();
  const router = useRouter();
  const next = useRedirectIfLoggedIn();
  const [form, setForm] = useState({ full_name: "", username: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const errs: Record<string, string> = {};
    if (form.full_name.trim().length < 2) errs.full_name = "Please enter your full name.";
    if (!/^[a-z0-9_.]{3,30}$/.test(form.username.trim().toLowerCase()))
      errs.username = "3-30 characters: letters, numbers, dots or underscores.";
    if (!PASSWORD_RULES.every((r) => r.test(form.password)))
      errs.password = "Password must have 8+ characters, a letter and a number.";
    if (form.confirm !== form.password) errs.confirm = "Passwords don't match.";
    return errs;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const user = await api<User>("/auth/register", {
        method: "POST",
        body: { full_name: form.full_name, username: form.username, password: form.password },
      });
      setUser(user);
      toast.success("Account created. You're all set!");
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setErrors({ username: err.message });
        else if (Object.keys(err.fields).length) setErrors(err.fields);
        else setError(err.message);
      } else setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="It takes 30 seconds. No email or phone needed.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <FormAlert message={error} />}
        <Field label="Full name" autoComplete="name" value={form.full_name} onChange={set("full_name")} error={errors.full_name} />
        <Field
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          value={form.username}
          onChange={set("username")}
          error={errors.username}
          hint="Lowercase letters, numbers, dots or underscores."
        />
        <div>
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            error={errors.password}
          />
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Password requirements">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(form.password);
              return (
                <li
                  key={r.label}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                    ok ? "bg-success-tint text-success" : "bg-marble text-ink-soft",
                  )}
                >
                  <Check className={cn("size-3 transition-opacity", ok ? "opacity-100" : "opacity-30")} /> {r.label}
                </li>
              );
            })}
          </ul>
        </div>
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
          error={errors.confirm}
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Create account
        </Button>
        <p className="text-center text-ink-soft">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-signal hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

function FormAlert({ message }: { message: string }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-danger/25 bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
    >
      {message}
    </motion.div>
  );
}
