import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Playwright uses a separate development output directory so it never
   * reuses or conflicts with an interactive developer's Next server.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /*
   * Keep Firebase Admin outside the Turbopack server bundle.
   * firebase-admin -> jwks-rsa -> jose uses an ESM dependency chain
   * that can fail when bundled into the Vercel server runtime.
   */
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;