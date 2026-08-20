import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Méthodologie",
  description: "Sources, calculs et limites des indicateurs Yakisugi.",
};

export default function MethodologyPage() {
  return (
    <section className="site-shell content-section">
      <div className="section-heading">
        <p className="eyebrow">Transparence méthodologique</p>
        <h1>Ce que disent les données, et ce qu’elles ne disent pas encore.</h1>
        <p>
          Les estimations sont calculées automatiquement à partir de données
          géographiques et forestières publiques. Elles ne constituent ni un
          inventaire forestier ni une expertise de terrain.
        </p>
      </div>
      <div className="method-grid">
        <article className="method-card">
          <h2>Sources</h2>
          <p>
            Copernicus EMS pour les incidents, IGN BD Forêt et Cadastre pour le
            territoire, INSEE SIRENE pour les établissements.
          </p>
        </article>
        <article className="method-card">
          <h2>Calculs</h2>
          <p>
            Les intersections, surfaces, compositions et distances sont
            pré-calculées hors ligne puis stockées dans PostGIS.
          </p>
        </article>
        <article className="method-card">
          <h2>Volumes</h2>
          <p>
            La fixture ne contient aucun coefficient validé. Yakisugi affiche
            donc « Volume non estimé » conformément à la règle métier.
          </p>
        </article>
        <article className="method-card">
          <h2>Limites</h2>
          <ul>
            <li>qualité et état sanitaire du bois inconnus ;</li>
            <li>exploitabilité et desserte non vérifiées ;</li>
            <li>propriété cadastrale non renseignée ;</li>
            <li>distances routières non calculées.</li>
          </ul>
        </article>
        <article className="method-card">
          <h2>Traçabilité</h2>
          <p>
            Chaque valeur doit être qualifiée comme donnée source, donnée
            calculée ou estimation, avec sa date et sa méthode.
          </p>
        </article>
        <article className="method-card">
          <h2>Vérification terrain</h2>
          <p>
            Les volumes, qualités et possibilités de mobilisation doivent être
            confirmés avant toute décision opérationnelle.
          </p>
        </article>
      </div>
    </section>
  );
}
