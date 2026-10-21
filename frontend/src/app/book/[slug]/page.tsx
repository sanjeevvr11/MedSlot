import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlow } from "@/components/booking-flow";

export const metadata: Metadata = { title: "Book an appointment" };

export default function BookPage() {
  return (
    <Suspense>
      <BookingFlow />
    </Suspense>
  );
}
