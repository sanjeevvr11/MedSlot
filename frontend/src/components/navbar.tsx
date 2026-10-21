"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { CalendarCheck, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Logo } from "@/components/logo";
import { ButtonLink, cn } from "@/components/ui";

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  const links = [
    { href: "/doctors", label: "Find doctors" },
    ...(user ? [{ href: "/appointments", label: "My appointments" }] : []),
    ...(user?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  async function handleLogout() {
    setOpen(false);
    try {
      await logout();
      toast.success("You've been logged out.");
      router.push("/");
    } catch {
      toast.error("Couldn't log out. Please try again.");
    }
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled || open ? "border-b border-line/80 bg-white/80 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "relative rounded-full px-4 py-2 text-[15px] font-semibold transition-colors",
                pathname.startsWith(l.href) ? "text-signal" : "text-ink hover:text-signal",
              )}
            >
              {pathname.startsWith(l.href) && (
                <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-signal-tint" />
              )}
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {loading ? (
            <div className="h-9 w-40" />
          ) : user ? (
            <>
              <span className="mr-1 text-sm text-ink-soft">
                Hi, <span className="font-semibold text-ink">{user.full_name.split(" ")[0]}</span>
              </span>
              <button
                onClick={handleLogout}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-ink hover:bg-marble"
              >
                <LogOut className="size-4" /> Log out
              </button>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>

        <button
          className="grid size-10 place-items-center rounded-full hover:bg-marble md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden md:hidden"
          >
            <div className="space-y-1 px-4 pb-5">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-3 font-semibold hover:bg-marble"
                >
                  {l.href === "/admin" ? <ShieldCheck className="size-4 text-signal" /> : null}
                  {l.href === "/appointments" ? <CalendarCheck className="size-4 text-signal" /> : null}
                  {l.label}
                </Link>
              ))}
              <div className="pt-3">
                {user ? (
                  <button onClick={handleLogout} className="w-full rounded-xl px-3 py-3 text-left font-semibold text-danger hover:bg-danger-tint">
                    Log out ({user.username})
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2" onClick={() => setOpen(false)}>
                    <ButtonLink href="/login" variant="secondary">
                      Log in
                    </ButtonLink>
                    <ButtonLink href="/register">Get started</ButtonLink>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
