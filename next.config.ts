import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node addon — Turbopack must not bundle it.
  // Without this, it generates a hashed module ID at build time that the
  // runtime cannot resolve (e.g. 'better-sqlite3-90e2652d1716b047').
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
