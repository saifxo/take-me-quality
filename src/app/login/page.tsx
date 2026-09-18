import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/welcome" : homeFor(user.role));
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <AuthShell>
      <h1 className="font-display text-[34px] leading-tight font-extrabold">Welcome back</h1>
      <p className="mt-2 text-[15px] text-muted">Sign in with the account your Take Me Quality admin created for you.</p>
      {sp.signedOut ? <p className="mt-5 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-brand-900">You’ve signed out.</p> : null}
      <LoginForm next={next} />
      <p className="mt-8 text-[13.5px] leading-relaxed text-muted">
        Forgotten your password or need an account? Ask your quality admin — accounts are created and reset by admins only.
      </p>
    </AuthShell>
  );
}
