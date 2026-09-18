"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "lucide-react";
import { deleteReviewAction } from "@/app/actions/reviews";
import { useToast } from "@/components/ui/client";

export function QueueActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove this call from your queue?")) return;
        start(async () => {
          const res = await deleteReviewAction(id);
          if (res.ok) {
            toast({ tone: "ok", title: "Removed from your queue" });
            router.refresh();
          } else toast({ tone: "error", title: "Couldn’t remove it", body: res.error });
        });
      }}
      className="grid size-8 place-items-center rounded-full text-faint opacity-0 transition group-hover:opacity-100 hover:bg-fail-soft hover:text-fail focus:opacity-100 disabled:opacity-50"
      aria-label="Remove from queue"
      title="Remove from queue"
    >
      <Trash className="size-4" />
    </button>
  );
}
