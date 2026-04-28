import type { NextConfig } from "next";

/** Public admin base path (NEXT_PUBLIC_ADMIN_PATH, e.g. /hr-admin) is mapped to app/admin in middleware. */

const nextConfig: NextConfig = {
  reactCompiler: false,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
