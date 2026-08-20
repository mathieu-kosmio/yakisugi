import type {
  IncidentSummary,
  ParcelFeature,
  RadarFixture,
} from "@/lib/domain/types";

export type ParcelFilters = {
  species?: string;
  minAffectedAreaHa?: number;
  confidence?: Array<ParcelFeature["properties"]["confidence"]>;
};

export function estimateVolume(
  forestAreaHa: number,
  coefficient: { minM3PerHa: number; maxM3PerHa: number } | null,
): { minM3: number; maxM3: number } | null {
  if (!coefficient) {
    return null;
  }

  if (
    forestAreaHa < 0 ||
    coefficient.minM3PerHa < 0 ||
    coefficient.maxM3PerHa < coefficient.minM3PerHa
  ) {
    throw new Error("Invalid volume estimation inputs");
  }

  return {
    minM3: Math.round(forestAreaHa * coefficient.minM3PerHa),
    maxM3: Math.round(forestAreaHa * coefficient.maxM3PerHa),
  };
}

export function filterParcels(
  parcels: ParcelFeature[],
  filters: ParcelFilters,
): ParcelFeature[] {
  return parcels.filter((parcel) => {
    const matchesSpecies =
      !filters.species || parcel.properties.dominantSpecies === filters.species;
    const matchesArea =
      filters.minAffectedAreaHa === undefined ||
      parcel.properties.affectedAreaHa >= filters.minAffectedAreaHa;
    const matchesConfidence =
      !filters.confidence?.length ||
      filters.confidence.includes(parcel.properties.confidence);

    return matchesSpecies && matchesArea && matchesConfidence;
  });
}

export function summarizeIncident(fixture: RadarFixture): IncidentSummary {
  const speciesAreas = new Map<string, number>();
  let forestAreaHa = 0;

  for (const forest of fixture.forests.features) {
    forestAreaHa += forest.properties.areaHa;
    if (forest.properties.dominantSpecies) {
      speciesAreas.set(
        forest.properties.dominantSpecies,
        (speciesAreas.get(forest.properties.dominantSpecies) ?? 0) +
          forest.properties.areaHa,
      );
    }
  }

  const mainSpecies =
    [...speciesAreas.entries()].sort(
      ([, areaA], [, areaB]) => areaB - areaA,
    )[0]?.[0] ?? null;

  return {
    id: fixture.incident.properties.id,
    slug: fixture.incident.properties.slug,
    name: fixture.incident.properties.name,
    areaHa: fixture.incident.properties.areaHa,
    forestAreaHa: Math.round(forestAreaHa * 10) / 10,
    parcelCount: fixture.parcels.features.length,
    mainSpecies,
    industryCountWithin100Km: fixture.industries.features.filter(
      (industry) => industry.properties.distanceKm <= 100,
    ).length,
    estimatedVolumeMinM3: null,
    estimatedVolumeMaxM3: null,
  };
}
