import type { NextConfig } from "next";

// The API origin the browser calls (for the CSP connect-src allowlist). Derived
// from the build-time public API base; falls back to same-origin only.
let apiOrigin = "";
try {
  apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE ?? "").origin;
} catch {
  apiOrigin = "";
}

// Content-Security-Policy. 'unsafe-inline' is kept for script/style because
// Next's hydration + Tailwind inject inline script/style; everything else is
// locked to 'self' + the API origin. Tightened further with a nonce later.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
].join("; ");

// Security headers applied to every response (review request, 2026-06-19).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Hide the Next.js dev on-screen indicator (the floating "N" badge). Build
  // and runtime errors are still surfaced. (devIndicators.md, Next 16.)
  devIndicators: false,
  // Skip the in-build type-check + lint passes — they are the most memory-heavy
  // step of `next build` and were OOM-ing the small single-server Docker build.
  // Type safety is enforced separately (CI/local `tsc --noEmit`), so the
  // production image build stays lean and reliable.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Emit a self-contained server bundle for a lean production Docker image
  // (.next/standalone → `node server.js`). See frontend/Dockerfile.
  output: 'standalone',
  // Apply the security headers to all routes.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
