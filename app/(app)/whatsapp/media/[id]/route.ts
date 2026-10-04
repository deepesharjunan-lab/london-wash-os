import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMedia } from "@/lib/whatsapp/client";

// Streams a WhatsApp photo, video, voice note or document to the console.
// Only for signed-in console users, and only for files that belong to a
// logged message. The file comes from Meta each time (we don't store it).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return new Response("Sign in first", { status: 401 });

  const id = String(params.id ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 100);
  if (!id) return new Response("Not found", { status: 404 });
  const { data: row } = await createAdminClient().from("whatsapp_message").select("media_mime, media_name").eq("media_id", id).limit(1).maybeSingle();
  if (!row) return new Response("Not found", { status: 404 });

  const file = await fetchMedia(id);
  if (!file.ok) return new Response(file.status === 404 ? "This file is no longer available" : "Couldn't load the file", { status: file.status });

  const r = row as { media_mime: string | null; media_name: string | null };
  const mime = (file.mime || r.media_mime || "application/octet-stream").split(";")[0].trim().toLowerCase();
  // Files come from customers: only these open inside the console; anything
  // else (HTML, SVG, Office files...) is downloaded, never rendered here.
  const viewable = /^(image\/(jpeg|png|webp|gif)|audio\/[a-z0-9.+-]+|video\/(mp4|3gpp|webm)|application\/pdf)$/.test(mime);
  const download = !viewable || new URL(req.url).searchParams.get("download") === "1";
  const name = (r.media_name || `whatsapp-${id}`).replace(/[^\w .()-]/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": viewable ? file.mime || mime : "application/octet-stream",
    "Content-Length": String(file.body.byteLength),
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
  // Browsers' PDF viewers refuse sandboxed pages, so PDFs skip this extra lock.
  if (mime !== "application/pdf") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";
  return new Response(file.body, { headers });
}
