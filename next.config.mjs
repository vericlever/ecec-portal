/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Compliance data (is this SOP signed, is this credential current) must
    // never be served stale from the client-side router cache. Always refetch
    // dynamic route segments on navigation.
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
};

export default nextConfig;
