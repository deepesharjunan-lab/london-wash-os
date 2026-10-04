import Link from "next/link";
import { TemplateBuilder } from "./builder";

export const dynamic = "force-dynamic";

export default function NewTemplatePage() {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/engage/templates" className="hover:underline">
          Engage · Templates
        </Link>
      </div>
      <h1 className="mb-2 font-archivo text-2xl font-extrabold text-ink">New WhatsApp template</h1>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">
        Templates are the messages you can send to customers first (campaigns, reminders, order updates). WhatsApp checks every template before it can be used;
        approval usually takes a few minutes.
      </p>
      <TemplateBuilder />
    </div>
  );
}
