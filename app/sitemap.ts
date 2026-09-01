import type { MetadataRoute } from "next";
import { listIncidents } from "@/lib/data/radar-repository";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const incidents = await listIncidents();
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/carte`, changeFrequency: "weekly", priority: 0.9 },
    {
      url: `${baseUrl}/methodologie`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/mentions-legales`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...incidents.map((incident) => ({
      url: `${baseUrl}/evenements/${incident.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
