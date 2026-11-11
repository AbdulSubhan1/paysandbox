import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV === 'development';

// The checkout must never be framed (nobody can crop out the TEST MODE banner) and talks only to us.
const checkoutCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // The dashboard has one page so far.
  async redirects() {
    return [{ source: '/dashboard', destination: '/dashboard/projects', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/c/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: checkoutCsp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
