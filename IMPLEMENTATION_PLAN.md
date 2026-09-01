# Plan d'implémentation de Yakisugi

Dernière mise à jour : 1er septembre 2026

## Décisions actives

- D-001 : socle Next.js minimal, sans backend Kotlin. Voir `docs/decisions/ADR-0001-stack-and-skeleton.md`.
- D-002 : l'application doit fonctionner sur fixtures sans service externe.
- D-003 : les traitements géospatiaux coûteux sont exécutés hors ligne par Python et persistés dans PostGIS.
- D-004 : aucune authentification utilisateur dans le MVP.
- D-005 : aucun volume estimé sans coefficient documenté et validé.
- D-006 : le mode commercial par défaut est une demande de contact suivie d'un paiement externe et d'une livraison administrée par CLI. Stripe reste activable par configuration.
- D-007 : l'application est déployée dans Coolify par image Docker standalone et utilise Supabase hébergé pour la base et le Storage. Voir `docs/decisions/ADR-0007-coolify-managed-supabase.md`.

## État courant

Le MVP complet est déployé dans Coolify sur HTTPS. Le snapshot réel EMSR899 est chargé et publié dans Supabase : 31 602,37 ha d'incident, 3 615 formations forestières sources, 11 786 parcelles affectées et 2 019 établissements industriels. Le healthcheck vérifie désormais la configuration Supabase. La carte a été optimisée localement : elle lit seulement les géométries web quand elles existent, regroupe les lectures indépendantes, évite la liste d'incidents déjà connue et reporte le chargement de MapLibre. La recette publique complète attend la correction des variables Coolify, le redéploiement et le contrôle navigateur.

## Jalons

| ID | État | Jalon | Critère de sortie |
|---|---|---|---|
| M0 | DONE | Socle local | Installation, lint, types, tests et build réussissent |
| M1 | DONE | Tranche carte sur fixtures | Incident, forêts, 10 parcelles et industries visibles, fiche parcelle cliquable |
| M2 | IN_PROGRESS | Données PostGIS | Migrations appliquées et lecture Supabase remplaçant les fixtures |
| M3 | DONE | ETL réel | Incident, forêt, cadastre et industries importables par CLI avec tests géospatiaux |
| M4 | DONE | Produit professionnel | Filtres, fiche événement, pagination et limites publiques |
| M5 | DONE | Monétisation | Contact par défaut, paiement externe administré, Stripe optionnel, ZIP et téléchargement protégé |
| M6 | DONE | Lancement | Méthodologie, SEO, analytics, performance, sécurité et déploiement vérifiés |

## Tâches

