import type { Metadata } from "next";
import { Suspense } from "react";
import { DoctorSearch } from "@/components/doctor-search";

export const metadata: Metadata = { title: "Find a doctor" };

export default function DoctorsPage() {
  return (
    <Suspense>
      <DoctorSearch />
    </Suspense>
  );
}
