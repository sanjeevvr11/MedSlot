import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin-dashboard";
import { RequireAuth } from "@/components/require-auth";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense>
      <RequireAuth admin>
        <AdminDashboard />
      </RequireAuth>
    </Suspense>
  );
}
