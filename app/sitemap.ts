import type { MetadataRoute } from "next";
import { company, services } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/services", "/industries", "/about", "/careers", "/contact", "/privacy"];
  return [
    ...pages.map((p) => ({ url: `${company.url}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.7 })),
    ...services.map((s) => ({ url: `${company.url}/services/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
