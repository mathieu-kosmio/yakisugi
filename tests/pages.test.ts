import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/evenements/[slug]/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("event SEO metadata", () => {
  it("publishes indexable product routes but excludes transactional routes", async () => {
    const entries = await sitemap();
    expect(
      entries.some((entry) =>
        entry.url.endsWith("/evenements/saumos-2026-fixture"),
      ),
    ).toBe(true);
    expect(entries.some((entry) => entry.url.includes("/acheter/"))).toBe(
      false,
    );
    expect(
      entries.some((entry) => entry.url.endsWith("/mentions-legales")),
    ).toBe(true);
    expect(robots().rules).toMatchObject({
      disallow: ["/api/", "/acheter/"],
    });
  });

  it("builds metadata from a published event", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "saumos-2026-fixture" }),
    });

    expect(metadata.title).toBe(
      "Incident de démonstration de Saumos : carte des forêts et bois affectés",
    );
    expect(metadata.description).toContain("forêt potentiellement affectée");
    expect(metadata.alternates?.canonical).toBe(
      "/evenements/saumos-2026-fixture",
    );
  });

  it("returns neutral metadata for an unknown event", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "missing" }),
    });

    expect(metadata.title).toBe("Événement introuvable");
  });
});
