import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    // /auevo -> /proofs (2026-10-04): the page route moved to match the
    // nav label ("Proofs") people actually see. Permanent so old shared
    // links and bookmarks keep working instead of 404ing.
    return [
      { source: "/auevo", destination: "/proofs", permanent: true },
      { source: "/auevo/:path*", destination: "/proofs/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
