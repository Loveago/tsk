import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
