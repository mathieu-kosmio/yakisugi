import { radarFixture } from "@/fixtures/radar";
import {
  type IndustryListOptions,
  type ParcelListOptions,
  paginationFor,
  type RadarRepository,
} from "@/lib/data/radar-repository-types";
import { filterParcels, summarizeIncident } from "@/lib/domain/radar";

export class FixtureRadarRepository implements RadarRepository {
  async listIncidents() {
    return [summarizeIncident(radarFixture)];
  }

  async getIncidentBySlug(slug: string) {
    if (radarFixture.incident.properties.slug !== slug) {
      return null;
    }

    return {
      summary: summarizeIncident(radarFixture),
      feature: radarFixture.incident,
      forests: radarFixture.forests,
    };
  }

  async getRadarDataBySlug(slug: string) {
    return radarFixture.incident.properties.slug === slug ? radarFixture : null;
  }

  async listParcelsByIncident(slug: string, options: ParcelListOptions = {}) {
    if (radarFixture.incident.properties.slug !== slug) {
      return null;
    }

    const { page = 1, pageSize = 500, ...filters } = options;
    const parcels = filterParcels(radarFixture.parcels.features, filters);
    const start = (page - 1) * pageSize;
    return {
      data: parcels.slice(start, start + pageSize),
      pagination: paginationFor(page, pageSize, parcels.length),
    };
  }

  async getParcelById(id: string) {
    return (
      radarFixture.parcels.features.find(
        (parcel) => parcel.properties.id === id,
      ) ?? null
    );
  }

  async listIndustriesByIncident(
    slug: string,
    options: IndustryListOptions = {},
  ) {
    if (radarFixture.incident.properties.slug !== slug) {
      return null;
    }

    const { maxDistanceKm = 200, category, page = 1, pageSize = 500 } = options;
    const industries = radarFixture.industries.features.filter(
      (industry) =>
        industry.properties.distanceKm <= maxDistanceKm &&
        (!category || industry.properties.category === category),
    );
    const start = (page - 1) * pageSize;
    return {
      data: industries.slice(start, start + pageSize),
      pagination: paginationFor(page, pageSize, industries.length),
    };
  }
}
