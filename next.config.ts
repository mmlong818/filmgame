import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {},
  serverExternalPackages: ['pg'],
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
