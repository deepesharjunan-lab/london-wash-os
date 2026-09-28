import type { SupabaseClient } from "@supabase/supabase-js";
import { distanceMetres, validLatLng } from "@/lib/geo";
import { istDate } from "@/lib/time";
import type { StaffMe } from "./session";

// Location-checked punch-in and punch-out for the staff app. Server-only.

type Supa = SupabaseClient<any, "public", any>;

export type TodayAttendance = { id: string; check_in: string | null; check_out: string | null; check_in_distance_m: number | null } | null;

export async function todayAttendance(db: Supa, employeeId: string): Promise<TodayAttendance> {
  const { data } = await db
    .from("attendance")
    .select("id, check_in, check_out, check_in_distance_m")
    .eq("employee_id", employeeId)
    .eq("work_date", istDate())
    .maybeSingle();
  return (data as TodayAttendance) ?? null;
}

export const isPunchedIn = (a: TodayAttendance) => !!(a?.check_in && !a.check_out);

// Phone GPS indoors can be off by tens of metres; allow for up to 30 m of the reported accuracy.
const ACCURACY_ALLOWANCE_M = 30;

export async function punch(db: Supa, me: StaffMe, kind: "in" | "out", pos: { lat: number; lng: number; accuracy: number }) {
  const b = me.branch;
  if (!b || b.latitude == null || b.longitude == null) {
    return { error: "The branch location isn't set yet. Ask the owner to set it in the console (Staff & Attendance)." };
  }
  if (!validLatLng(pos.lat, pos.lng)) return { error: "We couldn't read your location. Turn on location and try again." };
  const accuracy = Math.max(0, Math.round(pos.accuracy || 0));
  const distance = distanceMetres(pos.lat, pos.lng, b.latitude, b.longitude);
  const allowed = b.punch_radius_m + Math.min(accuracy, ACCURACY_ALLOWANCE_M);
  const today = istDate();
  const now = new Date().toISOString();
  const existing = await todayAttendance(db, me.id);

  if (kind === "in") {
    if (existing?.check_in) return { error: existing.check_out ? "You've already punched out for today." : "You're already punched in." };
    if (accuracy > 250) return { error: `Your location is too rough right now (±${accuracy} m). Step near a window or outside for a moment and try again.` };
    if (distance > allowed) {
      return { error: `You're ${distance} m from ${b.name}. Punch in when you're at the branch (within ${b.punch_radius_m} m).`, distance };
    }
    const fields = {
      check_in: now,
      status: "present",
      source: "app",
      check_in_lat: pos.lat,
      check_in_lng: pos.lng,
      check_in_accuracy_m: accuracy,
      check_in_distance_m: distance,
    };
    // A row may already exist for today without a punch (e.g. marked absent or on leave in the console).
    const { error } = existing
      ? await db.from("attendance").update(fields).eq("id", existing.id).is("check_in", null)
      : await db.from("attendance").insert({ employee_id: me.id, work_date: today, ...fields });
    if (error) return { error: error.code === "23505" ? "You're already punched in." : "Couldn't record your punch. Please try again." };
    return { ok: true, distance };
  }

  // Punch-out records where it happened. It's allowed away from the branch
  // (a driver's last drop), and the owner sees the distance in attendance.
  if (!existing?.check_in) return { error: "You haven't punched in today." };
  if (existing.check_out) return { error: "You've already punched out." };
  const { error } = await db
    .from("attendance")
    .update({
      check_out: now,
      check_out_lat: pos.lat,
      check_out_lng: pos.lng,
      check_out_accuracy_m: accuracy,
      check_out_distance_m: distance,
    })
    .eq("id", existing.id)
    .is("check_out", null);
  if (error) return { error: "Couldn't record your punch. Please try again." };
  return { ok: true, distance };
}
