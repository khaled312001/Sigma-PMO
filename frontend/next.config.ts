import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev on-screen indicator (the floating "N" badge). Build
  // and runtime errors are still surfaced. (devIndicators.md, Next 16.)
  devIndicators: false,
  // Emit a self-contained server bundle for a lean production Docker image
  // (.next/standalone → `node server.js`). See frontend/Dockerfile.
  output: 'standalone',
};

export default nextConfig;
