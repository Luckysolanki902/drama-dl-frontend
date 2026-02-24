import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.dmcdn.net" },
      { protocol: "https", hostname: "s1.dmcdn.net" },
      { protocol: "https", hostname: "s2.dmcdn.net" },
      { protocol: "https", hostname: "**.dailymotion.com" },
    ],
  },
};

export default nextConfig;
