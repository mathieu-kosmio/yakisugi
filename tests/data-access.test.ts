import { describe, expect, it } from "vitest";
import {
  mapIncidentSummaryRow,
  mapIndustryProximityRow,
  mapParcelRow,
} from "@/lib/data/supabase-mappers";
import { resolveDataSourceConfig } from "@/lib/db/data-source-config";

const incidentId = "11111111-1111-4111-8111-111111111111";
const parcelId = "22222222-2222-4222-8222-222222222222";
const industryId = "33333333-3333-4333-8333-333333333333";

describe("data source configuration", () => {
  it("uses fixtures when Supabase credentials are absent", () => {
    expect(resolveDataSourceConfig({})).toEqual({ kind: "fixture" });
  });

  it("uses explicit fixture mode even when credentials exist", () => {
    expect(
      resolveDataSourceConfig({
        YAKISUGI_DATA_SOURCE: "fixture",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "secret",
      }),
    ).toEqual({ kind: "fixture" });
  });

  it("rejects a partial automatic configuration", () => {
    expect(() =>
      resolveDataSourceConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow("Supabase configuration is partial");
  });

  it("requires both credentials in explicit Supabase mode", () => {
    expect(() =>
      resolveDataSourceConfig({ YAKISUGI_DATA_SOURCE: "supabase" }),
    ).toThrow("Supabase data source requires");
  });

  it("returns validated Supabase server configuration", () => {
    expect(
      resolveDataSourceConfig({
        YAKISUGI_DATA_SOURCE: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "secret",
      }),
    ).toEqual({
      kind: "supabase",
      url: "https://example.supabase.co",
      secretKey: "secret",
    });
  });
});

describe("Supabase DTO mapping", () => {
  it("maps a summary while preserving unavailable volume", () => {
    expect(
      mapIncidentSummaryRow({
        id: incidentId,
        slug: "saumos-2026",
        name: "Saumos 2026",
        area_ha: 1200,
        forest_area_ha: 944.2,
        parcel_count: 10,
        main_species: "Pin maritime",
        industry_count_within_100_km: 8,
        estimated_volume_min_m3: null,
        estimated_volume_max_m3: null,
      }),
    ).toMatchObject({
      slug: "saumos-2026",
      forestAreaHa: 944.2,
      parcelCount: 10,
      estimatedVolumeMinM3: null,
    });
  });

  it("maps a parcel row to the public GeoJSON contract", () => {
    const parcel = mapParcelRow({
      id: parcelId,
      incident_id: incidentId,
      insee_code: "33448",
      commune_name: "Saumos",
      section: "AB",
      parcel_number: "0042",
      parcel_uid: "33448000AB0042",
      parcel_area_ha: 7.6,
      affected_area_ha: 6.9,
      affected_ratio: 0.91,
      forest_area_ha: 6.5,
      dominant_species: "Pin maritime",
      estimated_volume_min_m3: null,
      estimated_volume_max_m3: null,
      confidence: "medium",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-1.1, 45],
            [-1, 45],
            [-1, 45.1],
            [-1.1, 45],
          ],
        ],
      },
    });

    expect(parcel.properties.parcelUid).toBe("33448000AB0042");
    expect(parcel.properties.estimatedVolumeMinM3).toBeNull();
    expect(parcel.geometry.type).toBe("Polygon");
  });

  it("prefers a simplified web geometry when available", () => {
    const parcel = mapParcelRow({
      id: parcelId,
      incident_id: incidentId,
      insee_code: "33448",
      commune_name: "Saumos",
      section: "AB",
      parcel_number: "0042",
      parcel_uid: "33448000AB0042",
      parcel_area_ha: 7.6,
      affected_area_ha: 6.9,
      affected_ratio: 0.91,
      forest_area_ha: 6.5,
      dominant_species: null,
      estimated_volume_min_m3: null,
      estimated_volume_max_m3: null,
      confidence: "low",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-1.1, 45],
            [-1.05, 45.05],
            [-1, 45.1],
            [-1.1, 45],
          ],
        ],
      },
      geometry_web: {
        type: "Polygon",
        coordinates: [
          [
            [-1.1, 45],
            [-1, 45.1],
            [-1.1, 45],
          ],
        ],
      },
    });

    expect(parcel.geometry.coordinates[0]).toHaveLength(3);
  });

  it("builds an industry point only from public fields", () => {
    const industry = mapIndustryProximityRow({
      distance_km: 27.5,
      industrial_sites: {
        id: industryId,
        siret: "10000000100011",
        company_name: "Scierie des Pins",
        category: "SAWMILL",
        commune: "Salaunes",
        longitude: -0.83,
        latitude: 44.94,
      },
    });

    expect(industry.geometry.coordinates).toEqual([-0.83, 44.94]);
    expect(industry.properties).toEqual({
      id: industryId,
      siret: "10000000100011",
      companyName: "Scierie des Pins",
      category: "SAWMILL",
      commune: "Salaunes",
      distanceKm: 27.5,
    });
  });

  it("rejects an invalid geometry from PostGIS", () => {
    expect(() =>
      mapParcelRow({
        id: parcelId,
        incident_id: incidentId,
        insee_code: "33448",
        commune_name: "Saumos",
        section: "AB",
        parcel_number: "0042",
        parcel_uid: "33448000AB0042",
        parcel_area_ha: 7.6,
        affected_area_ha: 6.9,
        affected_ratio: 0.91,
        forest_area_ha: 6.5,
        dominant_species: null,
        estimated_volume_min_m3: null,
        estimated_volume_max_m3: null,
        confidence: "low",
        geometry: { type: "Point", coordinates: [-1, 45] },
      }),
    ).toThrow();
  });
});
