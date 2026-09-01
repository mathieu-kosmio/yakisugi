import type { MultiPolygon, Point, Polygon } from "geojson";
import { z } from "zod";
import type {
  ForestFeature,
  IncidentFeature,
  IncidentSummary,
  IndustryFeature,
  ParcelFeature,
} from "@/lib/domain/types";

const polygonGeometrySchema = z.custom<Polygon | MultiPolygon>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "Polygon" || value.type === "MultiPolygon") &&
    "coordinates" in value &&
    Array.isArray(value.coordinates),
  "Expected a GeoJSON Polygon or MultiPolygon",
);

const geometrySelectionSchema = {
  geometry: polygonGeometrySchema.optional(),
  geometry_web: polygonGeometrySchema.nullable().optional(),
};

type GeometrySelection = {
  geometry?: Polygon | MultiPolygon;
  geometry_web?: Polygon | MultiPolygon | null;
};

function selectWebGeometry(row: GeometrySelection): Polygon | MultiPolygon {
  const geometry = row.geometry_web ?? row.geometry;
  if (!geometry) {
    throw new Error("A web or source geometry is required");
  }
  return geometry;
}

const incidentSummaryRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  area_ha: z.coerce.number(),
  forest_area_ha: z.coerce.number(),
  parcel_count: z.coerce.number().int(),
  main_species: z.string().nullable(),
  industry_count_within_100_km: z.coerce.number().int(),
  estimated_volume_min_m3: z.coerce.number().nullable(),
  estimated_volume_max_m3: z.coerce.number().nullable(),
});

const incidentRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  external_id: z.string().nullable(),
  start_date: z.string(),
  source_name: z.string(),
  source_url: z.string(),
  source_date: z.string().nullable(),
  area_ha: z.coerce.number(),
  status: z.literal("published"),
  ...geometrySelectionSchema,
});

const forestRowSchema = z.object({
  id: z.uuid(),
  incident_id: z.uuid(),
  forest_type_label: z.string(),
  dominant_species: z.string().nullable(),
  area_ha: z.coerce.number(),
  ...geometrySelectionSchema,
});

const parcelRowSchema = z.object({
  id: z.uuid(),
  incident_id: z.uuid(),
  insee_code: z.string(),
  commune_name: z.string(),
  section: z.string(),
  parcel_number: z.string(),
  parcel_uid: z.string(),
  parcel_area_ha: z.coerce.number(),
  affected_area_ha: z.coerce.number(),
  affected_ratio: z.coerce.number(),
  forest_area_ha: z.coerce.number(),
  dominant_species: z.string().nullable(),
  estimated_volume_min_m3: z.coerce.number().nullable(),
  estimated_volume_max_m3: z.coerce.number().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  ...geometrySelectionSchema,
});

const industryProximityRowSchema = z.object({
  distance_km: z.coerce.number(),
  industrial_sites: z.object({
    id: z.uuid(),
    company_name: z.string(),
    category: z.enum([
      "FORESTRY",
      "SAWMILL",
      "PANELS",
      "PACKAGING",
      "WOOD_TRADING",
      "WOOD_ENERGY",
      "OTHER",
    ]),
    commune: z.string(),
    longitude: z.coerce.number(),
    latitude: z.coerce.number(),
  }),
});

export function mapIncidentSummaryRow(input: unknown): IncidentSummary {
  const row = incidentSummaryRowSchema.parse(input);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    areaHa: row.area_ha,
    forestAreaHa: row.forest_area_ha,
    parcelCount: row.parcel_count,
    mainSpecies: row.main_species,
    industryCountWithin100Km: row.industry_count_within_100_km,
    estimatedVolumeMinM3: row.estimated_volume_min_m3,
    estimatedVolumeMaxM3: row.estimated_volume_max_m3,
  };
}

export function mapIncidentRow(input: unknown): IncidentFeature {
  const row = incidentRowSchema.parse(input);
  return {
    type: "Feature",
    id: row.id,
    geometry: selectWebGeometry(row),
    properties: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      externalId: row.external_id,
      startDate: row.start_date,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      sourceDate: row.source_date,
      areaHa: row.area_ha,
      status: row.status,
    },
  };
}

export function mapForestRow(input: unknown): ForestFeature {
  const row = forestRowSchema.parse(input);
  return {
    type: "Feature",
    id: row.id,
    geometry: selectWebGeometry(row),
    properties: {
      id: row.id,
      incidentId: row.incident_id,
      forestTypeLabel: row.forest_type_label,
      dominantSpecies: row.dominant_species,
      areaHa: row.area_ha,
    },
  };
}

export function mapParcelRow(input: unknown): ParcelFeature {
  const row = parcelRowSchema.parse(input);
  return {
    type: "Feature",
    id: row.id,
    geometry: selectWebGeometry(row),
    properties: {
      id: row.id,
      incidentId: row.incident_id,
      inseeCode: row.insee_code,
      communeName: row.commune_name,
      section: row.section,
      parcelNumber: row.parcel_number,
      parcelUid: row.parcel_uid,
      parcelAreaHa: row.parcel_area_ha,
      affectedAreaHa: row.affected_area_ha,
      affectedRatio: row.affected_ratio,
      forestAreaHa: row.forest_area_ha,
      dominantSpecies: row.dominant_species,
      estimatedVolumeMinM3: row.estimated_volume_min_m3,
      estimatedVolumeMaxM3: row.estimated_volume_max_m3,
      confidence: row.confidence,
    },
  };
}

export function mapIndustryProximityRow(input: unknown): IndustryFeature {
  const row = industryProximityRowSchema.parse(input);
  const site = row.industrial_sites;
  const geometry: Point = {
    type: "Point",
    coordinates: [site.longitude, site.latitude],
  };
  return {
    type: "Feature",
    id: site.id,
    geometry,
    properties: {
      id: site.id,
      companyName: site.company_name,
      category: site.category,
      commune: site.commune,
      distanceKm: row.distance_km,
    },
  };
}
