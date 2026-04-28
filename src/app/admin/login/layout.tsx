import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administrator sign-in",
  description: "Sign in to the administrator area for Pinamungajan HR",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