| ID | État | Dépend de | Zone de fichiers | Résultat attendu |
|---|---|---|---|---|
| T-001 | DONE | aucune | racine, `docs/` | Cadre local, ADR et plan agent maintenable |
| T-002 | DONE | T-001 | `app/`, `components/`, `lib/`, `fixtures/` | Tranche verticale locale fonctionnelle |
| T-003 | DONE | T-001 | `supabase/` | Migration initiale PostGIS écrite, accès bruts protégés par RLS |
| T-003B | DONE | T-003 | `supabase/`, environnement local | Migration appliquée et testée sur une instance Supabase locale |
| T-004 | DONE | T-002 | `tests/` | Tests des calculs et contrats de fixtures |
| T-005 | DONE | T-003B | `lib/db/`, `app/api/` | Adaptateur Supabase serveur et dépôts incidents/parcelles |
| T-006 | DONE | T-003 | `scripts/`, `tests/etl/` | CLI Python import incident avec validation CRS et géométrie |
| T-007 | DONE | T-006 | `scripts/`, `tests/etl/` | Import BD Forêt et intersection incident/forêt |
| T-008 | DONE | T-006 | `scripts/`, `tests/etl/` | Import cadastre et croisement parcelle/forêt |
| T-009 | DONE | T-006 | `scripts/`, `config/` | Import SIRENE, géocodage en cache et catégories configurées |
| T-010 | DONE | T-009 | `scripts/`, `supabase/` | Distances géodésiques et bandes pré-calculées |
| T-011 | DONE | T-005 | `app/api/`, `lib/api/` | API v1 paginée, filtrée, bornée et à géométries simplifiées |
| T-012 | DONE | T-011 | `app/`, `components/` | Fiche événement, filtres MVP et SEO incident |
| T-013 | BLOCKED | T-008, données métier | `config/`, `scripts/` | Coefficients sourcés validés ou volumes maintenus à null |
| T-014 | DONE | T-011 | `scripts/exports/` | CSV et GeoJSON complets, ZIP et méthodologie |
| T-015 | DONE | T-014 | `app/api/stripe/`, `lib/stripe/` | Paiement et téléchargement sécurisé sans compte |
| T-015B | DONE | T-014 | `app/acheter/`, `lib/sales/`, `scripts/admin/`, `supabase/` | Formulaire de contact, paiement externe et livraison administrée |
| T-016 | DONE | T-012, T-015 | transversal | Tests E2E, performance, analytics et déploiement |
| T-017 | DONE | T-009 | `scripts/`, `tests/etl/`, `docs/data/`, `data/sirene/` | Extraction SIRENE officielle ciblée, normalisée, tracée et validée à blanc |
| T-018 | BLOCKED | T-003B, T-016, T-017 | `supabase/`, `scripts/`, `data/`, Coolify | Migrations et données réelles publiées, contrôlées puis servies par le site |
| T-019 | DONE | T-016 | `components/map/`, `app/`, `tests/`, `docs/` | Fond satellite IGN activable et informations légales de l'éditeur implémentés et vérifiés |
| T-020 | DONE | T-018 | `app/api/health/`, `tests/`, `docs/` | Healthcheck refusant une configuration Supabase incomplète |
| T-021 | DONE | T-018 | `app/carte/`, `components/map/`, `lib/data/`, `tests/`, `docs/` | Carte Supabase chargée sans géométries complètes redondantes ni requêtes en cascade |

## Preuves de vérification

À compléter après installation des dépendances :

