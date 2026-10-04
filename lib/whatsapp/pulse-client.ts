"use client";

// Live WhatsApp inbox updates for the console. The database keeps a one-row
// summary (public.whatsapp_pulse, counts only) and Supabase Realtime pushes
// every change to the browser, so the sidebar badge, the new-message sound and
// the inbox page update within a second without polling the server.
// One shared connection per browser tab, however many components listen.

export type Pulse = { waiting: number; staff: number; alert_at: string | null; version: number };
type Listener = (p: Pulse) => void;

const listeners = new Set<Listener>();
let current: Pulse | null = null;
let started = false;

function publish(row: Partial<Pulse> | null) {
  if (!row || typeof row.version !== "number") return;
  if (current && row.version < current.version) return; // ignore an older snapshot arriving late
  current = { waiting: Number(row.waiting) || 0, staff: Number(row.staff) || 0, alert_at: row.alert_at ?? null, version: Number(row.version) };
  listeners.forEach((l) => l(current!));
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // Load the Supabase library after the page is up, so it doesn't slow the first paint.
  import("@/lib/supabase/client").then(({ createClient }) => connect(createClient())).catch(() => {
    started = false;
  });
}

function connect(db: ReturnType<typeof import("@/lib/supabase/client").createClient>) {
  const load = async () => {
    const { data } = await db.from("whatsapp_pulse").select("waiting, staff, alert_at, version").eq("id", 1).maybeSingle();
    publish(data as Pulse | null);
  };
  load();
  (async () => {
    // Realtime checks the row permissions as the signed-in console user, so pass their token first.
    const { data } = await db.auth.getSession();
    if (data.session?.access_token) db.realtime.setAuth(data.session.access_token);
    db.channel("whatsapp-pulse")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_pulse" }, (payload) => publish(payload.new as Pulse))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load(); // catch anything missed while connecting
      });
  })();
  // Safety net: hand-offs also expire with time (no database change), and connections can drop.
  setInterval(load, 60000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
}

/** Calls `fn` with the latest pulse now (if known) and on every change. Returns an unsubscribe function. */
export function subscribePulse(fn: Listener) {
  start();
  listeners.add(fn);
  if (current) fn(current);
  return () => {
    listeners.delete(fn);
  };
}

/* ------------------------------------------------------------------ */
/* New-message sound                                                    */
/* ------------------------------------------------------------------ */

const SOUND_KEY = "lw_wa_sound";
let audio: AudioContext | null = null;

export function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // stays on
  }
}

/** Browsers only allow sound after the person has clicked somewhere on the page once. */
export function unlockSound() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") audio.resume();
    } catch {
      // no sound support
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
}

/** A short two-note chime, made in the browser (no sound file needed). */
export function playChime() {
  if (!soundEnabled()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const now = audio.currentTime;
    [
      { f: 880, t: 0 },
      { f: 1318.5, t: 0.14 },
    ].forEach(({ f, t }) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.45);
      osc.connect(gain).connect(audio!.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.5);
    });
  } catch {
    // no sound support
  }
}
