import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev on-screen indicator (the floating "N" badge). Build
  // and runtime errors are still surfaced. (devIndicators.md, Next 16.)
  devIndicators: false,
};

export default nextConfig;
