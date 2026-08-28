import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedSubmitButton } from "@/components/analytics/analytics-event";
import { getIncidentBySlug } from "@/lib/data/radar-repository";
import { resolveSalesMode } from "@/lib/sales/config";

type PurchasePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ annule?: string; demande?: string }>;
};

export const metadata: Metadata = {
  title: "Acheter l'export professionnel",
  robots: { index: false, follow: false },
};

export default async function PurchasePage({
  params,
  searchParams,
}: PurchasePageProps) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) notFound();
  const { annule, demande } = await searchParams;
  const salesMode = resolveSalesMode(process.env);

  return (
    <main className="site-shell purchase-page">
      <p className="eyebrow">Export professionnel</p>
      <h1>Données complètes de {incident.summary.name}</h1>
      <p className="purchase-intro">
        Une archive prête à analyser, avec toutes les parcelles, les géométries
        complètes, les établissements industriels, les indicateurs et la
        méthodologie.
      </p>
      {annule ? (
        <p className="purchase-message">
          Le paiement a été annulé. Aucun débit n'a été effectué.
        </p>
      ) : null}
      {demande === "envoyee" ? (
        <output className="purchase-success">
          Votre demande a bien été enregistrée. Nous vous recontacterons pour
          préciser l'usage, le paiement et la livraison de l'export.
        </output>
      ) : null}
      <section className="purchase-card">
        <div>
          <span>Prix de lancement</span>
          <strong>149 € HT</strong>
          <small>
            {salesMode === "stripe"
              ? "Les taxes applicables sont calculées par Stripe."
              : "Un devis ou une facture vous sera transmis avant tout paiement."}
          </small>
        </div>
        <ul>
          <li>CSV parcellaire complet</li>
          <li>GeoJSON avec géométries non simplifiées</li>
          <li>Liste des établissements industriels proches</li>
          <li>README PDF, statistiques et méthodologie</li>
        </ul>
        {salesMode === "stripe" ? (
          <form action="/api/stripe/checkout" method="post">
            <input name="slug" type="hidden" value={slug} />
            <TrackedSubmitButton event="checkout_started" incidentSlug={slug}>
              Payer avec Stripe
            </TrackedSubmitButton>
          </form>
        ) : (
          <form
            className="contact-form"
            action="/api/export-requests"
            method="post"
          >
            <input name="incidentSlug" type="hidden" value={slug} />
            <div className="contact-form-grid">
              <label>
                Nom et prénom
                <input
                  name="contactName"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                Organisation
                <input
                  name="organization"
                  required
                  minLength={2}
                  maxLength={160}
                />
              </label>
            </div>
            <label>
              E-mail professionnel
              <input
                name="contactEmail"
                type="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Usage envisagé
              <select name="intendedUse" required defaultValue="">
                <option value="" disabled>
                  Sélectionner un usage
                </option>
                <option value="prospection">Prospection et mobilisation</option>
                <option value="planification">
                  Planification territoriale
                </option>
                <option value="transformation">
                  Approvisionnement industriel
                </option>
                <option value="etude">Étude ou expertise</option>
                <option value="autre">Autre usage professionnel</option>
              </select>
            </label>
            <label>
              Précisions facultatives
              <textarea name="message" rows={5} maxLength={2000} />
            </label>
            <label className="contact-consent">
              <input name="consent" type="checkbox" required />
              <span>
                J'accepte que mes coordonnées soient utilisées pour traiter
                cette demande d'export et conservées pendant un an au maximum.
              </span>
            </label>
            <label className="contact-honeypot" aria-hidden="true">
              Site internet
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <button className="button-primary" type="submit">
              Demander l'export professionnel
            </button>
          </form>
        )}
        <p className="purchase-legal">
          Aucun compte requis. Après validation du paiement, le lien de
          téléchargement reste valable pendant sept jours.
        </p>
      </section>
      <Link href={`/evenements/${slug}`}>Retour à la fiche événement</Link>
    </main>
  );
}
