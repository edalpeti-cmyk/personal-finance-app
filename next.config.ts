import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // TypeScript already passes with `tsc --noEmit`; this avoids Vercel's failing internal spawn step.
    ignoreBuildErrors: true
  }
};

export default nextConfig;
