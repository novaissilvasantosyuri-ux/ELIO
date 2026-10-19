import type { NextConfig } from "next";

// Host do Supabase (para o otimizador de imagens). Em build sem env, libera qualquer https.
function supabaseHost(): string {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) return new URL(url).hostname;
  } catch {
    /* ignora */
  }
  return "*";
}

const isProd = process.env.NODE_ENV === "production";

// CSP: em produção é mais rígida. 'unsafe-inline' em scripts é exigência do Next.js
// (hidratação); todo o resto é restrito. Reavaliar com nonces no futuro.
const scriptSrc = isProd ? `'self' 'unsafe-inline'` : `'self' 'unsafe-inline' 'unsafe-eval'`;
const csp = [
  `default-src 'self'`,
  `script-src ${scriptSrc}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' https: wss:`,
  `media-src 'self' blob: data:`,
  `frame-src 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: supabaseHost() }],
  },
  async headers() {
    const security = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(self), geolocation=(), payment=()",
      },
      ...(isProd
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
        : []),
    ];
    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;
