"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <p className="font-display text-[26px] font-extrabold">Something went wrong</p>
      <p className="mt-2 text-[14.5px] text-muted">
        We couldn’t load this page. Your saved work is safe. Try again, and if it keeps happening, tell your admin
        {error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
