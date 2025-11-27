const CANONICAL_HOST = process.env.NEXT_PUBLIC_DOCS_HOST || "docs.asimo.io";
const SECONDARY_HOST = process.env.NEXT_PUBLIC_SECONDARY_DOCS_HOST ||
  "assistdocs.asimo.io";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_DOCS_HOST: CANONICAL_HOST,
    NEXT_PUBLIC_DOCS_URL: `https://${CANONICAL_HOST}`,
    NEXT_PUBLIC_SECONDARY_DOCS_HOST: SECONDARY_HOST,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: SECONDARY_HOST }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];
  },
  // Enable static export for docs site
  // output: 'export',
  // images: { unoptimized: true },

  // Allow reading markdown files from docs directory
  experimental: {
    serverComponentsExternalPackages: ["gray-matter"],
  },
};

module.exports = nextConfig;