| Date | Tâches | Commande | Résultat |
|---|---|---|---|
| 2026-08-20 | T-001 | inspection documentaire | Spécification complète lue, décision consignée |
| 2026-08-20 | T-002, T-004 | `npm run check` | Biome, TypeScript et 10 tests réussis |
| 2026-08-20 | T-002 | `npm run build` | Build Next.js 16.3.1 réussi avec Webpack, 8 routes produites |
| 2026-08-20 | T-002 | requêtes HTTP locales | `/`, `/carte` et `/api/v1/incidents` répondent 200 |
| 2026-08-20 | M0 | `npm audit --omit=dev` | 0 vulnérabilité de production connue |
| 2026-08-20 | T-003B | migrations PostgreSQL locales | 12 tests pgTAP réussis sur PostgreSQL 17/PostGIS |
| 2026-08-20 | T-005 | `npm run check` | Biome, TypeScript et 19 tests réussis |
| 2026-08-20 | T-005 | `npm run build` | Build Next.js réussi, 9 routes produites |
| 2026-08-20 | T-005 | requêtes HTTP locales | `/`, `/carte` et `/api/v1/incidents` répondent 200 avec le repli fixtures |
| 2026-08-20 | T-006 | `.venv/bin/ruff check scripts tests/etl` | Contrôles Python réussis |
| 2026-08-20 | T-006 | pytest avec PostgreSQL/PostGIS local | 8 tests réussis, dont insertion idempotente, SRID et nettoyage |
| 2026-08-20 | T-006 | pytest avec couverture | 91 % de couverture de `scripts/import_incident.py` |
| 2026-08-20 | T-006 | simulation CLI sur fixture | GeoJSON dissout, validé en EPSG:4326 et superficie calculée |
| 2026-08-20 | T-007 | migrations et pgTAP | 13 contrôles SQL réussis avec `forest_raw`, RLS et index spatial |
| 2026-08-20 | T-007 | pytest avec PostgreSQL/PostGIS local | 12 tests réussis pour les pipelines incident et forêt |
| 2026-08-20 | T-007 | pytest avec couverture | 80 % de couverture globale des scripts ETL |
| 2026-08-20 | T-007 | simulation CLI sur fixture | 4 peuplements normalisés en EPSG:4326 |
| 2026-08-20 | T-008 | migrations et pgTAP | 14 contrôles SQL réussis avec stockage cadastral brut protégé |
| 2026-08-20 | T-008 | pytest avec PostgreSQL/PostGIS local | 21 tests réussis sur la chaîne incident, forêt et parcelles |
| 2026-08-20 | T-008 | pytest avec couverture | 88 % de couverture globale des scripts ETL |
| 2026-08-20 | T-008 | simulation CLI sur fixture | 10 parcelles de 2 communes normalisées en EPSG:4326 |
| 2026-08-20 | T-009 | pytest avec PostgreSQL/PostGIS local | 28 tests réussis, dont upsert industriel et SRID 4326 |
| 2026-08-20 | T-009 | pytest avec couverture | 87 % de couverture globale des scripts ETL |
| 2026-08-20 | T-009 | simulation CLI sur fixture | 10 établissements actifs et ciblés, aucune adresse non résolue |
| 2026-08-20 | T-010 | pytest avec PostgreSQL/PostGIS local | 37 tests réussis, dont rayon, bandes et seconde exécution |
| 2026-08-20 | T-010 | pytest avec couverture | 86 % de couverture globale des scripts ETL |
| 2026-08-20 | T-011 | `npm run check` | Biome, TypeScript et 23 tests réussis |
| 2026-08-20 | T-011 | `npm run build` | Build Next.js réussi, 9 routes produites |
| 2026-08-20 | T-011 | requêtes HTTP locales | Pagination incidents, parcelles et industries en 200, limite excessive en 400 |
| 2026-08-20 | T-012 | `npm run check` | Biome, TypeScript et 25 tests réussis |
| 2026-08-20 | T-012 | `npm run build` | Build Next.js réussi, fiche événement et 10 routes produites |
| 2026-08-20 | T-012 | requêtes HTTP locales | Fiche connue et carte en 200, fiche inconnue en 404 |
| 2026-08-20 | T-014 | pytest avec PostgreSQL/PostGIS local | 39 tests réussis, dont archive déterministe, données complètes et checksum persisté |
| 2026-08-20 | T-014 | pytest avec couverture | 85 % de couverture globale des scripts ETL et export |
| 2026-08-20 | T-014 | inspection PDF | README A4 d'une page rendu et contrôlé visuellement, sans débordement |
| 2026-08-20 | T-015 | `npm run check` | Biome, TypeScript et 32 tests réussis, dont signatures Stripe, idempotence et lien signé |
| 2026-08-20 | T-015 | `npm run build` | Build Next.js réussi avec 15 routes, dont Checkout, webhook et téléchargement |
| 2026-08-20 | T-015 | requêtes HTTP locales | Achat en 200, token invalide en 404, webhook non signé et checkout invalide en 400 |
| 2026-08-20 | T-015 | pgTAP | 16 contrôles réussis, dont unicité des sessions Checkout et des hash de jetons |
| 2026-08-20 | T-015 | pytest avec PostgreSQL/PostGIS local | 40 tests réussis, upload Storage inclus, avec 85 % de couverture arrondie |
| 2026-08-20 | T-016 | `npm run check` | Biome, TypeScript et 34 tests réussis, analytics et SEO inclus |
| 2026-08-20 | T-016 | `npm run build` | Build de production réussi avec 18 routes, sitemap et robots inclus |
| 2026-08-20 | T-016 | `npm run smoke:web` | 7 parcours HTTP réussis, réponses de 12 à 23 Ko et temps local maximal de 65 ms |
| 2026-08-20 | T-016 | pgTAP | 17 contrôles réussis, table analytics protégée et indexée |
| 2026-08-20 | T-016 | `npm audit --omit=dev` | 0 vulnérabilité de production connue |
| 2026-08-20 | T-015B | `npm run check` | Biome, TypeScript et 40 tests réussis, formulaire et désactivation Stripe inclus |
| 2026-08-20 | T-015B | `npm run build` | Build Next.js réussi avec 19 routes, dont demande d'export et contrôle de santé |
| 2026-08-20 | T-015B | pytest avec PostgreSQL/PostGIS local | 45 tests réussis, livraison externe réelle et couverture globale de 81,40 % |
| 2026-08-20 | T-015B | pgTAP | 21 contrôles réussis, demandes privées et commandes externes incluses |
| 2026-08-20 | T-015B | inspection PDF | README A4 rendu avec accents et contrôlé visuellement sans débordement |
| 2026-08-20 | T-015B | `npm run smoke:web` | 8 parcours HTTP réussis, dont achat en mode contact et `/api/health` |
| 2026-08-20 | T-015B | `docker build -t yakisugi:local .` | Image standalone construite, lancée et déclarée saine par Docker |
| 2026-08-24 | T-017 | extraction Annuaire des Entreprises | 2 295 établissements actifs pour 2 départements et 7 codes APE |
| 2026-08-24 | T-017 | `.venv/bin/pytest -q tests/etl` | 49 tests réussis, 7 tests d'intégration sans base ignorés |
| 2026-08-24 | T-017 | couverture ciblée | 89 % de couverture de `scripts/prepare_sirene_annuaire.py` |
| 2026-08-24 | T-017 | dry-run SIRENE | 2 019 établissements importables, 85 adresses non résolues, aucun hors périmètre |
| 2026-08-24 | T-017 | `npm run check` | Biome, TypeScript et 40 tests réussis |
| 2026-08-28 | T-016 | `npm run check` | Biome, TypeScript et 59 tests réussis |
| 2026-08-28 | T-016 | `npm run test:coverage` | 80,12 % des instructions, 80,26 % des fonctions et 82,92 % des lignes TypeScript |
| 2026-08-28 | T-016 | `.venv/bin/ruff check scripts tests/etl` | Contrôles Python réussis |
| 2026-08-28 | T-016 | pytest avec PostgreSQL/PostGIS local | 56 tests réussis et couverture Python globale de 82,59 % |
| 2026-08-28 | T-016 | pgTAP | 21 contrôles réussis sur PostgreSQL 17/PostGIS |
| 2026-08-28 | T-016 | `npm run build` | Build Next.js réussi avec 19 routes |
| 2026-08-28 | T-016 | `npm run smoke:web` | 8 parcours HTTP réussis, temps local maximal de 27 ms |
| 2026-08-28 | T-016 | `npm audit --omit=dev` | 0 vulnérabilité de production connue |
| 2026-08-28 | T-016 | image Docker `yakisugi:local` | Conteneur sain et `/api/health` en 200 |
| 2026-08-28 | T-016 | build Coolify du commit `38aea3b` | Échec contenu avant bascule : `/carte` interrogeait Supabase pendant le pré-rendu |
| 2026-08-28 | T-016 | test de rendu et build avec Supabase indisponible | 60 tests réussis et `/carte` rendu dynamiquement sans dépendance au build |
| 2026-08-28 | T-016 | Coolify, commit `872c2e8` | Build réussi, conteneur sain et configuration production appliquée |
| 2026-08-28 | T-016 | recette HTTPS publique | Accueil, carte, événement, achat, méthodologie, santé, API, sitemap et robots répondent comme attendu |
| 2026-08-28 | T-016 | recette navigateur publique | Filtres de 10 à 2 parcelles et aucune erreur console sur les trois parcours principaux |
| 2026-08-28 | T-016 | contrôle HTTP et sécurité | Redirection HTTP vers HTTPS, sitemap canonique HTTPS et six en-têtes de sécurité présents |
| 2026-08-28 | T-018 | dry-run Copernicus EMSR899 | 1 832 polygones valides, 0 réparation et 31 602,37 ha calculés |
| 2026-08-28 | T-018 | dry-run IGN BD Forêt V2 | 3 615 formations valides, attributs de type et d'essence conservés |
| 2026-08-28 | T-018 | dry-run Cadastre Etalab | 11 790 parcelles candidates valides dans 15 communes |
| 2026-08-28 | T-018 | dry-run SIRENE | 2 019 établissements importables, 85 non résolus exclus |
| 2026-08-29 | T-018 | migrations Supabase hébergées | 7 migrations appliquées, schéma PostGIS et politiques de sécurité en place |
| 2026-08-29 | T-018 | imports et traitements réels | Incident publié, 1 449 formations touchées, 11 786 parcelles affectées et 2 019 industries chargées |
| 2026-08-29 | T-018 | calcul des proximités | 2 019 distances calculées, dont 1 516 industries à moins de 100 km |
| 2026-08-29 | T-018 | contrôles qualité SQL | Géométries valides, ratios bornés, volumes à `null` et provenance des quatre sources vérifiée |
| 2026-08-29 | T-018 | `npm run check` | Biome, TypeScript et 60 tests réussis |
| 2026-08-29 | T-018 | `.venv/bin/ruff check scripts tests/etl` | Contrôles Python réussis |
| 2026-08-29 | T-018 | `.venv/bin/pytest -q tests/etl` | 52 tests réussis, 7 tests d'intégration ignorés sans base locale |
| 2026-08-29 | T-018 | `npm run build` | Build Next.js de production réussi avec 19 routes |
| 2026-08-29 | T-018 | export réel en simulation | 11 786 parcelles et 2 019 industries validées sans écriture |
| 2026-08-31 | T-019 | requête WMTS IGN ciblée | Tuile `ORTHOIMAGERY.ORTHOPHOTOS` de la zone de Saumos reçue en HTTP 200 |
| 2026-08-31 | T-019 | `npm run check` | Biome, TypeScript et 61 tests réussis, sélecteur accessible et sitemap inclus |
| 2026-08-31 | T-019 | `npm run build` | Build de production réussi avec la route statique `/mentions-legales` |
| 2026-08-31 | T-019 | `npm run smoke:web` | 9 parcours HTTP réussis, dont carte, mentions légales, sitemap et santé |
| 2026-09-01 | T-020 | reproduction navigateur locale | `/carte` sans canvas et erreur serveur lorsque Supabase est sélectionné sans ses variables d'exécution |
| 2026-09-01 | T-020 | test de non-régression ciblé | Échec observé en rouge avant correction : healthcheck `200` au lieu de `503`, puis réussite après correction |
| 2026-09-01 | T-020 | `npm run check` | Biome, TypeScript et 62 tests réussis |
| 2026-09-01 | T-020 | `npm run build` | Build Next.js de production réussi |
| 2026-09-01 | T-020 | requête HTTP locale | `/api/health` retourne `503` et `check=data-source-config` avec une configuration Supabase incomplète |
| 2026-09-01 | T-020 | `docker build -t yakisugi:local .` | Image standalone construite avec les variables cartographiques publiques configurables |
| 2026-09-01 | T-020 | conteneur Docker sans secrets Supabase | Conteneur démarré et healthcheck en `503`, conforme au blocage attendu |
| 2026-09-01 | T-021 | mesures Supabase en lecture seule | Les requêtes cartographiques transféraient environ 37,8 Mo de géométries complètes et web ; le chemin optimisé conserve environ 9,4 Mo de géométries web, soit une réduction estimée de 75 % avant sérialisation HTTP |
| 2026-09-01 | T-021 | test de non-régression ciblé | Jeu cartographique chargé en quatre requêtes, avec les trois lectures de couches en parallèle et sans colonne `geometry` complète lorsqu'une géométrie web est disponible |
| 2026-09-01 | T-021 | `npm run check` | Biome, TypeScript et 64 tests réussis |
| 2026-09-01 | T-021 | `npm run build` | Build de production réussi avec `/carte` dynamique et son état de chargement |
| 2026-09-01 | T-021 | `npm run smoke:web` | 9 parcours HTTP réussis, carte fixture en 9 ms |

