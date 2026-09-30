import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExplodeX Trading Lab",
  description: "ExplodeX PAPER trading practice workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
