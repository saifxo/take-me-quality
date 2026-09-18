"use client";

import { useOffline } from "next/offline";
import { Card, Skeleton } from "@/components/ui/surface";

/** Route-level loading shells. They say so when the wait is the network, not the server. */
function OfflineNote() {
  const offline = useOffline();
  if (!offline) return null;
  return <p className="mb-4 rounded-xl bg-ink px-4 py-2.5 text-[13.5px] font-medium text-white">Waiting for a connection to load this page…</p>;
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <OfflineNote />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-9 w-72" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-3 h-3 w-36" />
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-6 h-64 w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="mt-4 h-5 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <OfflineNote />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Card className="mt-8 p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line py-3.5 last:border-0">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-3 w-64" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export function StudioSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading review">
      <OfflineNote />
      <Card className="flex items-center gap-4 p-5">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-3.5 w-80" />
        </div>
        <Skeleton className="h-10 w-32 rounded-full" />
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-0">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-9 w-64 rounded-xl" />
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <Skeleton className="h-14 w-32" />
          <Skeleton className="mt-4 h-6 w-28 rounded-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="mt-5 h-3 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
