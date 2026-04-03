import type { Metadata } from "next";
import "./globals.css";
import AuthKeepAlive from "@/components/auth-keep-alive";
import PwaRegister from "@/components/pwa-register";
import SettingsPanel from "@/components/settings-panel";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Personal Finance App",
  description: "App de finanzas personales con Next.js + Supabase",
  manifest: "/manifest.webmanifest",
  themeColor: "#091426",
  icons: {
    icon: [
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/pwa-192.png"]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Finance"
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark">
      <body className="app-shell">
        <ThemeProvider>
          <PwaRegister />
          <AuthKeepAlive />
          {children}
          <SettingsPanel />
        </ThemeProvider>
      </body>
    </html>
  );
}
