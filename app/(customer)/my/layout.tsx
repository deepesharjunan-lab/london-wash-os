import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/lib/pwa/RegisterSW";

export const metadata: Metadata = {
  manifest: "/manifests/club.webmanifest",
  appleWebApp: { capable: true, title: "London Wash", statusBarStyle: "default" },
  icons: { apple: "/appicon/apple-club-180.png", icon: "/appicon/club-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#f8f5ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CustomerAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterSW />
      {children}
    </>
  );
}
