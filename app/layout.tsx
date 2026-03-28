import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Paper2Agent Studio",
  description: "Open-source paper implementation engine — turn any ML paper into validated, runnable agents."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Sidebar />
          {/* Mobile spacer for fixed top bar */}
          <div className="h-14 lg:hidden" />
          {/* Main content offset by sidebar width on desktop */}
          <main className="min-h-screen lg:pl-60">
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
