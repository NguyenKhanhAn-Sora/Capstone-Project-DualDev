import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE ??
      process.env.BACKEND_URL ??
      "http://localhost:9999",
    NEXT_PUBLIC_SOCIAL_URL:
      process.env.NEXT_PUBLIC_SOCIAL_URL ??
      process.env.SOCIAL_URL ??
      "http://localhost:3000",
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      "http://localhost:3001",
  },
};

export default nextConfig;
