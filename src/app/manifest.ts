import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Take Me Quality",
    short_name: "TMQ",
    description: "Score calls, coach agents and track quality across Take Me’s booking centres.",
    start_url: "/login?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Score a call", short_name: "Score", url: "/qa/new" },
      { name: "Dashboard", short_name: "Dashboard", url: "/admin" },
    ],
  };
}
