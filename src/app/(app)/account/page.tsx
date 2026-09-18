import type { Metadata } from "next";
import { requireUser } from "@/server/auth/dal";
import { Card, CardHeader, PageHeader } from "@/components/ui/surface";
import { InstallAppButton } from "@/components/shell/pwa";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Account" title={user.name} description={`${user.email} · ${user.role === "admin" ? "Admin" : "Quality reviewer"}`} />
      <div className="grid gap-6">
        <Card>
          <CardHeader title="Change password" description="Changing your password signs you out on every other device." />
          <div className="px-5 pb-5">
            <PasswordForm />
          </div>
        </Card>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[15px] font-semibold">Install Take Me Quality</p>
            <p className="mt-0.5 text-[13.5px] text-muted">Add it to your desktop or phone home screen for one-click access.</p>
          </div>
          <InstallAppButton variant="brand" />
        </Card>
        <Card className="p-5 text-[13.5px] leading-relaxed text-muted">
          For your security you’re signed out after a period of inactivity. Your name, role and email are managed by your admin.
        </Card>
      </div>
    </div>
  );
}
