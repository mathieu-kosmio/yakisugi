import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/acheter/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
