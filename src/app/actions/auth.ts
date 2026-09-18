"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/server/services/auth";
import { changeOwnPassword } from "@/server/services/users";
import { clearSessionCookie, getCurrentUser, requestMeta, setSessionCookie } from "@/server/auth/session";
import { actorFor, homeFor } from "@/server/auth/dal";
import { AppError } from "@/server/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; message?: string; values?: Record<string, string> } | null;

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : null;
};

const loginSchema = z.object({
  email: z.string().trim().email("Enter the email your admin set up for you."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values: { email } };
  }
  let destination: string;
  try {
    const { token, user } = await signIn(parsed.data.email, parsed.data.password, await requestMeta());
    await setSessionCookie(token);
    const next = safeNext(formData.get("next"));
    const allowed = next && (user.role === "admin" || !next.startsWith("/admin"));
    destination = user.mustChangePassword ? "/welcome" : allowed ? next! : homeFor(user.role);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, values: { email } };
    console.error("[login]", err);
    return { error: "We couldn’t sign you in just now. Please try again.", values: { email } };
  }
  redirect(destination);
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login?signedOut=1");
}

const newPassword = z
  .object({ next: z.string().min(1, "Choose a new password."), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "The two passwords don’t match.", path: ["confirm"] });

export async function setFirstPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = newPassword.safeParse({ next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: { [String(parsed.error.issues[0].path[0])]: parsed.error.issues[0].message } };
  try {
    const meta = await requestMeta();
    await changeOwnPassword({ id: user.id, role: user.role, name: user.name, ip: meta.ip, sessionId: user.sessionId, email: user.email }, { next: parsed.data.next }, { firstSignIn: true });
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    throw err;
  }
  redirect(homeFor(user.role));
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPassword.safeParse({ next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: { [String(parsed.error.issues[0].path[0])]: parsed.error.issues[0].message } };
  try {
    const actor = await actorFor();
    await changeOwnPassword(actor, { current: String(formData.get("current") ?? ""), next: parsed.data.next });
    return { message: "Password updated. You’ve been signed out on your other devices." };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    throw err;
  }
}
