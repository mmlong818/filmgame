import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {},
  serverExternalPackages: [],
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
