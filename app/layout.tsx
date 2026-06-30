import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCN Register — Careco",
  description: "PCN register for Careco — stored PCNs, replacing the spreadsheet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
