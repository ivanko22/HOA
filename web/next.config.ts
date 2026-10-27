import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth + tenant-scoped DB reads on every app route; keep classic dynamic rendering.
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
