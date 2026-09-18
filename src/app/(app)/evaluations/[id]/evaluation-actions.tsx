"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Trash } from "lucide-react";
import { deleteReviewAction } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";
import { Dialog, Spinner, useToast } from "@/components/ui/client";
import { FormError, Textarea } from "@/components/ui/form";

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="size-3.5" /> Print
    </Button>
  );
}

export function AdminEvaluationActions({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <Button variant="ghost" size="sm" className="text-fail hover:bg-fail-soft hover:text-fail" onClick={() => setOpen(true)}>
        <Trash className="size-3.5" /> Delete
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete this review?" description="It will disappear from dashboards and exports. The audit log keeps a record.">
        <div className="grid gap-4">
          <FormError message={error} />
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required), e.g. Duplicate of another review" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteReviewAction(id, reason);
                  if (!res.ok) return setError(res.error);
                  toast({ tone: "ok", title: "Review deleted" });
                  router.push("/admin/evaluations");
                })
              }
            >
              {pending ? <Spinner /> : null} Delete review
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
