const CANONICAL_HOST = process.env.NEXT_PUBLIC_DOCS_HOST || "docs.asimo.io";
const SECONDARY_HOST =
  process.env.NEXT_PUBLIC_SECONDARY_DOCS_HOST || "assistdocs.asimo.io";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use static exports to generate a CDN-friendly bundle for docs hosting
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_DOCS_HOST: CANONICAL_HOST,
    NEXT_PUBLIC_DOCS_URL: `https://${CANONICAL_HOST}`,
    NEXT_PUBLIC_SECONDARY_DOCS_HOST: SECONDARY_HOST,
  },
  // Note: redirects require server runtime, not available with static export
  // Use web server config (nginx/Apache) for host-based redirects

  // Allow reading markdown files from docs directory
  experimental: {
    serverComponentsExternalPackages: ["gray-matter"],
  },
};

module.exports = nextConfig;
