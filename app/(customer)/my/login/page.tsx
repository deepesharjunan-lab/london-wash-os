import { redirect } from "next/navigation";
import { memberId } from "@/lib/customer/session";
import LoginForm from "./LoginForm";
import { Logo } from "@/lib/brand/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · The London Wash Club" };

export default function MemberLoginPage() {
  if (memberId()) redirect("/my");
  return (
    <main className="lw-app flex min-h-screen items-center justify-center bg-[radial-gradient(90%_60%_at_50%_35%,#1e2d4d_0%,#101828_70%)] px-5 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex flex-col items-center gap-5 text-[#efe8da]">
          <Logo tone="light" className="h-auto w-[270px] max-w-full" />
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
