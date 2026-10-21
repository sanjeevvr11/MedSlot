export type Role = "patient" | "admin";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
}

export interface Specialty {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  doctor_count: number;
}

export interface SpecialtyBrief {
  name: string;
  slug: string;
  icon: string;
}

export interface Service {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
}

export interface DoctorSummary {
  id: number;
  slug: string;
  name: string;
  qualifications: string;
  years_experience: number;
  languages: string;
  clinic_name: string;
  location: string;
  accent: string;
  specialty: SpecialtyBrief;
  price_from: number | null;
  next_available: string | null;
}

export interface ScheduleWindow {
  weekday: number;
  start_time: string;
  end_time: string;
  label: string | null;
}

export interface DoctorDetail extends DoctorSummary {
  bio: string;
  services: Service[];
  working_hours: ScheduleWindow[];
  breaks: ScheduleWindow[];
}

export interface CalendarDay {
  date: string;
  available: number;
}

export interface DaySlots {
  date: string;
  timezone: string;
  slots: string[];
}

export interface Appointment {
  id: number;
  reference: string;
  status: "confirmed" | "cancelled";
  starts_at: string;
  ends_at: string;
  price: number;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  doctor: {
    slug: string;
    name: string;
    qualifications: string;
    clinic_name: string;
    location: string;
    accent: string;
    specialty: SpecialtyBrief;
  };
  service: { id: number; name: string; duration_minutes: number };
  patient_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  patient_type: "first_time" | "returning" | null;
  consultation_mode: "in_person" | "video" | "phone" | null;
  reason: string | null;
  details: Record<string, string | number | null> | null;
  document: { filename: string; content_type: string; size_bytes: number } | null;
  can_cancel: boolean;
  cancel_deadline: string | null;
}

export interface AdminAppointment extends Appointment {
  user: { id: number; username: string; full_name: string };
}

export interface AdminStats {
  doctors: number;
  patients: number;
  upcoming: number;
  today: number;
  cancelled_last_30_days: number;
}

export interface TimeOff {
  id: number;
  doctor_id: number;
  starts_at: string;
  ends_at: string;
  reason: string;
}
