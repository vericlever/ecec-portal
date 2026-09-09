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
    // @react-pdf/renderer pulls in yoga-layout, a WASM layout engine shipped
    // as an ESM module with a top-level await. Next's own bundler mishandles
    // that combination when it packages a route handler for the Vercel
    // serverless function - the reports render fine under `next dev` (no
    // production bundling step) but throw at runtime once deployed. Marking
    // both packages external tells Next to leave them alone and let Node
    // require them directly at runtime instead.
    serverComponentsExternalPackages: ["@react-pdf/renderer", "yoga-layout"],
  },
};

export default nextConfig;
