import { createClient } from "@/lib/supabase/server";
import { waitingChatCount } from "@/lib/whatsapp/inbox";

// Number of WhatsApp chats waiting for the team (the sidebar badge). The
// console gets live updates through Supabase Realtime; this is for checks and tools.

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return Response.json({ waiting: 0 }, { status: 401 });
  return Response.json({ waiting: await waitingChatCount() }, { headers: { "Cache-Control": "no-store" } });
}
