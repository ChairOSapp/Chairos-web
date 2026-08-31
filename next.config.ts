import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // React/webpack use eval() for dev-mode-only debugging features
              // (stack rewriting, HMR) and never in production — scope
              // unsafe-eval to dev so the production policy stays tight.
              // connect.facebook.net / googletagmanager.com: shop-level Meta
              // Pixel / Google tag, injected only on that shop's own public
              // booking page (app/book/[shopCode]/page.tsx), never site-wide.
              `script-src 'self' 'unsafe-inline' https://web.squarecdn.com https://sandbox.web.squarecdn.com https://challenges.cloudflare.com https://connect.facebook.net https://www.googletagmanager.com${isDev ? " 'unsafe-eval'" : ''}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://web.squarecdn.com https://sandbox.web.squarecdn.com https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://www.facebook.com https://connect.facebook.net https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
              "frame-src 'self' https://web.squarecdn.com https://sandbox.web.squarecdn.com https://challenges.cloudflare.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/sign-in', destination: '/login', permanent: true },
      { source: '/sign-up', destination: '/signup', permanent: true },
      { source: '/register', destination: '/signup', permanent: true },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // No org/project/authToken configured yet -- the plugin skips source
  // map upload gracefully when these are unset (errors still get
  // captured, just with minified stack traces until they're added).
  widenClientFileUpload: true,
});
