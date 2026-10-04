import { createClient } from "@/lib/supabase/server";
import { staffChatCount } from "@/lib/whatsapp/inbox";

// The sidebar polls this for the WhatsApp Inbox badge (open chats with the team).

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return Response.json({ staff: 0 }, { status: 401 });
  return Response.json({ staff: await staffChatCount() }, { headers: { "Cache-Control": "no-store" } });
}
