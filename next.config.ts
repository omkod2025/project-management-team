import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // db/schema.sql is authoritative and typechecking must stay honest, so this
  // is never set to true here.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
