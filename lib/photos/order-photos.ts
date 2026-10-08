import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Order photos (replaces the WhatsApp group): every garment tag gets a photo
// when the order is taken. Files go to the private Storage bucket
// `order-photos`; `order_photo` rows link them to the order and garment.
// Photos are shrunk in the browser before upload (lib/photos/compress.ts).
// Server-only.

export const BUCKET = "order-photos";
export const MAX_PER_ORDER = 80; // about 2 per garment on a big order
export const MAX_BYTES = 3 * 1024 * 1024;
export const KEEP_DAYS_AFTER_DELIVERY = 5;
const LINK_HOURS = 2;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type OrderPhoto = { id: string; url: string; source: string; keep: boolean; created_at: string; garment_id: string | null };
export type GarmentPhotos = { id: string; tag: string; item: string; service: string; photos: OrderPhoto[] };
export type OrderPhotoSet = { garments: GarmentPhotos[]; other: OrderPhoto[]; missing: number };

const one = (x: any) => (Array.isArray(x) ? x[0] : x);

/** Photos of an order with short-lived view links (1 hour). */
export async function listPhotos(orderId: string): Promise<OrderPhoto[]> {
  const db = createAdminClient();
  const { data } = await db.from("order_photo").select("id, path, source, keep, created_at, garment_id").eq("order_id", orderId).order("created_at");
  const rows = (data ?? []) as { id: string; path: string; source: string; keep: boolean; created_at: string; garment_id: string | null }[];
  if (!rows.length) return [];
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(
    rows.map((r) => r.path),
    3600
  );
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ id: r.id, url: urls.get(r.path) ?? "", source: r.source, keep: r.keep, created_at: r.created_at, garment_id: r.garment_id }));
}

/** The order's garment tags, each with its photos, plus photos not tied to a tag. */
export async function orderPhotoSet(orderId: string): Promise<OrderPhotoSet> {
  const db = createAdminClient();
  const [photos, { data: g }] = await Promise.all([
    listPhotos(orderId),
    db
      .from("garment")
      .select("id, tag_code, created_at, item:item_id(name), order_item:order_item_id!inner(order_id, service:service_id(name))")
      .eq("order_item.order_id", orderId)
      .order("created_at")
      .order("id"),
  ]);
  const garments: GarmentPhotos[] = ((g ?? []) as any[]).map((r) => ({
    id: r.id,
    tag: r.tag_code ?? "",
    item: one(r.item)?.name ?? "Item",
    service: one(one(r.order_item)?.service)?.name ?? "",
    photos: photos.filter((p) => p.garment_id === r.id),
  }));
  const ids = new Set(garments.map((x) => x.id));
  return { garments, other: photos.filter((p) => !p.garment_id || !ids.has(p.garment_id)), missing: garments.filter((x) => !x.photos.length).length };
}


/** Stores one (already compressed) photo for an order. */
export async function savePhoto(
  orderId: string,
  file: File,
  opts: { source: "counter" | "phone"; userId?: string | null; garmentId?: string | null; width?: number; height?: number }
): Promise<{ ok: true } | { error: string }> {
  const ext = TYPES[file.type];
  if (!ext) return { error: "Only photos (JPG, PNG or WebP) can be added." };
  if (file.size > MAX_BYTES) return { error: "That photo is too large." };
  const db = createAdminClient();
  if (opts.garmentId) {
    const { data: g } = await db.from("garment").select("id, order_item:order_item_id(order_id)").eq("id", opts.garmentId).maybeSingle();
    if (one((g as any)?.order_item)?.order_id !== orderId) return { error: "That garment tag isn't part of this order." };
  }
  const { count } = await db.from("order_photo").select("id", { count: "exact", head: true }).eq("order_id", orderId);
  if ((count ?? 0) >= MAX_PER_ORDER) return { error: `An order can have up to ${MAX_PER_ORDER} photos.` };
  const path = `${orderId}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (upErr) return { error: `Couldn't save the photo: ${upErr.message}` };
  const { error } = await db.from("order_photo").insert({
    order_id: orderId,
    garment_id: opts.garmentId ?? null,
    path,
    bytes: file.size,
    width: opts.width ?? null,
    height: opts.height ?? null,
    source: opts.source,
    uploaded_by_user_id: opts.userId ?? null,
  });
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    return { error: `Couldn't save the photo: ${error.message}` };
  }
  return { ok: true };
}

export async function deletePhoto(id: string) {
  const db = createAdminClient();
  const { data } = await db.from("order_photo").select("path").eq("id", id).maybeSingle();
  if (!data) return;
  await db.storage.from(BUCKET).remove([(data as any).path]);
  await db.from("order_photo").delete().eq("id", id);
}

export async function setKeep(id: string, keep: boolean) {
  await createAdminClient().from("order_photo").update({ keep }).eq("id", id);
}

// ---------- phone upload links (QR on the desktop POS) ----------

export async function createLink(orderId: string, userId: string | null) {
  const token = randomBytes(18).toString("base64url");
  const expires = new Date(Date.now() + LINK_HOURS * 3600 * 1000).toISOString();
  const { error } = await createAdminClient().from("order_photo_link").insert({ token, order_id: orderId, created_by_user_id: userId, expires_at: expires });
  if (error) throw new Error(error.message);
  return { token, expires };
}

/** The order behind a phone link, or null when the link is unknown or expired. */
export async function linkOrder(token: string): Promise<{ orderId: string; userId: string | null; orderNumber: string; firstName: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("order_photo_link")
    .select("order_id, created_by_user_id, expires_at, order:order_id(order_number, customer:customer_id(full_name))")
    .eq("token", token)
    .maybeSingle();
  const l = data as any;
  if (!l || new Date(l.expires_at).getTime() < Date.now()) return null;
  const o = Array.isArray(l.order) ? l.order[0] : l.order;
  const c = o && (Array.isArray(o.customer) ? o.customer[0] : o.customer);
  return { orderId: l.order_id, userId: l.created_by_user_id, orderNumber: o?.order_number ?? "", firstName: (c?.full_name ?? "").split(" ")[0] };
}

// ---------- automatic cleanup ----------

/**
 * Deletes photos of orders delivered or cancelled more than 5 days ago,
 * except those marked "keep". Also clears expired phone links. Called from
 * the Engage pump; a small batch each time.
 */
export async function cleanupOrderPhotos(limit = 100) {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - KEEP_DAYS_AFTER_DELIVERY * 86400 * 1000).toISOString();
  const { data } = await db
    .from("order_photo")
    .select("id, path, o:order_id!inner(status, updated_at)") // alias o: "order.x" would clash with PostgREST ordering
    .eq("keep", false)
    .in("o.status", ["delivered", "cancelled"])
    .lt("o.updated_at", cutoff)
    .limit(limit);
  const rows = (data ?? []) as { id: string; path: string }[];
  if (rows.length) {
    await db.storage.from(BUCKET).remove(rows.map((r) => r.path));
    await db.from("order_photo").delete().in("id", rows.map((r) => r.id));
  }
  await db.from("order_photo_link").delete().lt("expires_at", new Date(Date.now() - 86400 * 1000).toISOString());
  return { deleted: rows.length };
}
