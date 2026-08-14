import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Playwright uses a separate development output directory so it never
   * reuses or conflicts with an interactive developer's Next server.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
