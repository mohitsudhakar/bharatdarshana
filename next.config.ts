import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: 'export',
  distDir: 'dist',
  trailingSlash: true,
};

export default nextConfig;
