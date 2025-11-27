/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use static exports to generate a CDN-friendly bundle for docs hosting
  output: "export",
  images: {
    unoptimized: true,
  },

  // Allow reading markdown files from docs directory
  experimental: {
    serverComponentsExternalPackages: ["gray-matter"],
  },
};

module.exports = nextConfig;
