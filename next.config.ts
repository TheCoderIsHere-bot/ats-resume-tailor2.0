import type { NextConfig } from "next";

const securityHeaders = [
  // 1. Force HTTPS for 2 years, apply to all subdomains, eligible for browser preload list
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // 2. Prevent MIME type sniffing attacks
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // 3. Prevent clickjacking by forbidding embedding in iframes
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // 4. Send referrer on same-origin; send only origin across domains over HTTPS
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // 5. Restrict browser feature permissions
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  // 6. Content Security Policy (allows Next.js, Supabase, Google Auth, Razorpay, Google Fonts)
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com https://generativelanguage.googleapis.com",
      "frame-src 'self' https://api.razorpay.com https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['mammoth', 'docx', '@react-pdf/renderer', 'canvas'],
  // Disables the X-Powered-By header to avoid revealing tech stack
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
