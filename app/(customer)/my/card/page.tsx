import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireMember } from "@/lib/customer/session";
import { loadMember } from "@/lib/customer/member";
import { AppShell, cardStyle, fmtDate } from "../ui";
import { Logo } from "@/lib/brand/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership card · The London Wash Club" };

export default async function MemberCardPage() {
  const { customerId, db } = requireMember();
  const m = await loadMember(db, customerId);
  if (!m) redirect("/my/login");
  const c = cardStyle(m.tier.card_style);
  const memberNo = m.acct?.member_no ?? `LWC ${customerId.slice(0, 4).toUpperCase()}`;
  // The QR carries only the member number and customer id, which staff scan to open the wallet.
  const qr = await QRCode.toString(`LWC|${memberNo.replace(/\s/g, "")}|${customerId}`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#15213A", light: "#FFFFFF" },
  });

  return (
    <AppShell current="/my/membership" title="Membership card" back="/my">
      <div
        className="relative flex aspect-[1.586] flex-col justify-between overflow-hidden rounded-[18px] p-[22px]"
        style={{ background: c.bg, color: c.ink, boxShadow: `inset 0 0 0 1px ${c.edge}, 0 20px 40px -24px rgba(10,14,24,.55)` }}
      >
        <div className="flex items-start justify-between gap-2">
          <Logo tone={c.ink.toUpperCase() === "#15213A" ? "dark" : "light"} className="h-auto w-[132px]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-75">Club member</span>
        </div>
        <div className="font-display text-[24px] font-medium uppercase tracking-[0.2em]" style={{ color: c.accent }}>
          {m.tier.name}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold">{m.customer.full_name}</div>
            <div className="font-mono text-[13px] tracking-[0.12em] opacity-80">{memberNo}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-[22px] font-medium tabular-nums">{m.points}</div>
            <div className="text-[12px] opacity-75">points</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
        <span className="rounded-full bg-[#e2eee7] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#2c6a4e]">Active</span>
        <span>
          Member since {new Date(m.customer.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} · Renews {fmtDate(m.renew.toISOString())}
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-hair bg-white p-5">
        <div className="h-[200px] w-[200px] [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`Membership QR code for ${memberNo}`} dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="text-center">
          <div className="font-semibold text-navy">Show this code at the counter</div>
          <div className="font-mono text-[12.5px] text-ink-3">{memberNo}</div>
        </div>
      </div>
      <p className="text-center text-[12.5px] text-ink-3">Staff scan it to find your orders, apply your rewards and add points to your membership.</p>
    </AppShell>
  );
}
