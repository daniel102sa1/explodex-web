import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import GlobalPlanAlerts from "@/components/GlobalPlanAlerts";
import GlobalScannerBar from "@/components/GlobalScannerBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExplodeX",
  description: "ExplodeX dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AppNav />
        <GlobalScannerBar />
        {children}
        <GlobalPlanAlerts />
      </body>
    </html>
  );
}
