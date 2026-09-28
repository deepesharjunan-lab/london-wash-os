import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/lib/pwa/RegisterSW";

export const metadata: Metadata = {
  title: "London Wash Staff",
  manifest: "/manifests/staff.webmanifest",
  appleWebApp: { capable: true, title: "LW Staff", statusBarStyle: "default" },
  icons: { apple: "/appicon/apple-staff-180.png", icon: "/appicon/staff-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#f8f5ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function StaffAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterSW />
      {children}
    </>
  );
}
