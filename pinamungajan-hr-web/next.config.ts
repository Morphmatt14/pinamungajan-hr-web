import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
