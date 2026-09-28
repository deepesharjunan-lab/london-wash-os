// Staff app roles. Safe to import from client components.

export const APP_ROLES = ["receptionist", "washer", "iron_man", "helper", "driver"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABEL: Record<AppRole, string> = {
  receptionist: "Receptionist",
  washer: "Washer",
  iron_man: "Iron Man",
  helper: "Helper",
  driver: "Driver",
};

export const isAppRole = (s: unknown): s is AppRole => typeof s === "string" && (APP_ROLES as readonly string[]).includes(s);

export const roleLabel = (s: string | null | undefined) => (isAppRole(s) ? ROLE_LABEL[s] : "—");
