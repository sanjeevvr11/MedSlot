import type { Metadata } from "next";
import { Suspense } from "react";
import { AppointmentList } from "@/components/appointments";
import { RequireAuth } from "@/components/require-auth";

export const metadata: Metadata = { title: "My appointments" };

export default function AppointmentsPage() {
  return (
    <Suspense>
      <RequireAuth>
        <AppointmentList />
      </RequireAuth>
    </Suspense>
  );
}
