module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://snake-battle.vercel.app/api/:path*'
      }
    ]
  }
} 