import type { Metadata } from "next";
import "./globals.css";
import AuthKeepAlive from "@/components/auth-keep-alive";

export const metadata: Metadata = {
  title: "Personal Finance App",
  description: "App de finanzas personales con Next.js + Supabase"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="app-shell">
        <AuthKeepAlive />
        {children}
      </body>
    </html>
  );
}
