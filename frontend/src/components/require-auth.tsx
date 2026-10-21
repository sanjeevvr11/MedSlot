"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";

/** Client-side guard for pages. The API enforces the same rules server-side. */
export function RequireAuth({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (!loading && !user) {
      const next = `${pathname}${search ? `?${search}` : ""}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, pathname, search, router]);

  if (loading || !user)
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );

  if (admin && user.role !== "admin")
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={<Lock />}
          title="Admins only"
          body="This area is for clinic staff. Your account doesn't have access."
          action={<ButtonLink href="/">Go home</ButtonLink>}
        />
      </div>
    );

  return <>{children}</>;
}
