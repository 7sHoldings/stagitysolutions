import type { NextConfig } from "next";

// Old WordPress URLs -> new pages, so existing links and Google results keep working.
const oldToNew: Record<string, string> = {
  "/home": "/",
  "/about-us": "/about",
  "/our-services": "/services",
  "/contact-us": "/contact",
  "/enterprise-mobility-solutions": "/services/enterprise-mobility",
  "/infrastructure-management-services": "/services/infrastructure-management",
  "/business-processing-outsourcing-bpo": "/services/business-process-outsourcing",
  "/data-architecture-and-engineering": "/services/data-architecture-engineering",
  "/application-development": "/services/application-development",
  "/business-intelligence-analytics": "/services/business-intelligence-analytics",
  "/cloud-services": "/services/cloud-services",
  "/strategy-architecture": "/services/strategy-architecture",
  "/data-science-and-machine-learning": "/services/data-science-machine-learning",
  "/modern-bi-analytics": "/services/modern-bi-analytics",
  "/banking-finance": "/industries#banking-finance",
  "/insurance": "/industries#insurance",
  "/manufacturing-retailing": "/industries#manufacturing-retail",
  "/health-care": "/industries#health-care",
  "/blog": "/",
  "/my-account": "/",
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return Object.entries(oldToNew).map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
