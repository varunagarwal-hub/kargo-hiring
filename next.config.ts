import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CV parsers load their own worker/binary assets; keep them out of the bundle.
  serverExternalPackages: ['unpdf', 'mammoth'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
