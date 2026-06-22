import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/sign-in', destination: '/login', permanent: true },
      { source: '/sign-up', destination: '/signup', permanent: true },
      { source: '/register', destination: '/signup', permanent: true },
    ]
  },
};

export default nextConfig;
