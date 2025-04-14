module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://snake-battle.vercel.app/api/:path*'
      }
    ]
  },
  webpack: (config, { isServer }) => {
    // Escludi i file di benchmark e test
    config.module.rules.push({
      test: /node_modules\/.*\/(test|tests|benchmark|benchmarks|bench)\/.*/,
      use: 'null-loader',
    });
    
    return config;
  }
} 