## Journal de session

### 2026-08-20, initialisation

- Analyse complète de la spécification source.
- Audit du dépôt privé `Kosmio/skeleton-kotlin-react` à son état du 20 août 2026.
- Choix d'un socle minimal compatible avec la contrainte de cinq jours.
- Initialisation de T-001 à T-004.

### 2026-08-20, données locales

- T-003B saisie : préparation de Supabase local, application et tests de la migration PostGIS.
- T-003B terminée : migrations appliquées dans PostgreSQL 17 et 12 contrôles pgTAP réussis.
- T-005 saisie : adaptateur Supabase serveur avec repli local sur fixtures.
- T-005 terminée : dépôt Supabase serveur, DTO validés, repli fixtures, build et tests HTTP réussis.
- T-006 saisie : CLI Python d'import d'incident et tests géospatiaux.
- T-006 terminée : validation, réparation, reprojection, dissolution, superficie et écriture idempotente testées.
- T-007 saisie : import BD Forêt et intersection pré-calculée avec un incident.
- T-007 terminée : stockage brut traçable, intersection forestière et remplacement transactionnel testés.
- T-008 saisie : import cadastral et calcul parcelle, incident et forêt.
- T-008 terminée : stockage cadastral, compositions forestières, confiance et volumes nuls testés.
- T-009 saisie : import SIRENE, catégories métier et cache de géocodage.
- T-009 terminée : filtrage SIRENE, configuration APE, géocodage Géoplateforme opt-in et cache testés.
- T-010 saisie : distances géodésiques et bandes pré-calculées.
- T-010 terminée : distances à vol d'oiseau, rayon de 200 km et bandes pré-calculés et testés.
- T-011 saisie : pagination, filtres et bornes de l'API publique.
- T-011 terminée : pagination côté dépôt, filtres bornés et géométries web validés.
- T-012 saisie : fiche événement, filtres MVP et métadonnées SEO.
- T-012 terminée : fiche événement, métadonnées, états absents et filtres carte validés.
- T-014 saisie : exports CSV, GeoJSON, méthodologie et ZIP.
- T-014 terminée : archive déterministe de six fichiers, PDF de lecture, géométries complètes et checksum vérifiés.
- T-015 saisie : checkout Stripe, webhook idempotent et téléchargement protégé.
- T-015 terminée : paiement serveur, signature sur corps brut, commande idempotente, token HMAC et téléchargement Storage signé validés.
- T-016 saisie : contrôles E2E, performance, analytics, sécurité et préparation du déploiement.
- T-016 contrôlée localement : analytics internes minimaux, SEO, headers, build et smoke de production validés.
- T-016 bloquée pour la publication : projet Supabase, application Coolify, domaine, données réelles et informations légales absents.
- T-015B saisie : mode contact par défaut, suivi des demandes et livraison après paiement externe.
- T-015B terminée : formulaire protégé, table privée, Stripe configurable, CLI de livraison externe, préparateur SIRENE et déploiement Coolify documentés et testés.
- Conteneurs temporaires PostgreSQL/PostGIS et application supprimés après validation. L'image locale `yakisugi:local` est conservée pour contrôle.

