/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Build output directory.
   *
   * Defaults to `.next`. Override with `NEXT_DIST_DIR` when the default
   * directory is unavailable — for example on a sandboxed or read-only CI
   * runner where Next cannot clean its own stale cache. Pointing at a fresh
   * directory lets the build proceed without deleting anything.
   *
   *   NEXT_DIST_DIR=.next-ci npm run build
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  eslint: {
    // Linting runs explicitly via `npm run lint`; a lint failure should not
    // block a production build.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
