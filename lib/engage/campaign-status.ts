// Labels and colours for campaign statuses (shared by the campaign pages).
export const CAMPAIGN_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-black/5 text-ink/60" },
  scheduled: { label: "Scheduled", tone: "bg-[#e8eef5] text-[#2c4a6a]" },
  sending: { label: "Sending…", tone: "bg-[#fdf0dc] text-[#8a5a12]" },
  sent: { label: "Sent", tone: "bg-[#e2eee7] text-[#2c6a4e]" },
  cancelled: { label: "Cancelled", tone: "bg-black/5 text-ink/60" },
  failed: { label: "Failed", tone: "bg-[#f6e4df] text-[#9c3326]" },
};
