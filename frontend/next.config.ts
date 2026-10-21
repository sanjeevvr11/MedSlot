import type { NextConfig } from "next";

// The browser only ever talks to this Next.js origin; /api/* is proxied to
// FastAPI so the session cookie stays first-party (no CORS, SameSite=Lax works).
const backendUrl = (process.env.BACKEND_URL ?? "http://127.0.0.1:8010").replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
