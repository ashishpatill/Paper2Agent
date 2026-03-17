import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Paper2Agent Studio",
  description: "Turn a paper URL or PDF into a Paper2Agent workspace with secure local key storage."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
