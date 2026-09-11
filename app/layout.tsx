import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The London Wash OS",
  description: "Laundry operating system for The Art of Laundry, Kerala.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
