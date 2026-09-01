import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseRadarRepository } from "@/lib/data/supabase-radar-repository";

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

class FakeQuery {
  readonly operations: Array<[string, ...unknown[]]> = [];
  private readonly queryProxy: this;

  constructor(
    readonly table: string,
    private readonly response: QueryResponse,
  ) {
    this.queryProxy = new Proxy(this, {
      get: (target, property, receiver) => {
        if (property === "then") {
          const promise = Promise.resolve(target.response);
          return promise.then.bind(promise);
        }
        return Reflect.get(target, property, receiver);
      },
    });
  }

  private record(name: string, ...parameters: unknown[]) {
    this.operations.push([name, ...parameters]);
    return this.queryProxy;
  }

  select(...parameters: unknown[]) {
    return this.record("select", ...parameters);
  }

  order(...parameters: unknown[]) {
    return this.record("order", ...parameters);
  }

  eq(...parameters: unknown[]) {
    return this.record("eq", ...parameters);
  }

  gte(...parameters: unknown[]) {
    return this.record("gte", ...parameters);
  }

  lte(...parameters: unknown[]) {
    return this.record("lte", ...parameters);
  }

  in(...parameters: unknown[]) {
    return this.record("in", ...parameters);
  }

  range(...parameters: unknown[]) {
    return this.record("range", ...parameters);
  }

  limit(...parameters: unknown[]) {
    return this.record("limit", ...parameters);
  }

  single() {
    return this.record("single");
  }

  maybeSingle() {
    return this.record("maybeSingle");
  }

  asSupabaseQuery() {
    return this.queryProxy;
  }
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];

  constructor(private readonly responses: Record<string, QueryResponse[]>) {}

  from(table: string) {
    const response = this.responses[table]?.shift();
    if (!response) {
      throw new Error(`Réponse Supabase simulée absente pour ${table}`);
    }
    const query = new FakeQuery(table, response);
    this.queries.push(query);
    return query.asSupabaseQuery();
  }
}

const incidentId = "11111111-1111-4111-8111-111111111111";
const forestId = "22222222-2222-4222-8222-222222222222";
const parcelId = "33333333-3333-4333-8333-333333333333";
const industryId = "44444444-4444-4444-8444-444444444444";
const polygon = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-1.1, 44.9],
      [-1, 44.9],
      [-1, 45],
      [-1.1, 44.9],
    ],
  ],
};

const summaryRow = {
  id: incidentId,
  slug: "saumos-2026",
  name: "Saumos 2026",
  area_ha: 1126.3,
  forest_area_ha: 944,
  parcel_count: 10,
  main_species: "Pin maritime",
  industry_count_within_100_km: 8,
  estimated_volume_min_m3: null,
  estimated_volume_max_m3: null,
};

const incidentRow = {
  id: incidentId,
  slug: "saumos-2026",
  name: "Saumos 2026",
  external_id: "EMSR899",
  start_date: "2026-07-22",
  source_name: "Copernicus EMS",
  source_url: "https://example.test/incident",
  source_date: "2026-07-22",
  area_ha: 1126.3,
  status: "published" as const,
  geometry: polygon,
  geometry_web: null,
};

const forestRow = {
  id: forestId,
  incident_id: incidentId,
  forest_type_label: "Futaie de conifères",
  dominant_species: "Pin maritime",
  area_ha: 944,
  geometry: polygon,
  geometry_web: null,
};

const parcelRow = {
  id: parcelId,
  incident_id: incidentId,
  insee_code: "33448",
  commune_name: "Saumos",
  section: "AB",
  parcel_number: "0042",
  parcel_uid: "33448000AB0042",
  parcel_area_ha: 12,
  affected_area_ha: 11,
  affected_ratio: 0.92,
  forest_area_ha: 10,
  dominant_species: "Pin maritime",
  estimated_volume_min_m3: null,
  estimated_volume_max_m3: null,
  confidence: "high" as const,
  geometry: polygon,
  geometry_web: null,
};

const industryRow = {
  distance_km: 27.5,
  industrial_sites: {
    id: industryId,
    company_name: "Scierie des Pins",
    category: "SAWMILL" as const,
    commune: "Salaunes",
    longitude: -0.83,
    latitude: 44.94,
  },
};

function repositoryFor(responses: Record<string, QueryResponse[]>) {
  const client = new FakeSupabaseClient(responses);
  return {
    client,
    repository: new SupabaseRadarRepository(
      client as unknown as SupabaseClient,
    ),
  };
}

