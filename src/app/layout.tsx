import type { Metadata } from "next";
import "./globals.css";
import AuthKeepAlive from "@/components/auth-keep-alive";
import SettingsPanel from "@/components/settings-panel";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Personal Finance App",
  description: "App de finanzas personales con Next.js + Supabase"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark">
      <body className="app-shell">
        <ThemeProvider>
          <AuthKeepAlive />
          {children}
          <SettingsPanel />
        </ThemeProvider>
      </body>
    </html>
  );
}
