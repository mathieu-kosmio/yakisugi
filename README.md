# Yakisugi

Yakisugi transforme des données publiques sur les incendies, les peuplements forestiers, le cadastre et les établissements de la filière bois en une information de prospection cartographique.

Le dépôt est initialisé avec une tranche verticale locale fondée sur des fixtures. Elle permet de parcourir un incident, ses peuplements, ses parcelles et les industriels proches sans connexion à Supabase ni aux sources externes.

## Démarrage local

Prérequis : Node.js 22 ou supérieur et npm 11 ou supérieur.

```bash
npm install
npm run dev
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).

## Vérification

```bash
npm run check
npm run build
```

## Documents de référence

- `SPEC.md` : spécification source copiée localement, à traiter comme expression du besoin.
- `IMPLEMENTATION_PLAN.md` : état d'avancement, dépendances et prochain travail saisissable.
- `AGENTS.md` : règles de contribution pour Codex et les autres agents.
- `docs/decisions/ADR-0001-stack-and-skeleton.md` : décision sur le squelette Kotlin/React.
- `docs/architecture/README.md` : architecture cible du MVP.
- `docs/data/LINEAGE.md` : distinction entre données source, calculs et estimations.

## Structure

```text
app/                 Application et Route Handlers Next.js
components/          Composants cartographiques et interface
fixtures/            Petit jeu de données fictif versionné
lib/                 Domaine, calculs purs et accès aux données
scripts/             Futur ETL Python hors ligne
supabase/migrations/ Schéma PostgreSQL/PostGIS
tests/               Tests unitaires et de contrat
docs/                Architecture, décisions et données
```

## Règle de données

Une valeur affichée doit être identifiée comme donnée source, donnée calculée ou estimation. Aucune fourchette de volume ne sera affichée avant validation de coefficients documentés.
