import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExplodeX Scanner",
  description: "Early LONG/SHORT opportunity scanner dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
