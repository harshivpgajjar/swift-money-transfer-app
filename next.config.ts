import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // EOD sheets / cash books can exceed the 1 MB default, which THROWS
      // (crashing the page) instead of returning an error.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
