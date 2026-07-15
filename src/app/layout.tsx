import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bharatha Darshana — Order Form",
  description: "Order form and search for Bharatha Darshana bookstore invoices",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
