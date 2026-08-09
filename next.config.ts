import type { NextConfig } from "next";

const teamsFrameAncestors = [
  "'self'",
  "https://teams.microsoft.com",
  "https://*.teams.microsoft.com",
  "https://*.cloud.microsoft",
  "https://*.microsoft365.com",
  "https://*.office.com",
  "https://outlook.office.com",
  "https://outlook.office365.com",
].join(" ");

const safeBuildEnabled = process.env.NEXT_SAFE_BUILD === "1";
const requestedBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS ?? "1", 10);
const safeBuildCpus = Number.isFinite(requestedBuildCpus) && requestedBuildCpus > 0
  ? requestedBuildCpus
  : 1;

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  productionBrowserSourceMaps: false,
  experimental: {
    ...(safeBuildEnabled
      ? {
          cpus: safeBuildCpus,
          webpackBuildWorker: true,
          webpackMemoryOptimizations: true,
          parallelServerCompiles: false,
          parallelServerBuildTraces: false,
        }
      : {}),
  },
  outputFileTracingExcludes: {
    "/*": [
      "./backups/**/*",
      "./.dimprover/**/*",
      "./.next_before_*/**/*",
      "./.work_*/**/*",
      "./desktop_clients/**/*",
      "./launcher_source/**/*",
      "./notes/**/*",
      "./*.zip",
    ],
  },
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      },
      {
        source: "/teams/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${teamsFrameAncestors};`,
          },
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
