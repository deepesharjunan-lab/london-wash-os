import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/lib/pwa/RegisterSW";

export const metadata: Metadata = {
  title: "London Wash Owner",
  manifest: "/manifests/owner.webmanifest",
  appleWebApp: { capable: true, title: "LW Owner", statusBarStyle: "default" },
  icons: { apple: "/appicon/apple-owner-180.png", icon: "/appicon/owner-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#f8f5ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function OwnerAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterSW />
      {children}
    </>
  );
}
