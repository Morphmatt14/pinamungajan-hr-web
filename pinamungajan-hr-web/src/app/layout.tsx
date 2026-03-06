import type { Metadata } from "next";
import "./globals.css";
import { DevHydrationExtensionNote } from "@/app/DevHydrationExtensionNote";

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
      <body className="antialiased" suppressHydrationWarning>
        <DevHydrationExtensionNote />
        {children}
      </body>
    </html>
  );
}
