import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 启用严格模式
  reactStrictMode: true,
  // 实验性功能关闭（避免不稳定）
  experimental: {},
  // 服务端外部包（node_modules 里的 native modules）
  serverExternalPackages: [],
}

export default nextConfig
