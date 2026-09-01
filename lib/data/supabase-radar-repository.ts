import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type IndustryListOptions,
  type ParcelListOptions,
  paginationFor,
  type RadarRepository,
} from "@/lib/data/radar-repository-types";
import {
  mapForestRow,
  mapIncidentRow,
  mapIncidentSummaryRow,
  mapIndustryProximityRow,
  mapParcelRow,
} from "@/lib/data/supabase-mappers";
import type { RadarFixture } from "@/lib/domain/types";

const INCIDENT_WEB_COLUMNS =
  "id,slug,name,external_id,start_date,source_name,source_url,source_date,area_ha,status,geometry_web";
const FOREST_WEB_COLUMNS =
  "id,incident_id,forest_type_label,dominant_species,area_ha,geometry_web";
const PARCEL_WEB_COLUMNS =
  "id,incident_id,insee_code,commune_name,section,parcel_number,parcel_uid,parcel_area_ha,affected_area_ha,affected_ratio,forest_area_ha,dominant_species,estimated_volume_min_m3,estimated_volume_max_m3,confidence,geometry_web";
const FULL_GEOMETRY_COLUMNS = "id,geometry";

type GeometryRow = Record<string, unknown> & {
  id: string;
  geometry_web?: unknown;
  geometry?: unknown;
};

