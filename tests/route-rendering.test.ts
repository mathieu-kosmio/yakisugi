import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/map/radar-map", () => ({
  RadarMap: () => null,
}));

vi.mock("@/lib/data/radar-repository", () => ({
  getRadarDataBySlug: vi.fn(),
  listIncidents: vi.fn(),
}));

describe("deployment rendering policy", () => {
  it("keeps the map page Supabase query out of the build prerender", async () => {
    const mapPage = await import("@/app/carte/page");

    expect("dynamic" in mapPage ? mapPage.dynamic : undefined).toBe(
      "force-dynamic",
    );
  });
});
