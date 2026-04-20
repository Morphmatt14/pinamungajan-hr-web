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
  title: "Pinamungajan HR",
  description: "HR document intake, review, and masterlist",
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
        <DevHydrationExtensionNote />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <HelpBot />
        </ThemeProvider>
      </body>
    </html>
  );
}
