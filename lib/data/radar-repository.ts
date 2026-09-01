import "server-only";

import { FixtureRadarRepository } from "@/lib/data/fixture-radar-repository";
import type {
  IndustryListOptions,
  ParcelListOptions,
  RadarRepository,
} from "@/lib/data/radar-repository-types";
import { SupabaseRadarRepository } from "@/lib/data/supabase-radar-repository";
import { resolveDataSourceConfig } from "@/lib/db/data-source-config";
import { createServerSupabaseClient } from "@/lib/db/supabase-server";
import type { RadarFixture } from "@/lib/domain/types";

let repository: RadarRepository | undefined;

function getRepository() {
  if (repository) {
    return repository;
  }

  const config = resolveDataSourceConfig(process.env);
  repository =
    config.kind === "supabase"
      ? new SupabaseRadarRepository(createServerSupabaseClient(config))
      : new FixtureRadarRepository();
  return repository;
}

export async function listIncidents() {
  return getRepository().listIncidents();
}

export async function getIncidentBySlug(slug: string) {
  return getRepository().getIncidentBySlug(slug);
}

export async function listParcelsByIncident(
  slug: string,
  options: ParcelListOptions = {},
) {
  return getRepository().listParcelsByIncident(slug, options);
}

export async function getParcelById(id: string) {
  return getRepository().getParcelById(id);
}

export async function listIndustriesByIncident(
  slug: string,
  options: IndustryListOptions = {},
) {
  return getRepository().listIndustriesByIncident(slug, options);
}

export async function getRadarDataBySlug(
  slug: string,
): Promise<RadarFixture | null> {
  return getRepository().getRadarDataBySlug(slug);
}
