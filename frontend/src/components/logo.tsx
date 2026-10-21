import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#006bff" />
      <rect x="7" y="9" width="18" height="16" rx="3.5" fill="none" stroke="white" strokeWidth="2" />
      <path d="M7 13.5h18" stroke="white" strokeWidth="2" />
      <path d="M12 6.5v4M20 6.5v4" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16.2v5.6M13.2 19h5.6" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="MedSlot home">
      <LogoMark />
      <span className={cn("text-xl font-extrabold tracking-tight", light ? "text-white" : "text-ink")}>
        Med<span className="text-signal">Slot</span>
      </span>
    </Link>
  );
}
