"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

interface Snapshot {
  user: User | null;
  loading: boolean;
}

// Auth lives in a tiny external store read via useSyncExternalStore. During
// hydration React always uses the server snapshot ("loading"), so Suspense
// boundaries that hydrate after /auth/me resolves never mismatch.
const SERVER_SNAPSHOT: Snapshot = { user: null, loading: true };
let snapshot: Snapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let started = false;

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function loadSession() {
  if (started) return;
  started = true;
  api<User>("/auth/me")
    .then((user) => publish({ user, loading: false }))
    .catch((err) => {
      if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      publish({ user: null, loading: false });
    });
}

const setUser = (user: User | null) => publish({ user, loading: false });

async function logout() {
  await api("/auth/logout", { method: "POST" });
  publish({ user: null, loading: false });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(loadSession, []);
  return <>{children}</>;
}

export function useAuth() {
  const { user, loading } = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  return { user, loading, setUser, logout };
}