### 2026-08-23, données SIRENE réelles

- T-017 saisie : extraction officielle ciblée des établissements actifs de Gironde et des Landes pour les sept codes APE configurés.
- T-017 terminée le 24 août : 2 104 établissements normalisés, 2 019 géolocalisés et validés à blanc, 85 adresses non résolues documentées.

### 2026-08-27, recette et publication du MVP complet

- T-016 reprise : recette du premier déploiement Coolify, consolidation Git, publication du MVP complet et nouvelle recette publique.
- Premier déploiement contrôlé : carte et filtres fonctionnels, mais version distante incomplète, données fictives, routes produit absentes et certificat HTTPS invalide.
- Validation locale complète reprise le 28 août : tests TypeScript et Python, couvertures supérieures à 80 %, pgTAP, build, smoke, audit et image Docker réussis.
- Le premier rebuild du commit complet a détecté une requête Supabase au pré-rendu de `/carte`. La reproduction locale, le test de non-régression et le rendu dynamique corrigent cette dépendance avant une nouvelle publication.
- Le commit `872c2e8` est actif dans Coolify. Le mode fixtures est explicite tant que Supabase n'est pas migré, l'URL canonique est en HTTPS et la recette publique est réussie.
- T-016 et M6 terminés : parcours HTTP et navigateur, SEO, sécurité, filtres, santé et déploiement vérifiés.

