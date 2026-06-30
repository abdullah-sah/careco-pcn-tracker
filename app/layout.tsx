import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recovery Desk — Careco PCN Register",
  description:
    "PCN register for Careco — stored letters, replacing the spreadsheet. UK GDPR, name-only.",
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
