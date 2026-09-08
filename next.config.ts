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
};

export default nextConfig;