function throwOnError(error: { message: string } | null, operation: string) {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

export class SupabaseRadarRepository implements RadarRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listIncidents() {
    const { data, error } = await this.client
      .from("incident_summaries")
      .select("*")
      .order("start_date", { ascending: false });
    throwOnError(error, "Unable to list incidents");
    return (data ?? []).map(mapIncidentSummaryRow);
  }

  async getIncidentBySlug(slug: string) {
    const { data: incidentRow, error: incidentError } = await this.client
      .from("incidents")
      .select(INCIDENT_WEB_COLUMNS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    throwOnError(incidentError, "Unable to read incident");
    if (!incidentRow) {
      return null;
    }
    const [incidentWithGeometry] = await this.withGeometryFallback(
      "incidents",
      [incidentRow],
    );

    const [summaryResult, forestResult] = await Promise.all([
      this.client
        .from("incident_summaries")
        .select("*")
        .eq("id", incidentWithGeometry.id)
        .single(),
      this.client
        .from("affected_forests")
        .select(FOREST_WEB_COLUMNS)
        .eq("incident_id", incidentWithGeometry.id)
        .limit(1000),
    ]);
    throwOnError(summaryResult.error, "Unable to read incident summary");
    throwOnError(forestResult.error, "Unable to read affected forests");
    const forests = await this.withGeometryFallback(
      "affected_forests",
      forestResult.data ?? [],
    );

    return {
      summary: mapIncidentSummaryRow(summaryResult.data),
      feature: mapIncidentRow(incidentWithGeometry),
      forests: {
        type: "FeatureCollection" as const,
        features: forests.map(mapForestRow),
      },
    };
  }

  async getRadarDataBySlug(slug: string): Promise<RadarFixture | null> {
    const { data: incidentRow, error: incidentError } = await this.client
      .from("incidents")
      .select(INCIDENT_WEB_COLUMNS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    throwOnError(incidentError, "Unable to read incident");
    if (!incidentRow) {
      return null;
    }
    const [incidentWithGeometry] = await this.withGeometryFallback(
      "incidents",
      [incidentRow],
    );

    const [forestResult, parcelResult, industryResult] = await Promise.all([
      this.client
        .from("affected_forests")
        .select(FOREST_WEB_COLUMNS)
        .eq("incident_id", incidentWithGeometry.id)
        .limit(1000),
      this.client
        .from("affected_parcels")
        .select(PARCEL_WEB_COLUMNS)
        .eq("incident_id", incidentWithGeometry.id)
        .order("affected_area_ha", { ascending: false })
        .range(0, 499),
      this.client
        .from("incident_industrial_sites")
        .select(
          "distance_km,industrial_sites!inner(id,company_name,category,commune,longitude,latitude)",
        )
        .eq("incident_id", incidentWithGeometry.id)
        .lte("distance_km", 200)
        .order("distance_km", { ascending: true })
        .range(0, 499),
    ]);
    throwOnError(forestResult.error, "Unable to read affected forests");
    throwOnError(parcelResult.error, "Unable to list affected parcels");
    throwOnError(industryResult.error, "Unable to list nearby industries");

    const [forests, parcels] = await Promise.all([
      this.withGeometryFallback("affected_forests", forestResult.data ?? []),
      this.withGeometryFallback("affected_parcels", parcelResult.data ?? []),
    ]);

    return {
      incident: mapIncidentRow(incidentWithGeometry),
      forests: {
        type: "FeatureCollection",
        features: forests.map(mapForestRow),
      },
      parcels: {
        type: "FeatureCollection",
        features: parcels.map(mapParcelRow),
      },
      industries: {
        type: "FeatureCollection",
        features: (industryResult.data ?? []).map(mapIndustryProximityRow),
      },
    };
  }

  async listParcelsByIncident(slug: string, options: ParcelListOptions = {}) {
    const incidentId = await this.getPublishedIncidentId(slug);
    if (!incidentId) {
      return null;
    }

    const { page = 1, pageSize = 500, ...filters } = options;
    const start = (page - 1) * pageSize;
    let query = this.client
      .from("affected_parcels")
      .select(PARCEL_WEB_COLUMNS, { count: "exact" })
      .eq("incident_id", incidentId)
      .order("affected_area_ha", { ascending: false })
      .range(start, start + pageSize - 1);

    if (filters.species) {
      query = query.eq("dominant_species", filters.species);
    }
    if (filters.minAffectedAreaHa !== undefined) {
      query = query.gte("affected_area_ha", filters.minAffectedAreaHa);
    }
    if (filters.confidence?.length) {
      query = query.in("confidence", filters.confidence);
    }

    const { data, error, count } = await query;
    throwOnError(error, "Unable to list affected parcels");
    const parcels = await this.withGeometryFallback(
      "affected_parcels",
      data ?? [],
    );
    return {
      data: parcels.map(mapParcelRow),
      pagination: paginationFor(page, pageSize, count ?? 0),
    };
  }

  async getParcelById(id: string) {
    const { data, error } = await this.client
      .from("affected_parcels")
      .select(PARCEL_WEB_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    throwOnError(error, "Unable to read affected parcel");
    if (!data) {
      return null;
    }
    const [parcel] = await this.withGeometryFallback("affected_parcels", [
      data,
    ]);

    const { data: incident, error: incidentError } = await this.client
      .from("incidents")
      .select("id")
      .eq("id", parcel.incident_id)
      .eq("status", "published")
      .maybeSingle();
    throwOnError(incidentError, "Unable to verify parcel incident");
    return incident ? mapParcelRow(parcel) : null;
  }

  async listIndustriesByIncident(
    slug: string,
    options: IndustryListOptions = {},
  ) {
    const incidentId = await this.getPublishedIncidentId(slug);
    if (!incidentId) {
      return null;
    }

    const { maxDistanceKm = 200, category, page = 1, pageSize = 500 } = options;
    const start = (page - 1) * pageSize;
    let query = this.client
      .from("incident_industrial_sites")
      .select(
        "distance_km,industrial_sites!inner(id,company_name,category,commune,longitude,latitude)",
        { count: "exact" },
      )
      .eq("incident_id", incidentId)
      .lte("distance_km", maxDistanceKm)
      .order("distance_km", { ascending: true })
      .range(start, start + pageSize - 1);
    if (category) {
      query = query.eq("industrial_sites.category", category);
    }
    const { data, error, count } = await query;
    throwOnError(error, "Unable to list nearby industries");
    return {
      data: (data ?? []).map(mapIndustryProximityRow),
      pagination: paginationFor(page, pageSize, count ?? 0),
    };
  }

  private async getPublishedIncidentId(slug: string) {
    const { data, error } = await this.client
      .from("incidents")
      .select("id")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    throwOnError(error, "Unable to resolve incident");
    return data?.id ?? null;
  }

  private async withGeometryFallback(
    table: "incidents" | "affected_forests" | "affected_parcels",
    rows: GeometryRow[],
  ): Promise<GeometryRow[]> {
    const missingIds = rows
      .filter((row) => !row.geometry_web)
      .map((row) => row.id);
    if (!missingIds.length) {
      return rows;
    }

    const { data, error } = await this.client
      .from(table)
      .select(FULL_GEOMETRY_COLUMNS)
      .in("id", missingIds);
    throwOnError(error, `Unable to read ${table} fallback geometry`);
    const geometries = new Map(
      (data ?? []).map((row: GeometryRow) => [row.id, row.geometry]),
    );

    return rows.map((row) => ({
      ...row,
      geometry: geometries.get(row.id),
    }));
  }
}
