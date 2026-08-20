import { describe, expect, it } from "vitest";
import { radarFixture } from "@/fixtures/radar";
import {
  estimateVolume,
  filterParcels,
  summarizeIncident,
} from "@/lib/domain/radar";

describe("radar domain", () => {
  it("keeps volume absent when no coefficient is validated", () => {
    expect(estimateVolume(12.5, null)).toBeNull();
  });

  it("calculates and rounds a documented coefficient range", () => {
    expect(estimateVolume(2.55, { minM3PerHa: 100, maxM3PerHa: 150 })).toEqual({
      minM3: 255,
      maxM3: 383,
    });
  });

  it("rejects an inverted coefficient range", () => {
    expect(() =>
      estimateVolume(2, { minM3PerHa: 120, maxM3PerHa: 100 }),
    ).toThrow("Invalid volume estimation inputs");
  });

  it("filters parcels by species, affected area and confidence", () => {
    const result = filterParcels(radarFixture.parcels.features, {
      species: "Pin maritime",
      minAffectedAreaHa: 8,
      confidence: ["high"],
    });

    expect(result).toHaveLength(4);
    expect(
      result.every((parcel) => parcel.properties.confidence === "high"),
    ).toBe(true);
  });

  it("summarizes the fixture without inventing volume", () => {
    const summary = summarizeIncident(radarFixture);

    expect(summary.parcelCount).toBe(10);
    expect(summary.forestAreaHa).toBe(944);
    expect(summary.mainSpecies).toBe("Pin maritime");
    expect(summary.industryCountWithin100Km).toBe(8);
    expect(summary.estimatedVolumeMinM3).toBeNull();
  });
});

describe("development fixture contract", () => {
  it("contains the minimum data required for independent development", () => {
    expect(radarFixture.incident).toBeDefined();
    expect(radarFixture.parcels.features).toHaveLength(10);
    expect(radarFixture.forests.features).toHaveLength(4);
    expect(radarFixture.industries.features).toHaveLength(10);
  });

  it("marks every displayed volume as unavailable", () => {
    for (const parcel of radarFixture.parcels.features) {
      expect(parcel.properties.estimatedVolumeMinM3).toBeNull();
      expect(parcel.properties.estimatedVolumeMaxM3).toBeNull();
    }
  });
});
