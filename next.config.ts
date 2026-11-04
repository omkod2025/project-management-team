import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // The floating Next.js badge in the corner of every dev page. It sits on top
  // of the interface while it is being looked at, which is the one time it is
  // in the way. Compile and runtime errors are still surfaced without it.
  devIndicators: false,
  // db/schema.sql is authoritative and typechecking must stay honest, so this
  // is never set to true here.
  typescript: { ignoreBuildErrors: false },
  // A published wiki (wiki spec §5b): the URL is the credential, so no
  // crawler may list it and no referrer may carry it off. (No cache may keep
  // it either: its pages are force-dynamic, which Next answers with
  // `private, no-cache, no-store, …` — a Cache-Control set here would be
  // overwritten, so it is not pretended to be set here.)
  async headers() {
    return [{
      source: '/w/:path*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }];
  },
};

export default nextConfig;