### 2026-08-28, bascule vers les données réelles

- T-018 saisie : auditer les sources disponibles, migrer Supabase hébergé, importer les données réelles avec leurs preuves, contrôler la qualité puis basculer Coolify sur Supabase.
- Sources réelles préparées : périmètre final Copernicus EMSR899, 3 615 formations IGN, 11 790 parcelles cadastrales candidates et 2 019 établissements SIRENE importables.
- Publication Supabase en attente de `DATABASE_URL`, à fournir uniquement dans `.env.local` ou dans un gestionnaire de secrets.

### 2026-08-29, publication du snapshot réel

- Les sept migrations ont été appliquées au Supabase hébergé et le snapshot EMSR899 a été chargé avec sa provenance.
- Les traitements hors ligne produisent 1 449 formations forestières touchées, 11 786 parcelles affectées et 2 019 distances industrielles.
- Une précision géodésique à quatre décimales protège les micro-surfaces cadastrales et forestières contre les divisions par zéro.
- Le centroïde de l'incident est matérialisé une fois par calcul de distances afin d'éviter le recalcul de la géométrie Copernicus complexe pour chaque établissement.
- Les contrôles TypeScript, Python, build et export réel en simulation sont réussis. La bascule Coolify reste à effectuer.

### 2026-08-31, fond satellite et informations légales

