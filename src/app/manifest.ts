import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Finance App",
    short_name: "Finance",
    description: "Controla patrimonio, inversiones, deuda y objetivos desde el movil como una app.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#091426",
    theme_color: "#091426",
    orientation: "portrait",
    lang: "es-ES",
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
