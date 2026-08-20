import { radarFixture } from "@/fixtures/radar";
import type { ParcelFilters } from "@/lib/domain/radar";
import { filterParcels, summarizeIncident } from "@/lib/domain/radar";

export async function listIncidents() {
  return [summarizeIncident(radarFixture)];
}

export async function getIncidentBySlug(slug: string) {
  if (radarFixture.incident.properties.slug !== slug) {
    return null;
  }

  return {
    summary: summarizeIncident(radarFixture),
    feature: radarFixture.incident,
    forests: radarFixture.forests,
  };
}

export async function listParcelsByIncident(
  slug: string,
  filters: ParcelFilters = {},
) {
  if (radarFixture.incident.properties.slug !== slug) {
    return null;
  }

  return filterParcels(radarFixture.parcels.features, filters);
}

export async function getParcelById(id: string) {
  return (
    radarFixture.parcels.features.find(
      (parcel) => parcel.properties.id === id,
    ) ?? null
  );
}

export async function listIndustriesByIncident(
  slug: string,
  maxDistanceKm = 200,
) {
  if (radarFixture.incident.properties.slug !== slug) {
    return null;
  }

  return radarFixture.industries.features.filter(
    (industry) => industry.properties.distanceKm <= maxDistanceKm,
  );
}
