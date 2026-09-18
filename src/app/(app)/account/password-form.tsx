"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction, type FormState } from "@/app/actions/auth";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton, useToast } from "@/components/ui/client";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, null);
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.message) {
      toast({ tone: "ok", title: state.message });
      form.current?.reset();
    }
  }, [state, toast]);
  return (
    <form ref={form} action={action} className="grid gap-4 sm:max-w-md">
      <FormError message={state?.error} />
      <Field label="Current password" htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters, with a letter and a number." error={state?.fieldErrors?.next}>
        <Input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Type it again" htmlFor="confirm" error={state?.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingText="Updating…" className="w-fit">
        Update password
      </SubmitButton>
    </form>
  );
}
