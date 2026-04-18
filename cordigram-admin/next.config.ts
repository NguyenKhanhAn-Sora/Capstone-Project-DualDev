import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE ??
      process.env.BACKEND_URL ??
      "https://cordigram-api.onrender.com",
    NEXT_PUBLIC_SOCIAL_URL:
      process.env.NEXT_PUBLIC_SOCIAL_URL ??
      process.env.SOCIAL_URL ??
      "https://www.cordigram.com",
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      "https://admin.cordigram.com",
  },
};

export default nextConfig;
