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

const INCIDENT_COLUMNS =
  "id,slug,name,external_id,start_date,source_name,source_url,source_date,area_ha,status,geometry,geometry_web";
const FOREST_COLUMNS =
  "id,incident_id,forest_type_label,dominant_species,area_ha,geometry,geometry_web";
const PARCEL_COLUMNS =
  "id,incident_id,insee_code,commune_name,section,parcel_number,parcel_uid,parcel_area_ha,affected_area_ha,affected_ratio,forest_area_ha,dominant_species,estimated_volume_min_m3,estimated_volume_max_m3,confidence,geometry,geometry_web";

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
      .select(INCIDENT_COLUMNS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    throwOnError(incidentError, "Unable to read incident");
    if (!incidentRow) {
      return null;
    }

    const [summaryResult, forestResult] = await Promise.all([
      this.client
        .from("incident_summaries")
        .select("*")
        .eq("id", incidentRow.id)
        .single(),
      this.client
        .from("affected_forests")
        .select(FOREST_COLUMNS)
        .eq("incident_id", incidentRow.id)
        .limit(1000),
    ]);
    throwOnError(summaryResult.error, "Unable to read incident summary");
    throwOnError(forestResult.error, "Unable to read affected forests");

    return {
      summary: mapIncidentSummaryRow(summaryResult.data),
      feature: mapIncidentRow(incidentRow),
      forests: {
        type: "FeatureCollection" as const,
        features: (forestResult.data ?? []).map(mapForestRow),
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
      .select(PARCEL_COLUMNS, { count: "exact" })
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
    return {
      data: (data ?? []).map(mapParcelRow),
      pagination: paginationFor(page, pageSize, count ?? 0),
    };
  }

  async getParcelById(id: string) {
    const { data, error } = await this.client
      .from("affected_parcels")
      .select(PARCEL_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    throwOnError(error, "Unable to read affected parcel");
    if (!data) {
      return null;
    }

    const { data: incident, error: incidentError } = await this.client
      .from("incidents")
      .select("id")
      .eq("id", data.incident_id)
      .eq("status", "published")
      .maybeSingle();
    throwOnError(incidentError, "Unable to verify parcel incident");
    return incident ? mapParcelRow(data) : null;
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
}
