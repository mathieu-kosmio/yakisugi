import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

export type Confidence = "low" | "medium" | "high";

export type IndustryCategory =
  | "FORESTRY"
  | "SAWMILL"
  | "PANELS"
  | "PACKAGING"
  | "WOOD_TRADING"
  | "WOOD_ENERGY"
  | "OTHER";

export type IncidentProperties = {
  id: string;
  slug: string;
  name: string;
  externalId: string | null;
  startDate: string;
  sourceName: string;
  sourceUrl: string;
  sourceDate: string | null;
  areaHa: number;
  status: "draft" | "published";
};

export type ForestProperties = {
  id: string;
  incidentId: string;
  forestTypeLabel: string;
  dominantSpecies: string | null;
  areaHa: number;
};

export type ParcelProperties = {
  id: string;
  incidentId: string;
  inseeCode: string;
  communeName: string;
  section: string;
  parcelNumber: string;
  parcelUid: string;
  parcelAreaHa: number;
  affectedAreaHa: number;
  affectedRatio: number;
  forestAreaHa: number;
  dominantSpecies: string | null;
  estimatedVolumeMinM3: number | null;
  estimatedVolumeMaxM3: number | null;
  confidence: Confidence;
};

export type IndustryProperties = {
  id: string;
  siret: string;
  companyName: string;
  category: IndustryCategory;
  commune: string;
  distanceKm: number;
};

export type IncidentFeature = Feature<
  Polygon | MultiPolygon,
  IncidentProperties
>;
export type ForestFeature = Feature<Polygon | MultiPolygon, ForestProperties>;
export type ParcelFeature = Feature<Polygon | MultiPolygon, ParcelProperties>;
export type IndustryFeature = Feature<Point, IndustryProperties>;

export type RadarFixture = {
  incident: IncidentFeature;
  forests: FeatureCollection<Polygon | MultiPolygon, ForestProperties>;
  parcels: FeatureCollection<Polygon | MultiPolygon, ParcelProperties>;
  industries: FeatureCollection<Point, IndustryProperties>;
};

export type IncidentSummary = {
  id: string;
  slug: string;
  name: string;
  areaHa: number;
  forestAreaHa: number;
  parcelCount: number;
  mainSpecies: string | null;
  industryCountWithin100Km: number;
  estimatedVolumeMinM3: number | null;
  estimatedVolumeMaxM3: number | null;
};
