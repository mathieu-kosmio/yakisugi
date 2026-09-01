import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Informations légales relatives à l'édition de Yakisugi.",
};

export default function LegalNoticePage() {
  return (
    <section className="site-shell content-section legal-page">
      <div className="section-heading">
        <p className="eyebrow">Informations légales</p>
        <h1>Mentions légales</h1>
        <p>
          Yakisugi est édité et exploité par Kosmio. Les informations
          d’identification ci-dessous ont été vérifiées le 31 août 2026.
        </p>
      </div>

      <div className="legal-grid">
        <article className="legal-card">
          <h2>Éditeur</h2>
          <dl className="legal-details">
            <div>
              <dt>Dénomination</dt>
              <dd>Kosmio</dd>
            </div>
            <div>
              <dt>Forme juridique</dt>
              <dd>SAS au capital de 7 500 €</dd>
            </div>
            <div>
              <dt>SIREN</dt>
              <dd>983 943 903</dd>
            </div>
            <div>
              <dt>SIRET du siège</dt>
              <dd>983 943 903 00010</dd>
            </div>
            <div>
              <dt>TVA intracommunautaire</dt>
              <dd>FR83 983 943 903</dd>
            </div>
            <div>
              <dt>Siège social</dt>
              <dd>
                Villa 8, 301 rue du Romarin
                <br />
                34160 Castries, France
              </dd>
            </div>
          </dl>
          <p className="legal-source">
            Source :{" "}
            <a
              href="https://annuaire-entreprises.data.gouv.fr/entreprise/kosmio-983943903"
              target="_blank"
              rel="noreferrer"
            >
              Annuaire des Entreprises
            </a>
          </p>
        </article>

        <article className="legal-card">
          <h2>Responsabilité éditoriale</h2>
          <p>
            La responsabilité de la publication est assurée par Zokama Sakanga,
            président de Kosmio.
          </p>
          <p>
            Pour toute question relative au site, utilisez la{" "}
            <a href="https://kosm.io/contact/">page de contact de Kosmio</a>.
          </p>
        </article>

        <article className="legal-card">
          <h2>Hébergement</h2>
          <p>
            L’application est hébergée par OVH SAS, 2 rue Kellermann, 59100
            Roubaix, France. La base de données et le stockage applicatif sont
            opérés avec Supabase.
          </p>
        </article>
      </div>
    </section>
  );
}
