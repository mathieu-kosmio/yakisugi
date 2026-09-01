import type { ParcelFilters } from "@/lib/domain/radar";
import type {
  ForestFeature,
  IncidentFeature,
  IncidentSummary,
  IndustryFeature,
  ParcelFeature,
  RadarFixture,
} from "@/lib/domain/types";

export type IncidentDetail = {
  summary: IncidentSummary;
  feature: IncidentFeature;
  forests: {
    type: "FeatureCollection";
    features: ForestFeature[];
  };
};

export type PaginationInput = {
  page?: number;
  pageSize?: number;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type PaginatedResult<T> = {
  data: T[];
  pagination: Pagination;
};

export type ParcelListOptions = ParcelFilters & PaginationInput;

export type IndustryListOptions = PaginationInput & {
  maxDistanceKm?: number;
  category?: IndustryFeature["properties"]["category"];
};

export function paginationFor(
  page: number,
  pageSize: number,
  total: number,
): Pagination {
  return {
    page,
    pageSize,
    total,
    pageCount: Math.ceil(total / pageSize),
  };
}

export interface RadarRepository {
  listIncidents(): Promise<IncidentSummary[]>;
  getRadarDataBySlug(slug: string): Promise<RadarFixture | null>;
  getIncidentBySlug(slug: string): Promise<IncidentDetail | null>;
  listParcelsByIncident(
    slug: string,
    options?: ParcelListOptions,
  ): Promise<PaginatedResult<ParcelFeature> | null>;
  getParcelById(id: string): Promise<ParcelFeature | null>;
  listIndustriesByIncident(
    slug: string,
    options?: IndustryListOptions,
  ): Promise<PaginatedResult<IndustryFeature> | null>;
}
