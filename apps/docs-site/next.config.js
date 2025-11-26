/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Enable static export for docs site
  // output: 'export',
  // images: { unoptimized: true },

  // Allow reading markdown files from docs directory
  experimental: {
    serverComponentsExternalPackages: ["gray-matter"],
  },
};

module.exports = nextConfig;
