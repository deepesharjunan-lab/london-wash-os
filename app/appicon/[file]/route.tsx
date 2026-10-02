/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { MONOGRAM_SAFFRON, MONOGRAM_WHITE } from "@/lib/brand/monogram";

// App icons for the three installable apps, drawn on request:
//   /appicon/staff-192.png, /appicon/owner-512-maskable.png, /appicon/badge-96.png ...
// The saffron LW monogram from the brand kit (public/brand) on a brand tile,
// with a small label for the staff and owner apps.

export const runtime = "edge";

const APPS: Record<string, { bg: string; ink: string; label: string | null }> = {
  staff: { bg: "#0A384E", ink: "#F8F4EC", label: "STAFF" },
  owner: { bg: "#072A3B", ink: "#F8F4EC", label: "OWNER" },
  club: { bg: "#FFFFFF", ink: "#0A384E", label: null },
};

const MONO_RATIO = 252 / 532; // height / width of public/brand/lw-monogram.png

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const m = /^(staff|owner|club|badge|apple-(?:staff|owner|club))-(\d{2,3})(-maskable)?\.png$/.exec(params.file);
  if (!m) return new Response("Not found", { status: 404 });
  const size = Math.min(512, Math.max(48, Number(m[2])));
  const kind = m[1];
  const headers = { "Cache-Control": "public, max-age=604800, immutable" };

  if (kind === "badge") {
    // Android status-bar badge: white on transparent.
    const w = size * 0.82;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={MONOGRAM_WHITE} width={w} height={w * MONO_RATIO} alt="" />
        </div>
      ),
      { width: size, height: size, headers }
    );
  }

  const app = APPS[kind.replace("apple-", "")] ?? APPS.club;
  const maskable = !!m[3] || kind.startsWith("apple-");
  const scale = maskable ? 0.72 : 0.86; // maskable icons keep the mark inside the safe zone
  const w = size * 0.7 * scale;
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
        <img src={MONOGRAM_SAFFRON} width={w} height={w * MONO_RATIO} alt="" />
        {app.label && (
          <div style={{ display: "flex", marginTop: size * 0.07 * scale, fontSize: size * 0.1 * scale, letterSpacing: size * 0.018, color: app.ink, opacity: 0.85, fontWeight: 700 }}>
            {app.label}
          </div>
        )}
      </div>
    ),
    { width: size, height: size, headers }
  );
}
