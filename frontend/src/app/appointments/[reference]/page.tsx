import type { Metadata } from "next";
import { Suspense } from "react";
import { AppointmentDetail } from "@/components/appointments";
import { RequireAuth } from "@/components/require-auth";

export const metadata: Metadata = { title: "Appointment" };

export default function AppointmentPage() {
  return (
    <Suspense>
      <RequireAuth>
        <AppointmentDetail />
      </RequireAuth>
    </Suspense>
  );
}
