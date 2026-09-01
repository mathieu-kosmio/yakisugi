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

  it("does not reload the incident list when the map link already names one", async () => {
    const mapPage = await import("@/app/carte/page");
    const repository = await import("@/lib/data/radar-repository");
    vi.mocked(repository.listIncidents).mockResolvedValue([]);
    vi.mocked(repository.getRadarDataBySlug).mockResolvedValue(null);

    await mapPage.default({
      searchParams: Promise.resolve({ incident: "saumos-2026" }),
    });

    expect(repository.listIncidents).not.toHaveBeenCalled();
    expect(repository.getRadarDataBySlug).toHaveBeenCalledWith("saumos-2026");
  });
});
