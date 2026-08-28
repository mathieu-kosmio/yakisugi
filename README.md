# Yakisugi

Yakisugi transforme des données publiques sur les incendies, les peuplements forestiers, le cadastre et les établissements de la filière bois en une information de prospection cartographique.

Le dépôt contient une tranche verticale locale fondée sur des fixtures, un adaptateur Supabase serveur et le premier import géospatial hors ligne. L'application reste utilisable sans connexion à Supabase ni aux sources externes.

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
npm run smoke:web
```

Pour l'ETL Python :

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/ruff check scripts tests/etl
.venv/bin/pytest --cov=scripts --cov-fail-under=80
```

Les tests d'intégration PostGIS sont activés lorsque `YAKISUGI_TEST_DATABASE_URL` est défini.

## Import d'un incident

Le mode simulation valide et normalise le fichier sans écrire en base :

```bash
.venv/bin/python scripts/import_incident.py \
  --file fixtures/incident.geojson \
  --name "Incident de démonstration de Saumos" \
  --external-id FIXTURE-SAUMOS-2026 \
  --start-date 2026-07-22 \
  --source-url local://fixtures/incident.geojson \
  --department-codes 33 \
  --dry-run
```

Pour persister l'incident, définir `DATABASE_URL` ou utiliser `--database-url`, puis retirer `--dry-run`. La commande produit un journal JSON et met à jour l'incident si son identifiant externe existe déjà.

## Documents de référence

- `SPEC.md` : spécification source copiée localement, à traiter comme expression du besoin.
- `IMPLEMENTATION_PLAN.md` : état d'avancement, dépendances et prochain travail saisissable.
- `AGENTS.md` : règles de contribution pour Codex et les autres agents.
- `docs/decisions/ADR-0001-stack-and-skeleton.md` : décision sur le squelette Kotlin/React.
- `docs/architecture/README.md` : architecture cible du MVP.
- `docs/data/LINEAGE.md` : distinction entre données source, calculs et estimations.
- `docs/data/SOURCES.md` : références et conventions des jeux de données importés.
- `docs/DEPLOYMENT.md` : configuration Supabase, Coolify, vente manuelle et Stripe optionnel.

## Structure

```text
app/                 Application et Route Handlers Next.js
components/          Composants cartographiques et interface
fixtures/            Petit jeu de données fictif versionné
lib/                 Domaine, calculs purs et accès aux données
scripts/             ETL Python géospatial hors ligne
supabase/migrations/ Schéma PostgreSQL/PostGIS
tests/               Tests unitaires et de contrat
docs/                Architecture, décisions et données
```

## Règle de données

Une valeur affichée doit être identifiée comme donnée source, donnée calculée ou estimation. Aucune fourchette de volume ne sera affichée avant validation de coefficients documentés.
