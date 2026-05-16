import withPWA from 'next-pwa'

const pwa = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  buildExcludes: [/\.wasm$/],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, layers: true }

    // snarkjs / ffjavascript는 Node.js worker를 사용 — 브라우저 번들에서 Node 모듈 폴백 설정
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        worker_threads: false,
      }
    }

    // web-worker의 Node.js 구현을 무시 (브라우저에서 네이티브 Worker 사용)
    config.module.rules.push({
      test: /web-worker[/\\]cjs[/\\]node\.js$/,
      use: 'null-loader',
    })

    return config
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy',  value: 'require-corp' },
        ],
      },
    ]
  },
}

export default pwa(nextConfig)
