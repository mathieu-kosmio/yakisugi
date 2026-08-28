import type { Metadata } from "next";
import { RadarMap } from "@/components/map/radar-map";
import { getRadarDataBySlug, listIncidents } from "@/lib/data/radar-repository";

export const metadata: Metadata = {
  title: "Carte du bois sinistré",
  description:
    "Explorer les forêts, parcelles et industries sur la carte Yakisugi.",
};

type MapPageProps = {
  searchParams: Promise<{ incident?: string | string[] }>;
};

export default async function MapPage({ searchParams }: MapPageProps) {
  const [firstIncident] = await listIncidents();
  const requestedIncident = (await searchParams).incident;
  const slug =
    typeof requestedIncident === "string"
      ? requestedIncident
      : firstIncident?.slug;
  const radarData = slug ? await getRadarDataBySlug(slug) : null;

  if (!radarData) {
    return (
      <section className="site-shell content-section">
        <div className="section-heading">
          <p className="eyebrow">Données indisponibles</p>
          <h1>Aucun incident publié.</h1>
          <p>Importez puis publiez un incident pour alimenter la carte.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="radar-page">
      <RadarMap fixture={radarData} />
    </section>
  );
}
