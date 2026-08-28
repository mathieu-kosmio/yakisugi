# Déploiement de Yakisugi

## Architecture retenue pour le MVP

- Coolify construit et exécute l'application Next.js à partir du `Dockerfile`.
- Supabase hébergé fournit PostgreSQL, PostGIS et le bucket Storage privé.
- Le mode commercial par défaut est `contact` avec paiement externe vérifié par un administrateur.
- Stripe reste disponible avec `SALES_MODE=stripe` lorsque le parcours automatisé sera réactivé.
- Les traitements géographiques, l'import SIRENE et la génération des exports s'exécutent hors ligne depuis un poste ou un runner d'administration.

Cette séparation évite d'héberger la base Supabase dans Coolify pendant le MVP. Elle conserve les sauvegardes, les migrations et le Storage dans un service géré, tout en rendant l'application Next.js portable.

## 1. Créer et préparer Supabase

1. Créer un projet Supabase dans une région européenne adaptée aux utilisateurs.
2. Dans `Project Settings > Data API`, relever l'URL du projet.
3. Dans `Project Settings > API Keys`, créer ou relever une clé secrète serveur. Cette clé devient `SUPABASE_SECRET_KEY` et reste absente du navigateur, des captures et des journaux.
4. Dans `Project Settings > Database`, relever une chaîne de connexion compatible avec le poste d'administration. Utiliser la connexion directe si IPv6 fonctionne, ou le pooler en mode session pour les scripts ETL longs.
5. Installer la CLI Supabase puis lier le dépôt :

```bash
supabase login
supabase link --project-ref VOTRE_REFERENCE_PROJET
supabase db push
```

6. Vérifier l'historique avec `supabase migration list`.
7. Exécuter `supabase/tests/initial_schema.test.sql` sur une base de validation avant la production.
8. Vérifier dans Storage que le bucket privé `incident-exports` existe. La migration limite son type MIME aux ZIP et sa taille à 100 Mo.
9. Conserver `DATABASE_URL` uniquement sur le poste ou le runner qui exécute l'ETL. L'application web utilise l'URL Supabase et la clé secrète serveur.

Avant une migration de production, créer une sauvegarde ou confirmer la politique de sauvegarde du projet. Les migrations sont versionnées dans `supabase/migrations/` et restent l'autorité du schéma.

## 2. Préparer les données SIRENE

Le MVP utilise les fichiers stock officiels SIRENE plutôt qu'un appel API dans l'application web.

1. Télécharger sur data.gouv.fr les archives du stock des établissements et du stock des unités légales pour le même millésime.
2. Décompresser les deux CSV dans un répertoire de travail exclu de Git.
3. Produire un fichier réduit aux départements et codes APE de Yakisugi :

```bash
.venv/bin/python scripts/prepare_sirene_stock.py \
  --establishments data/sirene/StockEtablissement_utf8.csv \
  --legal-units data/sirene/StockUniteLegale_utf8.csv \
  --categories config/industry-categories.json \
  --department 33 \
  --department 40 \
  --output data/sirene/yakisugi-industries.csv
```

4. Valider puis géocoder le fichier préparé :

```bash
.venv/bin/python scripts/import_industries.py \
  --file data/sirene/yakisugi-industries.csv \
  --categories config/industry-categories.json \
  --geocoding-cache data/geocoding-cache.json \
  --geocode-missing \
  --source-url URL_EXACTE_DU_MILLESIME \
  --source-date AAAA-MM-JJ \
  --dry-run
```

5. Relancer sans `--dry-run`, puis exécuter `scripts/calculate_distances.py` pour chaque incident publié.

Le préparateur conserve uniquement les personnes morales disposant d'une dénomination ou les établissements dotés d'une enseigne. Il ne reconstitue aucun nom de personne physique. Les fichiers SIRENE bruts et le cache de géocodage restent hors du dépôt.

