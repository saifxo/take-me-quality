import type { Metadata, Viewport } from "next";
import { Baloo_2, Figtree, IBM_Plex_Mono } from "next/font/google";
import { OfflineBanner, ToastProvider } from "@/components/ui/client";
import { PwaRegister } from "@/components/shell/pwa";
import "./globals.css";

const baloo = Baloo_2({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-baloo", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Take Me Quality — the standard behind every call", template: "%s · Take Me Quality" },
  description: "Take Me Quality (TMQ) is how Take Me listens to, scores and coaches every booking call against one clear standard.",
  applicationName: "Take Me Quality",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "TMQ", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#000000" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${baloo.variable} ${figtree.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <ToastProvider>
          <OfflineBanner />
          {children}
          <PwaRegister />
        </ToastProvider>
      </body>
    </html>
  );
}
