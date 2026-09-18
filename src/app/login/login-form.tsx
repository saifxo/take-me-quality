"use client";

import { useActionState, useState } from "react";
import { loginAction, type FormState } from "@/app/actions/auth";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-8 grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state?.error} />
      <Field label="Work email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          defaultValue={state?.values?.email ?? ""}
          aria-invalid={!!state?.fieldErrors?.email}
          placeholder="you@takeme.taxi"
        />
      </Field>
      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password}>
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required aria-invalid={!!state?.fieldErrors?.password} className="pr-16" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-muted hover:bg-sunken hover:text-ink">
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </Field>
      <SubmitButton size="lg" pendingText="Signing in…" className="mt-1 w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
