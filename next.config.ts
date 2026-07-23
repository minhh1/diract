import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      // Dashboards used to live under their own URL namespace
      // (/dashboard/dashboards/<slug>, briefly /dashboard/boards/<slug>)
      // before being unified with custom tables at /dashboard/<slug>.
      // Redirect both old patterns so existing bookmarks/links don't 404.
      {
        source: "/dashboard/dashboards/:path*",
        destination: "/dashboard/:path*",
        permanent: true,
      },
      {
        source: "/dashboard/boards/:path*",
        destination: "/dashboard/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
