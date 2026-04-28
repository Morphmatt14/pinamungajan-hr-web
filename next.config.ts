import type { NextConfig } from "next";

/** Public admin base path (NEXT_PUBLIC_ADMIN_PATH, e.g. /hr-admin) is mapped to app/admin in middleware. */

const nextConfig: NextConfig = {
  reactCompiler: false,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // Pin workspace root when another lockfile exists above this app (e.g. parent folder). Prevents wrong root on Vercel/local.
  turbopack: {
    root: __dirname,
  },
  // Konva pulls `canvas` in Node; webpack production builds need this so server compilation succeeds (Turbopack tolerates it).
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

export default nextConfig;
