import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, DM_Mono } from "next/font/google";
import "./globals.css";

// Font variables only. The console and login opt in via their own classes,
// so the (print) routes keep their own fonts untouched.
const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const ui = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "The London Wash OS",
  description: "Laundry operating system for The Art of Laundry, Kerala.",
  icons: { icon: "/appicon/club-192.png", apple: "/appicon/apple-club-180.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body className="bg-paper text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
