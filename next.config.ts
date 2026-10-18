import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy: everything must come from this site. The page is
 * static, so inline scripts are allowed rather than per-request nonces (see
 * node_modules/next/dist/docs, "Content Security Policy", "Without Nonces").
 * Development also needs 'unsafe-eval' for React's debugging tools.
 *
 * Frames are limited to this site ('self' rather than 'none') because BotID
 * serves its challenge from same-origin paths that may be framed.
 */
const csp = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

/** Security headers sent with every response. */
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Only HTTPS for two years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // No other site may frame this one (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Browsers must trust the declared content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Other sites see only our origin, never full URLs (e.g. ?day previews).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The game needs none of these browser features.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Isolate this window from pages it opens or that open it.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// BotID adds the rewrites that proxy its invisible challenge through this site.
export default withBotId(nextConfig);
