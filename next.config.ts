import type { NextConfig } from "next";

// Set at build time for a sub-path deployment (e.g. REELISH_BASE_PATH=/reelish); empty = served at "/".
const basePath = process.env.REELISH_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath,
  // Raw fetch() and redirect paths need the prefix too (Link and router add it themselves).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Self-contained server bundle: the small VPS runs it without npm install or an on-server build.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    // Thumbnails load straight from i.ytimg.com: no sharp binary to match the server, no resizing CPU.
    unoptimized: true,
    // Real platform thumbnails only; we never generate recipe images.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
