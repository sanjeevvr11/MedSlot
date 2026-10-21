import { Suspense } from "react";
import { DoctorProfile } from "@/components/doctor-profile";

export default function DoctorPage() {
  return (
    <Suspense>
      <DoctorProfile />
    </Suspense>
  );
}
