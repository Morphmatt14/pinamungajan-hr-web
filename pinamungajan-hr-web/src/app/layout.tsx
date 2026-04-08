import type { Metadata } from "next";
import "./globals.css";
import { DevHydrationExtensionNote } from "@/app/DevHydrationExtensionNote";
import { ThemeProvider } from "@/components/ThemeProvider";
import { HelpBot } from "@/components/HelpBot";

export const metadata: Metadata = {
  title: "Pinamungajan HR",
  description: "HR document intake, review, and masterlist",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors" suppressHydrationWarning>
        <DevHydrationExtensionNote />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <HelpBot />
        </ThemeProvider>
      </body>
    </html>
  );
}
