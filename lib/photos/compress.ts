"use client";

// Shrinks a camera photo in the browser before upload: longest side 1600 px,
// JPEG quality 0.72. A 4 MB phone photo becomes about 150-300 KB and stains
// stay clearly visible.

const MAX_SIDE = 1600;
const QUALITY = 0.72;

export async function compressPhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  const source: CanvasImageSource = bitmap ?? (await loadImage(file));
  const w0 = bitmap ? bitmap.width : (source as HTMLImageElement).naturalWidth;
  const h0 = bitmap ? bitmap.height : (source as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
  bitmap?.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read the photo"))), "image/jpeg", QUALITY));
  return { blob, width, height };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the photo"));
    img.src = URL.createObjectURL(file);
  });
}

/** Compresses and uploads one photo to an upload endpoint (form field names shared by both routes). */
export async function uploadPhoto(url: string, file: File, fields: Record<string, string>) {
  const { blob, width, height } = await compressPhoto(file);
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed");
}