- L'utilisateur confirme la bascule Coolify vers Supabase, le redéploiement et un contrôle `/api/health` réussi avec `{"status":"ok","service":"yakisugi"}`.
- T-019 saisie : ajouter un sélecteur accessible Plan/Satellite sans réinitialiser la carte, utiliser l'orthophotographie IGN comme couche raster et publier les informations légales Kosmio issues de SIRENE et des sources officielles de l'éditeur.
- T-019 terminée localement : contrôle Plan/Satellite, flux IGN configurable, attribution visible, page légale, pied de page et sitemap ajoutés.
- Fichiers principaux : `components/map/map-base-layer-switch.tsx`, `components/map/radar-map.tsx`, `app/mentions-legales/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/sitemap.ts`, `.env.example`, `docs/DEPLOYMENT.md`, `tests/map-base-layer-switch.test.tsx`, `tests/pages.test.ts` et `scripts/smoke-web.mjs`.
- Vérifications réussies : tuile IGN en HTTP 200, 61 tests TypeScript, build Next.js et 9 parcours smoke HTTP.

### 2026-09-01, diagnostic de la carte absente

- Le défaut est absent en mode fixtures : le canvas MapLibre, les couches, le sélecteur Plan/Satellite et les contrôles sont visibles sans erreur console.
- Le défaut est reproduit en mode Supabase sans variables d'exécution : `/carte` échoue avant le rendu avec l'erreur de configuration `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SECRET_KEY`.
- La réponse `{"status":"ok","service":"yakisugi"}` ne contrôlait aucune dépendance et constituait un faux positif.
- T-020 terminée : `/api/health` valide désormais la configuration de la source de données et retourne `503` lorsque Supabase est incomplet.
- Le `Dockerfile` accepte aussi `NEXT_PUBLIC_SATELLITE_TILE_URL` comme argument de build afin que Coolify puisse remplacer le flux IGN par défaut sans modifier le code.
- T-018 passe à `BLOCKED` jusqu'à la vérification des variables Coolify : URL Supabase et clé secrète disponibles à l'exécution, puis redéploiement. Les variables cartographiques publiques restent des variables de build.

### 2026-09-01, optimisation de chargement de la carte

- T-021 saisie : les mesures Supabase identifient le transfert de géométries complètes et simplifiées pour la même carte, ainsi que des lectures successives évitables. La correction conserve les géométries sources et les exports complets.
- T-021 terminée localement : les lectures cartographiques utilisent `geometry_web`, ne consultent la géométrie complète qu'en secours pour les données historiques, regroupent les couches indépendantes et retardent l'import de MapLibre. Un état de chargement route rend la navigation immédiatement visible.

## Reste à faire

T-013 demeure bloquée en l'absence de coefficients forestiers validés, les volumes restent donc `null`. Le snapshot réel EMSR899 est publié et contrôlé dans Supabase. T-018 est bloquée par la configuration d'exécution Coolify à vérifier après le signalement de la carte absente. Les changements T-019 à T-021 doivent être commités, redéployés puis contrôlés dans le navigateur public. Les clés Stripe seront utiles uniquement lors de sa réactivation.

## Prochaine tâche saisissable

Dans Coolify, vérifier que `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` et `YAKISUGI_DATA_SOURCE=supabase` sont disponibles à l'exécution, sans exposer les valeurs. Commiter et redéployer T-019 à T-021, attendre un healthcheck `200`, puis vérifier publiquement la carte EMSR899, le sélecteur Plan/Satellite, `/mentions-legales`, la fiche événement, les filtres et les API.
