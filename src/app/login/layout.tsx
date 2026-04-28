import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Pinamungajan HR document and masterlist system",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
