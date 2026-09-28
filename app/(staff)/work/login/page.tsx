import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staff/session";
import StaffLoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · London Wash Staff" };

export default async function StaffLoginPage() {
  if (await currentStaff()) redirect("/work");
  return (
    <main className="lw-app flex min-h-screen items-center justify-center bg-[radial-gradient(90%_60%_at_50%_35%,#1e2d4d_0%,#101828_70%)] px-5 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-[#efe8da]">
          <span className="font-display text-[64px] font-medium leading-none tracking-[-0.04em] text-[#e3d2ac]" aria-hidden="true">
            LW
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">London Wash Staff</span>
        </div>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-display text-[28px] font-medium text-[#efe8da]">Good to see you</h1>
          <p className="text-[14px] text-white/60">Sign in with your mobile number and the PIN the owner gave you.</p>
        </div>
        <StaffLoginForm />
        <p className="text-center text-[12px] leading-relaxed text-white/40">
          Your account works on one phone. New phone, or forgot your PIN? Ask the owner to reset it.
        </p>
      </div>
    </main>
  );
}
