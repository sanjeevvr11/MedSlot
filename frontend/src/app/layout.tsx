import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth-provider";
import { Footer } from "@/components/footer";
import { MotionProvider } from "@/components/motion-provider";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "MedSlot · Book trusted doctors in seconds", template: "%s · MedSlot" },
  description:
    "MedSlot lets you discover doctors, see real-time availability and book appointments in a few clicks.",
};

export const viewport: Viewport = { themeColor: "#0b3558" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <MotionProvider>
          <AuthProvider>
            <Suspense fallback={<div className="h-16" />}>
              <Navbar />
            </Suspense>
            <main className="flex-1">{children}</main>
            <Footer />
            <Toaster position="top-center" richColors closeButton />
          </AuthProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
