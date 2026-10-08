import { NextResponse } from "next/server";
import { consoleUserId } from "@/lib/auth/console-user";
import { deletePhoto, setKeep } from "@/lib/photos/order-photos";

// One garment photo: DELETE removes it, PATCH {keep} marks it to keep past the auto-cleanup.
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await consoleUserId())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  await deletePhoto(params.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await consoleUserId())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await setKeep(params.id, !!body.keep);
  return NextResponse.json({ ok: true });
}
