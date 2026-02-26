import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TypePanel — Live shared typing",
  description: "Type together in real time. No sign-up, no persistence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
