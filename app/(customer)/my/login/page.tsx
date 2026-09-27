import { redirect } from "next/navigation";
import { memberId } from "@/lib/customer/session";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · The London Wash Club" };

export default function MemberLoginPage() {
  if (memberId()) redirect("/my");
  return (
    <main className="lw-app flex min-h-screen items-center justify-center bg-[radial-gradient(90%_60%_at_50%_35%,#1e2d4d_0%,#101828_70%)] px-5 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex flex-col items-center gap-5 text-[#efe8da]">
          <span className="font-display text-[64px] font-medium leading-none tracking-[-0.04em] text-[#e3d2ac]" aria-hidden="true">
            LW
          </span>
          <span className="flex items-stretch gap-3 leading-[0.92]">
            <span className="font-archivo text-[17px] font-extrabold uppercase tracking-[0.06em]">
              The
              <br />
              London
              <br />
              Wash
            </span>
            <span className="w-px bg-current opacity-50" />
            <span className="self-center font-display text-[17px] italic leading-[1.02]">
              the art
              <br />
              of laundry
            </span>
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">The London Wash Club</span>
        </div>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-display text-[28px] font-medium text-[#efe8da]">Welcome</h1>
          <p className="text-[14px] text-white/60">Sign in with the mobile number you use with The London Wash.</p>
        </div>
        <LoginForm />
        <p className="text-center text-[12px] text-white/40">Your membership, points and orders in one place.</p>
      </div>
    </main>
  );
}
