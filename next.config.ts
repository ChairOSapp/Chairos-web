import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/sign-in', destination: '/login', permanent: true },
      { source: '/sign-up', destination: '/signup', permanent: true },
      { source: '/register', destination: '/signup', permanent: true },
    ]
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
