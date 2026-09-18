"use client";

import { useActionState } from "react";
import { setFirstPasswordAction, type FormState } from "@/app/actions/auth";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";

export function WelcomeForm() {
  const [state, action] = useActionState<FormState, FormData>(setFirstPasswordAction, null);
  return (
    <form action={action} className="mt-8 grid gap-5">
      <FormError message={state?.error} />
      <Field label="New password" htmlFor="next" hint="At least 10 characters, with a letter and a number." error={state?.fieldErrors?.next}>
        <Input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} autoFocus />
      </Field>
      <Field label="Type it again" htmlFor="confirm" error={state?.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg" pendingText="Saving…" className="w-full">
        Save and continue
      </SubmitButton>
    </form>
  );
}
