import type { MetadataRoute } from "next";

/** Manifest do PWA (instalável; service worker completo na Fase 2). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Elio — Perto de quem importa",
    short_name: "Elio",
    description: "Conversas em tempo real, privadas e personalizáveis.",
    lang: "pt-BR",
    start_url: "/conversas",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBFAF7",
    theme_color: "#FBFAF7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
