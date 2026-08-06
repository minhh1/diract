import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // @napi-rs/canvas ships prebuilt native .node binaries per platform (used
  // by lib/pdf/rasterizePdfPages.ts, server-side only) -- must stay outside
  // the Server Components bundle so Next.js resolves it via native require
  // instead of trying to bundle the binary.
  serverExternalPackages: ["@napi-rs/canvas"],
  // lib/pdf/rasterizePdfPages.ts loads pdf.js's standard-font substitute
  // glyph data from a runtime-built fs path (not a static import), so the
  // file tracer needs an explicit nudge to bundle it into this route's
  // deployed function -- same category of fix as the pdf.worker.mjs
  // static-import workaround in that same file.
  outputFileTracingIncludes: {
    "/api/generic-invoice-import/parse": ["./node_modules/pdfjs-dist/standard_fonts/**/*"],
  },
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
