# Architecture cible du MVP

```text
Sources publiques
  Copernicus, IGN, Cadastre, SIRENE
          |
          v
ETL Python hors ligne
  validation, reprojection, intersections, agrégations
          |
          v
Supabase PostgreSQL + PostGIS + Storage
          |
          +-------------------+
          |                   |
          v                   v
Route Handlers Next.js     Générateur d'exports
          |                   |
          v                   v
Pages React + MapLibre     CSV, GeoJSON, ZIP
```

## Frontières

- `app/` orchestre les pages et l'API HTTP.
- `lib/domain/` contient les types et calculs purs, sans React ni Supabase.
- `lib/data/` masque la source des données. Les fixtures sont l'adaptateur initial.
- `lib/db/` recevra l'adaptateur Supabase serveur.
- `scripts/` réalise les traitements SIG lourds et écrit des résultats pré-calculés.
- `supabase/migrations/` décrit le schéma et ses protections.

## Flux de consultation

1. Une page demande un incident publié.
2. Le dépôt lit les agrégats pré-calculés.
3. La carte demande uniquement les entités de la zone visible et du niveau de zoom utile.
4. Les géométries web sont simplifiées. Les géométries complètes restent réservées aux exports.
5. Le clic sur une parcelle charge sa composition et des agrégats de débouchés proches.

## Flux d'achat cible

1. Stripe Checkout reçoit un prix configuré côté serveur.
2. Le webhook vérifie la signature et traite l'événement de façon idempotente.
3. Une commande payée reçoit un jeton aléatoire stocké sous forme hachée et à durée limitée.
4. Le téléchargement vérifie le jeton avant de servir un export déjà généré dans Storage.

## Erreurs

- Donnée absente : valeur `null` et libellé explicite.
- Incident inconnu ou non publié : réponse 404.
- Filtre invalide : réponse 400 issue d'un schéma Zod.
- Service externe indisponible pendant l'ETL : reprise contrôlée, aucun calcul partiel publié.
- Webhook invalide : réponse 400 sans modification de commande.

## Vérification

- Calculs purs : Vitest.
- Contrats API : Vitest sur Route Handlers.
- ETL : pytest avec petites géométries synthétiques et contrôles de CRS.
- Base : tests SQL et environnement Supabase local.
- Parcours critiques : Playwright après stabilisation de M4 et M5.