describe("SupabaseRadarRepository", () => {
  it("loads the map dataset with web geometries and one parallel read phase", async () => {
    const { client, repository } = repositoryFor({
      incidents: [
        { data: { ...incidentRow, geometry_web: polygon }, error: null },
      ],
      affected_forests: [
        { data: [{ ...forestRow, geometry_web: polygon }], error: null },
      ],
      affected_parcels: [
        {
          data: [{ ...parcelRow, geometry_web: polygon }],
          error: null,
          count: 1,
        },
      ],
      incident_industrial_sites: [
        { data: [industryRow], error: null, count: 1 },
      ],
    });

    const result = await repository.getRadarDataBySlug("saumos-2026");

    expect(result?.incident.properties.externalId).toBe("EMSR899");
    expect(result?.forests.features).toHaveLength(1);
    expect(result?.parcels.features).toHaveLength(1);
    expect(result?.industries.features).toHaveLength(1);
    expect(client.queries).toHaveLength(4);

    for (const query of client.queries.filter((candidate) =>
      ["incidents", "affected_forests", "affected_parcels"].includes(
        candidate.table,
      ),
    )) {
      const select = query.operations.find(
        ([operation]) => operation === "select",
      )?.[1];
      expect(select).toContain("geometry_web");
      expect(select).not.toMatch(/(^|,)geometry(,|$)/);
    }

    for (const query of client.queries.filter((candidate) =>
      [
        "affected_forests",
        "affected_parcels",
        "incident_industrial_sites",
      ].includes(candidate.table),
    )) {
      expect(query.operations).toContainEqual([
        "eq",
        "incident_id",
        incidentId,
      ]);
    }
  });

  it("lists incident summaries and surfaces Supabase errors", async () => {
    const success = repositoryFor({
      incident_summaries: [{ data: [summaryRow], error: null }],
    });
    await expect(success.repository.listIncidents()).resolves.toMatchObject([
      { slug: "saumos-2026", estimatedVolumeMinM3: null },
    ]);
    expect(success.client.queries[0].operations).toContainEqual([
      "order",
      "start_date",
      { ascending: false },
    ]);

    const failure = repositoryFor({
      incident_summaries: [
        { data: null, error: { message: "database unavailable" } },
      ],
    });
    await expect(failure.repository.listIncidents()).rejects.toThrow(
      "Unable to list incidents: database unavailable",
    );
  });

  it("loads a published incident with its summary and forests", async () => {
    const { repository } = repositoryFor({
      incidents: [
        { data: incidentRow, error: null },
        { data: [{ id: incidentId, geometry: polygon }], error: null },
      ],
      incident_summaries: [{ data: summaryRow, error: null }],
      affected_forests: [
        { data: [forestRow], error: null },
        { data: [{ id: forestId, geometry: polygon }], error: null },
      ],
    });

    const detail = await repository.getIncidentBySlug("saumos-2026");
    expect(detail?.feature.properties.externalId).toBe("EMSR899");
    expect(detail?.forests.features[0].properties.dominantSpecies).toBe(
      "Pin maritime",
    );
  });

  it("returns null when a published incident cannot be found", async () => {
    const { repository } = repositoryFor({
      incidents: [{ data: null, error: null }],
    });
    await expect(repository.getIncidentBySlug("inconnu")).resolves.toBeNull();
  });

  it("paginates and filters affected parcels", async () => {
    const { client, repository } = repositoryFor({
      incidents: [{ data: { id: incidentId }, error: null }],
      affected_parcels: [
        { data: [parcelRow], error: null, count: 3 },
        { data: [{ id: parcelId, geometry: polygon }], error: null },
      ],
    });

    const result = await repository.listParcelsByIncident("saumos-2026", {
      page: 2,
      pageSize: 1,
      species: "Pin maritime",
      minAffectedAreaHa: 10,
      confidence: ["high"],
    });
    expect(result?.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 3,
      pageCount: 3,
    });
    const parcelQuery = client.queries[1];
    expect(parcelQuery.operations).toContainEqual(["range", 1, 1]);
    expect(parcelQuery.operations).toContainEqual([
      "eq",
      "dominant_species",
      "Pin maritime",
    ]);
    expect(parcelQuery.operations).toContainEqual([
      "gte",
      "affected_area_ha",
      10,
    ]);
    expect(parcelQuery.operations).toContainEqual([
      "in",
      "confidence",
      ["high"],
    ]);
  });

  it("hides parcels belonging to an unpublished incident", async () => {
    const hidden = repositoryFor({
      affected_parcels: [
        { data: parcelRow, error: null },
        { data: [{ id: parcelId, geometry: polygon }], error: null },
      ],
      incidents: [{ data: null, error: null }],
    });
    await expect(hidden.repository.getParcelById(parcelId)).resolves.toBeNull();

    const missing = repositoryFor({
      affected_parcels: [{ data: null, error: null }],
    });
    await expect(
      missing.repository.getParcelById(parcelId),
    ).resolves.toBeNull();
  });

  it("paginates and filters nearby industries", async () => {
    const { client, repository } = repositoryFor({
      incidents: [{ data: { id: incidentId }, error: null }],
      incident_industrial_sites: [
        { data: [industryRow], error: null, count: 4 },
      ],
    });

    const result = await repository.listIndustriesByIncident("saumos-2026", {
      page: 2,
      pageSize: 2,
      maxDistanceKm: 50,
      category: "SAWMILL",
    });
    expect(result?.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 4,
      pageCount: 2,
    });
    expect(result?.data[0].properties.distanceKm).toBe(27.5);
    const industryQuery = client.queries[1];
    expect(industryQuery.operations).toContainEqual(["lte", "distance_km", 50]);
    expect(industryQuery.operations).toContainEqual([
      "eq",
      "industrial_sites.category",
      "SAWMILL",
    ]);
  });

  it("returns null collections when the incident is unavailable", async () => {
    const parcels = repositoryFor({
      incidents: [{ data: null, error: null }],
    }).repository;
    await expect(parcels.listParcelsByIncident("inconnu")).resolves.toBeNull();

    const industries = repositoryFor({
      incidents: [{ data: null, error: null }],
    }).repository;
    await expect(
      industries.listIndustriesByIncident("inconnu"),
    ).resolves.toBeNull();
  });
});
