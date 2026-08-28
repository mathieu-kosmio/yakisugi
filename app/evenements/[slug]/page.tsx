import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TrackedLink } from "@/components/analytics/analytics-event";
import {
  getIncidentBySlug,
  listIndustriesByIncident,
  listParcelsByIncident,
} from "@/lib/data/radar-repository";
import { resolveSalesMode } from "@/lib/sales/config";

type EventPageProps = {
  params: Promise<{ slug: string }>;
};

const getEvent = cache(getIncidentBySlug);

function hectares(value: number) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ha`;
}

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const incident = await getEvent(slug);
  if (!incident) {
    return { title: "Événement introuvable" };
  }

  const description = `${hectares(incident.summary.forestAreaHa)} de forêt potentiellement affectée, ${incident.summary.parcelCount} parcelles identifiées.`;
  const incidentTitle = /^inc(?:endie|ident)\b/i.test(incident.summary.name)
    ? incident.summary.name
    : `Incendie ${incident.summary.name}`;
  const title = `${incidentTitle} : carte des forêts et bois affectés`;
  return {
    title,
    description,
    alternates: { canonical: `/evenements/${slug}` },
    openGraph: {
      title,
      description,
      type: "article",
    },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const incident = await getEvent(slug);
  if (!incident) {
    notFound();
  }

  const [parcels, industries] = await Promise.all([
    listParcelsByIncident(slug, { page: 1, pageSize: 5 }),
    listIndustriesByIncident(slug, {
      maxDistanceKm: 100,
      page: 1,
      pageSize: 5,
    }),
  ]);
  if (!parcels || !industries) {
    notFound();
  }

  const properties = incident.feature.properties;
  const isLocalSource = properties.sourceUrl.startsWith("local://");
  const salesMode = resolveSalesMode(process.env);

  return (
    <article className="site-shell event-page">
      <header className="event-hero">
        <div>
          <p className="eyebrow">Événement forestier</p>
          <h1>{incident.summary.name}</h1>
          <p className="event-intro">
            Périmètre daté du{" "}
            {new Date(properties.startDate).toLocaleDateString("fr-FR")}. Les
            surfaces et proximités sont des calculs géographiques à confronter
            aux observations de terrain.
          </p>
          <div className="hero-actions">
            <Link
              className="button-primary"
              href={`/carte?incident=${incident.summary.slug}`}
            >
              Explorer sur la carte
            </Link>
            <Link className="button-secondary" href="/methodologie">
              Lire la méthodologie
            </Link>
            <TrackedLink
              className="button-secondary"
              event="export_cta_clicked"
              incidentSlug={incident.summary.slug}
              href={`/acheter/${incident.summary.slug}`}
            >
              {salesMode === "stripe"
                ? "Acheter les données"
                : "Demander les données"}
            </TrackedLink>
          </div>
        </div>
        <dl className="event-source-card">
          <div>
            <dt>Identifiant source</dt>
            <dd>{properties.externalId ?? "Non renseigné"}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {isLocalSource ? (
                properties.sourceName
              ) : (
                <a href={properties.sourceUrl}>{properties.sourceName}</a>
              )}
            </dd>
          </div>
          <div>
            <dt>Date de source</dt>
            <dd>{properties.sourceDate ?? "Non renseignée"}</dd>
          </div>
        </dl>
      </header>

      <section className="event-metrics" aria-label="Indicateurs clés">
        <div className="metric-card">
          <span>Périmètre du sinistre</span>
          <strong>{hectares(incident.summary.areaHa)}</strong>
        </div>
        <div className="metric-card">
          <span>Forêt potentiellement affectée</span>
          <strong>{hectares(incident.summary.forestAreaHa)}</strong>
        </div>
        <div className="metric-card">
          <span>Parcelles identifiées</span>
          <strong>{incident.summary.parcelCount}</strong>
        </div>
        <div className="metric-card">
          <span>Industries à moins de 100 km</span>
          <strong>{incident.summary.industryCountWithin100Km}</strong>
        </div>
      </section>

      <section className="event-columns">
        <div className="event-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Parcelles</p>
              <h2>Premières surfaces concernées</h2>
            </div>
            <span>{parcels.pagination.total} au total</span>
          </div>
          <div className="result-list">
            {parcels.data.map((parcel) => (
              <article className="result-row" key={parcel.properties.id}>
                <div>
                  <strong>
                    {parcel.properties.communeName}, section{" "}
                    {parcel.properties.section} {parcel.properties.parcelNumber}
                  </strong>
                  <span>
                    {parcel.properties.dominantSpecies ??
                      "Essence non identifiée"}{" "}
                    · confiance {parcel.properties.confidence}
                  </span>
                </div>
                <strong>{hectares(parcel.properties.affectedAreaHa)}</strong>
              </article>
            ))}
          </div>
        </div>

        <div className="event-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Débouchés</p>
              <h2>Sites industriels proches</h2>
            </div>
            <span>{industries.pagination.total} à moins de 100 km</span>
          </div>
          <div className="result-list">
            {industries.data.map((industry) => (
              <article className="result-row" key={industry.properties.id}>
                <div>
                  <strong>{industry.properties.companyName}</strong>
                  <span>
                    {industry.properties.category} ·{" "}
                    {industry.properties.commune}
                  </span>
                </div>
                <strong>
                  {industry.properties.distanceKm.toLocaleString("fr-FR")} km
                </strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <aside className="event-notice">
        <strong>Volume non estimé</strong>
        <p>
          Aucun coefficient forestier documenté et validé n'est configuré. Les
          champs de volume restent donc absents de cette fiche.
        </p>
      </aside>

      <section className="event-export-cta">
        <div>
          <p className="eyebrow">Données professionnelles</p>
          <h2>Exploiter la base complète</h2>
          <p>
            Toutes les parcelles, les géométries détaillées, les industriels et
            la méthodologie dans une archive vérifiée.
          </p>
        </div>
        <TrackedLink
          className="button-primary"
          event="export_cta_clicked"
          incidentSlug={incident.summary.slug}
          href={`/acheter/${incident.summary.slug}`}
        >
          {salesMode === "stripe"
            ? "Télécharger la base complète, 149 € HT"
            : "Demander la base complète, à partir de 149 € HT"}
        </TrackedLink>
      </section>
    </article>
  );
}
