import { Baby, Bone, HeartPulse, ScanFace, Smile, Stethoscope, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const SPECIALTY_ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope,
  "heart-pulse": HeartPulse,
  "scan-face": ScanFace,
  baby: Baby,
  bone: Bone,
  smile: Smile,
};

export function SpecialtyIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = SPECIALTY_ICONS[icon] ?? Stethoscope;
  return <Icon className={className} aria-hidden />;
}

const ACCENTS: Record<string, string> = {
  blue: "from-[#4f9bff] to-[#006bff]",
  rose: "from-[#ff8aa1] to-[#e5486c]",
  violet: "from-[#a78bfa] to-[#6d4aff]",
  amber: "from-[#fbbf5a] to-[#e48a0c]",
  emerald: "from-[#4fd1a5] to-[#0e9f6e]",
  sky: "from-[#67d4ff] to-[#0b8fd8]",
  teal: "from-[#5eead4] to-[#0d9488]",
  indigo: "from-[#8b9cff] to-[#3f51e0]",
};

export function DoctorAvatar({
  name,
  accent,
  size = "md",
}: {
  name: string;
  accent: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "size-10 text-sm", md: "size-14 text-lg", lg: "size-24 text-3xl" }[size];
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br font-bold text-white shadow-card",
        ACCENTS[accent] ?? ACCENTS.blue,
        dims,
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