## 3. Configurer Coolify

1. Dans Coolify, ajouter une ressource `Application` et connecter le dépôt GitHub `mathieu-kosmio/yakisugi` via l'application GitHub Coolify.
2. Sélectionner la branche de déploiement et le mode de construction `Dockerfile`.
3. Conserver le port exposé `3000` et ajouter le domaine public HTTPS.
4. Définir le chemin de contrôle de santé `/api/health` avec un code attendu `200`.
5. Ajouter les variables d'exécution :

```dotenv
YAKISUGI_DATA_SOURCE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE_PROJET.supabase.co
SUPABASE_SECRET_KEY=VOTRE_CLE_SECRETE
SALES_MODE=contact
APP_URL=https://yakisugi.example
YAKISUGI_EXPORT_BUCKET=incident-exports
ANALYTICS_HASH_SALT=SECRET_ALEATOIRE_DISTINCT
```

6. Ajouter `NEXT_PUBLIC_MAP_STYLE_URL` comme variable disponible pendant la construction. Les variables `NEXT_PUBLIC_*` utilisées par le navigateur sont intégrées au bundle au moment du build.
7. Déclencher le déploiement puis contrôler `/api/health`, `/`, `/carte` et une fiche événement.
8. Activer les déploiements automatiques uniquement après la réussite du premier déploiement manuel.

La clé Supabase secrète ne doit jamais être déclarée comme variable de build publique. Le conteneur final fonctionne sous un utilisateur non privilégié et utilise la sortie Next.js `standalone`.

## 4. Traiter les demandes et paiements externes

Le formulaire `/acheter/[slug]` enregistre une demande professionnelle privée dans `export_requests`. La table n'expose aucune politique RLS publique.

Lister les demandes, avec les courriels masqués par défaut :

```bash
.venv/bin/python scripts/admin/list_export_requests.py
```

Après échange commercial et confirmation du paiement externe, générer le ZIP et son PDF, l'envoyer dans Storage, créer la commande payée et produire un lien valable sept jours :

```bash
.venv/bin/python scripts/admin/fulfill_external_order.py \
  --request UUID_DEMANDE \
  --payment-reference FACTURE-2026-001 \
  --amount-total-cents 17880
```

La commande affiche le lien une seule fois dans sa sortie. Transmettre ce lien au client par le canal choisi. La base conserve uniquement son hash. Une demande livrée ne peut pas être livrée une seconde fois et chaque référence de paiement externe est unique.

## 5. Réactiver Stripe plus tard

1. Créer le produit et le prix dans Stripe.
2. Configurer `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_INCIDENT_EXPORT` et `DOWNLOAD_TOKEN_SECRET`.
3. Déclarer `/api/stripe/webhook` pour `checkout.session.completed` et `checkout.session.async_payment_succeeded`.
4. Tester le parcours complet en mode test.
5. Passer `SALES_MODE=stripe` dans Coolify et redéployer.

En mode `contact`, les routes Checkout et webhook Stripe répondent `404`, même si d'anciennes variables Stripe sont encore présentes.

## 6. Vérifications avant ouverture

```bash
npm ci
npm run check
npm run build
npm run smoke:web
.venv/bin/ruff check scripts tests/etl
.venv/bin/pytest --cov=scripts --cov-fail-under=80
docker build -t yakisugi:local .
```

Contrôler ensuite : certificat HTTPS, redirections, rendu mobile, fond de carte, formulaire de contact, absence de secrets dans le bundle, bucket privé, lien temporaire, ZIP et PDF, événements analytics agrégés, mentions légales et politique de confidentialité.

## Retour arrière

Dans Coolify, redéployer l'image ou le commit antérieur. Une publication de données se désactive en repassant l'incident à `draft`. Une livraison se révoque en expirant la commande ou en passant son statut hors de `paid`. Une restauration de base doit suivre la procédure Supabase avant toute migration corrective.
