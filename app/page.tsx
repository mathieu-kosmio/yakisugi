import Link from "next/link";
import { listIncidents } from "@/lib/data/radar-repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [incident] = await listIncidents();

  return (
    <>
      <section className="site-shell hero">
        <div>
          <p className="eyebrow">Intelligence territoriale forestière</p>
          <h1>Où se trouve le bois sinistré&nbsp;?</h1>
          <p className="hero-copy">
            Repérez les peuplements potentiellement affectés, mesurez les
            surfaces concernées et identifiez les capacités industrielles
            situées à proximité.
          </p>
          <div className="hero-actions">
            <Link
              className="button-primary"
              href={`/carte?incident=${incident.slug}`}
            >
              Explorer la carte
            </Link>
            <Link
              className="button-secondary"
              href={`/evenements/${incident.slug}`}
            >
              Voir la fiche événement
            </Link>
            <Link className="button-secondary" href="/methodologie">
              Comprendre les données
            </Link>
          </div>
        </div>
        <div
          className="hero-visual"
          role="img"
          aria-label="Aperçu cartographique stylisé"
        >
          <div className="topography-card" />
          <span className="map-label map-label-one">Forêts affectées</span>
          <span className="map-label map-label-two">Industries proches</span>
        </div>
      </section>

      <section
        className="site-shell stats-strip"
        aria-label="Indicateurs de l'événement"
      >
        <div className="stat">
          <strong className="stat-value">
            {incident.forestAreaHa.toLocaleString("fr-FR")} ha
          </strong>
          <span className="stat-label">forêt potentiellement affectée</span>
        </div>
        <div className="stat">
          <strong className="stat-value">
            {incident.mainSpecies ?? "Inconnu"}
          </strong>
          <span className="stat-label">essence principale disponible</span>
        </div>
        <div className="stat">
          <strong className="stat-value">{incident.parcelCount}</strong>
          <span className="stat-label">parcelles concernées</span>
        </div>
        <div className="stat">
          <strong className="stat-value">
            {incident.industryCountWithin100Km}
          </strong>
          <span className="stat-label">
            sites industriels à moins de 100 km
          </span>
        </div>
      </section>

      <section className="site-shell content-section">
        <div className="section-heading">
          <p className="eyebrow">De la donnée à la décision</p>
          <h2>Une lecture opérationnelle, avec ses limites visibles.</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <strong>Localiser</strong>
            <p>
              Croiser les périmètres de sinistre avec les forêts et les
              parcelles préparées hors ligne.
            </p>
          </article>
          <article className="feature-card">
            <strong>Caractériser</strong>
            <p>
              Présenter surfaces, essences dominantes et niveaux de confiance
              sans fausse précision.
            </p>
          </article>
          <article className="feature-card">
            <strong>Rapprocher</strong>
            <p>
              Repérer les établissements actifs par métier et par bande de
              distance géodésique.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
