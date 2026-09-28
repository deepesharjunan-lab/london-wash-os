import Link from "next/link";
import { ownerUnread, requireOwner } from "@/lib/owner";
import { loadStages } from "@/lib/staff/flow";
import { loadQueue } from "@/lib/staff/queue";
import { ROLE_LABEL } from "@/lib/staff/roles";
import { duration, fmtDay } from "@/lib/time";
import { Card, Chip, OwnerShell } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production · London Wash Owner" };

export default async function OwnerProductionPage() {
  const { supabase, admin, me } = await requireOwner();
  const [stages, unread] = await Promise.all([loadStages(supabase), ownerUnread(admin, me.id)]);
  const working = stages.filter((s) => s.code !== "delivered");
  const queue = await loadQueue(supabase, stages, working.map((s) => s.id), null);
  const ids = [...new Set(queue.flatMap((q) => q.garments.map((g) => g.employeeId)).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await supabase.from("employee").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name] as [string, string]));

  return (
    <OwnerShell current="/owner/production" title="Production" unread={unread}>
      <p className="text-[13px] text-ink-2">Every garment still in the building, by stage. Oldest orders first.</p>
      {working.map((s) => {
        const qs = queue.filter((q) => q.stageId === s.id);
        const pcs = qs.reduce((a, q) => a + q.waiting + q.inProgress, 0);
        return (
          <section key={s.id} className="flex flex-col gap-2">
            <h2 className="flex items-center justify-between text-[15px] font-semibold">
              <span>
                {s.name} {s.app_role && <span className="text-[12px] font-semibold text-ink-3">· {ROLE_LABEL[s.app_role]}</span>}
              </span>
              <span className="text-[12.5px] font-semibold text-ink-2">{pcs} pcs</span>
            </h2>
            {qs.length ? (
              <Card>
                <ul className="divide-y divide-hair">
                  {qs.map((q) => {
                    const workers = [...new Set(q.garments.filter((g) => g.state === "in_progress").map((g) => name.get(g.employeeId ?? "") ?? "—"))];
                    const oldestStart = q.garments.filter((g) => g.startedAt).map((g) => g.startedAt!).sort()[0];
                    return (
                      <li key={q.orderId + s.id}>
                        <Link href={`/owner/orders/${q.orderId}`} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="min-w-0 flex-1">
                            <b className="block text-[14px]">{q.orderNumber}</b>
                            <span className="block truncate text-[12px] text-ink-2">
                              {q.customerName} · since {fmtDay(q.createdAt)}
                              {workers.length ? ` · ${workers.join(", ")} (${duration(oldestStart)})` : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 gap-1">
                            {q.inProgress > 0 && <Chip tone="info">{q.inProgress}</Chip>}
                            {q.waiting > 0 && <Chip tone="brass">{q.waiting}</Chip>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : (
              <Card className="px-4 py-3 text-[13px] text-ink-3">Nothing here.</Card>
            )}
          </section>
        );
      })}
      <p className="text-[12px] text-ink-3">
        <Chip tone="info">n</Chip> being worked on · <Chip tone="brass">n</Chip> waiting
      </p>
    </OwnerShell>
  );
}
