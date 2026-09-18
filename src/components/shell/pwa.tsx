"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// A tiny store so any component can offer "Install app" once the browser allows it.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    } else {
      // Development files change without new names, so never let a service worker cache them.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallEvent;
      emit();
    };
    const onInstalled = () => {
      deferred = null;
      emit();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

export function InstallAppButton({ className, variant = "outline" }: { className?: string; variant?: "outline" | "ghost" | "brand" }) {
  const available = useSyncExternalStore(subscribe, () => !!deferred, () => false);
  const [iosHint, setIosHint] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const t = setTimeout(() => {
      setStandalone(isStandalone);
      setIosHint(isIos && !isStandalone);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (standalone) return null;
  if (iosHint) {
    return <p className={cn("text-[12px] leading-snug text-white/60", className)}>Install: tap Share, then “Add to Home Screen”.</p>;
  }
  if (!available) return null;
  return (
    <button
      type="button"
      className={buttonClass(variant, "sm", className)}
      onClick={async () => {
        if (!deferred) return;
        await deferred.prompt();
        await deferred.userChoice.catch(() => null);
        deferred = null;
        emit();
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
      </svg>
      Install app
    </button>
  );
}
