import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/server/auth/dal";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect(homeFor(user.role));
  return (
    <AuthShell>
      <p className="text-[13px] font-semibold tracking-[0.1em] text-brand-700 uppercase">Welcome, {user.name.split(" ")[0]}</p>
      <h1 className="font-display mt-1 text-[34px] leading-tight font-extrabold">Set your own password</h1>
      <p className="mt-2 text-[15px] text-muted">You signed in with a one-time password from your admin. Choose a new one to continue.</p>
      <WelcomeForm />
    </AuthShell>
  );
}
