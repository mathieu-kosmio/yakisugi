# Plan d'implémentation de Yakisugi

Dernière mise à jour : 20 août 2026

## Décisions actives

- D-001 : socle Next.js minimal, sans backend Kotlin. Voir `docs/decisions/ADR-0001-stack-and-skeleton.md`.
- D-002 : l'application doit fonctionner sur fixtures sans service externe.
- D-003 : les traitements géospatiaux coûteux sont exécutés hors ligne par Python et persistés dans PostGIS.
- D-004 : aucune authentification utilisateur dans le MVP.
- D-005 : aucun volume estimé sans coefficient documenté et validé.

## État courant

Le dépôt contient la spécification locale, le socle applicatif et la première tranche verticale sur données fictives. La base Supabase, les imports réels et Stripe restent à connecter.

## Jalons

| ID | État | Jalon | Critère de sortie |
|---|---|---|---|
| M0 | DONE | Socle local | Installation, lint, types, tests et build réussissent |
| M1 | DONE | Tranche carte sur fixtures | Incident, forêts, 10 parcelles et industries visibles, fiche parcelle cliquable |
| M2 | BACKLOG | Données PostGIS | Migrations appliquées et lecture Supabase remplaçant les fixtures |
| M3 | BACKLOG | ETL réel | Incident, forêt, cadastre et industries importables par CLI avec tests géospatiaux |
| M4 | BACKLOG | Produit professionnel | Filtres, fiche événement, pagination et limites publiques |
| M5 | BACKLOG | Monétisation | Checkout, webhook idempotent, ZIP et téléchargement protégé |
| M6 | BACKLOG | Lancement | Méthodologie, SEO, analytics, performance, sécurité et déploiement vérifiés |

## Tâches

| ID | État | Dépend de | Zone de fichiers | Résultat attendu |
|---|---|---|---|---|
| T-001 | DONE | aucune | racine, `docs/` | Cadre local, ADR et plan agent maintenable |
| T-002 | DONE | T-001 | `app/`, `components/`, `lib/`, `fixtures/` | Tranche verticale locale fonctionnelle |
| T-003 | DONE | T-001 | `supabase/` | Migration initiale PostGIS écrite, accès bruts protégés par RLS |
| T-003B | READY | T-003 | `supabase/`, environnement local | Migration appliquée et testée sur une instance Supabase locale |
| T-004 | DONE | T-002 | `tests/` | Tests des calculs et contrats de fixtures |
| T-005 | READY | T-003B | `lib/db/`, `app/api/` | Adaptateur Supabase serveur et dépôts incidents/parcelles |
| T-006 | READY | T-003 | `scripts/`, `tests/etl/` | CLI Python import incident avec validation CRS et géométrie |
| T-007 | BACKLOG | T-006 | `scripts/`, `tests/etl/` | Import BD Forêt et intersection incident/forêt |
| T-008 | BACKLOG | T-006 | `scripts/`, `tests/etl/` | Import cadastre et croisement parcelle/forêt |
| T-009 | BACKLOG | T-006 | `scripts/`, `config/` | Import SIRENE, géocodage en cache et catégories configurées |
| T-010 | BACKLOG | T-009 | `scripts/`, `supabase/` | Distances géodésiques et bandes pré-calculées |
| T-011 | BACKLOG | T-005 | `app/api/`, `lib/api/` | API v1 paginée, filtrée, bornée et à géométries simplifiées |
| T-012 | BACKLOG | T-011 | `app/`, `components/` | Fiche événement, filtres MVP et SEO incident |
| T-013 | BLOCKED | T-008, données métier | `config/`, `scripts/` | Coefficients sourcés validés ou volumes maintenus à null |
| T-014 | BACKLOG | T-011 | `scripts/exports/` | CSV et GeoJSON complets, ZIP et méthodologie |
| T-015 | BACKLOG | T-014 | `app/api/stripe/`, `lib/stripe/` | Paiement et téléchargement sécurisé sans compte |
| T-016 | BACKLOG | T-012, T-015 | transversal | Tests E2E, performance, analytics et déploiement |

## Preuves de vérification

À compléter après installation des dépendances :

| Date | Tâches | Commande | Résultat |
|---|---|---|---|
| 2026-08-20 | T-001 | inspection documentaire | Spécification complète lue, décision consignée |
| 2026-08-20 | T-002, T-004 | `npm run check` | Biome, TypeScript et 10 tests réussis |
| 2026-08-20 | T-002 | `npm run build` | Build Next.js 16.3.1 réussi avec Webpack, 8 routes produites |
| 2026-08-20 | T-002 | requêtes HTTP locales | `/`, `/carte` et `/api/v1/incidents` répondent 200 |
| 2026-08-20 | M0 | `npm audit --omit=dev` | 0 vulnérabilité de production connue |

## Journal de session

### 2026-08-20, initialisation

- Analyse complète de la spécification source.
- Audit du dépôt privé `Kosmio/skeleton-kotlin-react` à son état du 20 août 2026.
- Choix d'un socle minimal compatible avec la contrainte de cinq jours.
- Initialisation de T-001 à T-004.

## Reste à faire

Les tâches T-003B et T-005 à T-016 représentent le chemin critique restant. Les données réelles, les clés Supabase et Stripe, les coefficients forestiers validés et les URLs sources devront être fournis ou vérifiés avant publication.

## Prochaine tâche saisissable

Saisir T-003B pour appliquer et tester la migration PostGIS. T-006 peut être menée en parallèle dans `scripts/` car elle ne touche pas les mêmes fichiers. T-005 devient saisissable dès que T-003B est terminé.
