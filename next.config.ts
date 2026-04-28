import type { NextConfig } from "next";

/** Public admin base path (NEXT_PUBLIC_ADMIN_PATH, e.g. /hr-admin) is mapped to app/admin in middleware. */

const nextConfig: NextConfig = {
  reactCompiler: false,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // Pin workspace root when another lockfile exists above this app (e.g. parent folder). Prevents wrong root on Vercel/local.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
