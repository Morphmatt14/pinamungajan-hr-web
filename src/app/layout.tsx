import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DevHydrationExtensionNote } from "@/app/DevHydrationExtensionNote";
import { ThemeProvider } from "@/components/ThemeProvider";
import { HelpBot } from "@/components/HelpBot";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Pinamungajan HR",
    template: "%s · Pinamungajan HR",
  },
  description: "Document intake, record review, and employee masterlist for LGU Human Resources",
  icons: {
    icon: [{ url: "/pinamungajan-logo.png", type: "image/png" }],
    apple: [{ url: "/pinamungajan-logo.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased min-h-screen bg-app-bg text-app-text transition-colors`}
        suppressHydrationWarning
      >
        <a href="#main-content" className="app-skip">
          Skip to main content
        </a>
        <DevHydrationExtensionNote />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <HelpBot />
        </ThemeProvider>
      </body>
    </html>
  );
}
