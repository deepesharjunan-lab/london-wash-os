import { ImageResponse } from "next/og";

// App icons for the three installable apps, drawn on request:
//   /appicon/staff-192.png, /appicon/owner-512-maskable.png, /appicon/badge-96.png ...
// Navy tile with the LW monogram in brass, and a small label per app.

export const runtime = "edge";

const APPS: Record<string, { bg: string; ink: string; label: string | null }> = {
  staff: { bg: "#101828", ink: "#e3d2ac", label: "STAFF" },
  owner: { bg: "#15213a", ink: "#e3d2ac", label: "OWNER" },
  club: { bg: "#f8f5ef", ink: "#15213a", label: null },
};

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const m = /^(staff|owner|club|badge|apple-(?:staff|owner|club))-(\d{2,3})(-maskable)?\.png$/.exec(params.file);
  if (!m) return new Response("Not found", { status: 404 });
  const size = Math.min(512, Math.max(48, Number(m[2])));
  const kind = m[1];

  if (kind === "badge") {
    // Android status-bar badge: white on transparent.
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: size * 0.55, fontWeight: 700 }}>
          LW
        </div>
      ),
      { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } }
    );
  }

  const app = APPS[kind.replace("apple-", "")] ?? APPS.club;
  const maskable = !!m[3] || kind.startsWith("apple-");
  const scale = maskable ? 0.72 : 0.86; // maskable icons keep the mark inside the safe zone
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: app.bg,
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div style={{ display: "flex", fontFamily: "serif", fontSize: size * 0.42 * scale, letterSpacing: -size * 0.02, color: app.ink, lineHeight: 1 }}>LW</div>
        {app.label && (
          <div style={{ display: "flex", marginTop: size * 0.04 * scale, fontSize: size * 0.1 * scale, letterSpacing: size * 0.018, color: app.ink, opacity: 0.8, fontWeight: 700 }}>
            {app.label}
          </div>
        )}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } }
  );
}
