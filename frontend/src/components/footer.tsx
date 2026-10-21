import Link from "next/link";
import { Siren } from "lucide-react";
import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-marble">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-ink-soft">
              Book trusted doctors in a few clicks. Real-time availability, instant confirmation, no double bookings.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm">
            <div>
              <p className="mb-3 font-bold">Patients</p>
              <ul className="space-y-2 text-ink-soft">
                <li><Link className="hover:text-signal" href="/doctors">Find a doctor</Link></li>
                <li><Link className="hover:text-signal" href="/appointments">My appointments</Link></li>
                <li><Link className="hover:text-signal" href="/register">Create account</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-bold">Policies</p>
              <ul className="space-y-2 text-ink-soft">
                <li>Cancel free up to 2h before</li>
                <li>One visit per doctor per day</li>
                <li>Details shared only with your clinic</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger-tint px-4 py-3 text-sm text-ink">
          <Siren className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p>
            <strong>Not for emergencies.</strong> If you or someone else needs urgent medical help, call{" "}
            <a href="tel:112" className="font-bold text-danger underline">112</a> or go to the nearest hospital.
          </p>
        </div>
        <p className="mt-6 text-xs text-ink-soft">
          © 2026 MedSlot · Internship demo project. Doctors and clinics shown are fictional.
        </p>
      </div>
    </footer>
  );
}
