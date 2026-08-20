# Bois Sinistré Radar
## Spécification fonctionnelle et technique du MVP

**Version :** 1.0  
**Date :** 20 août 2026  
**Objectif de réalisation :** 5 jours ouvrés  
**Type de produit :** application web cartographique + produit data payant  
**Territoire MVP :** Gironde / Landes, incendies 2026  
**Principe directeur :** transformer des données publiques dispersées en une information opérationnelle immédiatement exploitable par les professionnels de la filière bois.

# 1. Vision produit

Bois Sinistré Radar est un service d'intelligence territoriale permettant d'identifier les zones forestières touchées par un sinistre, de caractériser la ressource forestière potentiellement affectée et d'identifier les débouchés industriels situés à proximité.

La première version doit répondre à une question très simple :

> Où se trouvent les ressources forestières potentiellement sinistrées, quelle est leur nature, quels volumes indicatifs représentent-elles et quels acteurs industriels pourraient potentiellement les valoriser ?

Le produit ne cherche pas à fournir un inventaire forestier précis ni à organiser directement la vente du bois.

Il agrège et enrichit des données ouvertes afin de produire une **information de prospection, de planification et d'aide à la décision**.

# 2. Proposition de valeur

Pour un exploitant forestier, négociant, scieur, industriel ou transporteur :

> Identifier rapidement les concentrations importantes de bois potentiellement mobilisables à la suite d'un incendie.

Le produit doit éviter plusieurs heures ou plusieurs jours de :

- recherche de données ;
- téléchargement de fichiers SIG ;
- manipulation QGIS ;
- croisement de sources ;
- identification des parcelles ;
- identification des essences ;
- recherche des industriels ;
- calcul de distances ;
- constitution de fichiers de prospection.

# 3. Hypothèse commerciale

Le MVP sert simultanément :

1. de produit data directement monétisable ;
2. de démonstrateur pour la filière bois ;
3. de générateur de leads ;
4. de socle pour un futur outil de pilotage des ressources forestières.

## Offre gratuite

Accès à :

- la carte ;
- la localisation des zones sinistrées ;
- quelques statistiques agrégées ;
- une sélection limitée des données ;
- la liste agrégée des débouchés industriels.

## Offre payante MVP

### Export professionnel par événement ou territoire

Prix initial recommandé :

**149 € HT**

Contenu :

- CSV parcellaire ;
- GeoJSON ;
- synthèse Excel éventuelle ;
- fiche méthodologique ;
- liste des établissements industriels ;
- indicateurs calculés.

À terme :

**49 à 99 € HT/mois** pour un abonnement de veille.

# 4. Positionnement juridique et méthodologique

Le service ne doit jamais présenter les volumes comme des volumes réels constatés.

Employer systématiquement les termes :

- volume potentiel ;
- estimation indicative ;
- ressource théorique ;
- ressource potentiellement affectée ;
- ordre de grandeur.

Afficher :

> Les estimations sont calculées automatiquement à partir de données géographiques et forestières publiques. Elles ne constituent ni un inventaire forestier ni une expertise de terrain. Les volumes, qualités et possibilités de mobilisation doivent être vérifiés avant toute décision opérationnelle.

# 5. Sources de données

## 5.1 Incendies

### Source principale

Copernicus Emergency Management Service — Rapid Mapping.

Copernicus EMS a par exemple activé EMSR899 pour l'incendie de Saumos le 22 juillet 2026 afin de produire des cartes d'étendue et d'évaluation des dommages.

### Données utilisées

Pour chaque événement :

- identifiant Copernicus ;
- nom ;
- date ;
- polygone de l'événement ;
- éventuellement classes de dommages ;
- date de production ;
- URL source.

### MVP

**Pas d'intégration automatisée à Copernicus.**

L'administrateur télécharge le GeoJSON / Shapefile correspondant et exécute un script d'import.

Raison :

- beaucoup moins de développement ;
- les incendies majeurs sont peu nombreux ;
- automatiser la découverte n'apporte aucune valeur commerciale au MVP.

---

# 5.2 Peuplements forestiers

## Source

BD Forêt IGN.

Données souhaitées :

- géométrie ;
- type de formation végétale ;
- essence dominante ;
- composition ;
- code de formation ;
- millésime.

Le système importe uniquement les départements concernés.

### Traitement

Intersection :

`zone incendiée ∩ BD Forêt`

Résultat :

- surface forestière touchée ;
- répartition par essence ;
- proportion de chaque essence ;
- surface par type de peuplement.

---

# 5.3 Cadastre

Utiliser prioritairement **API Carto – Cadastre** de l'IGN.

L'API fournit notamment les géométries des parcelles ou des communes en JSON/GeoJSON et travaille en WGS84.

Une API Cadastre ouverte existe également sur data.gouv.fr.

### Informations conservées

- code INSEE commune ;
- section ;
- numéro de parcelle ;
- identifiant parcellaire reconstruit ;
- géométrie ;
- superficie cadastrale ;
- superficie intersectant l'incendie ;
- taux de surface touchée.

### Important

Aucune tentative d'identification du propriétaire dans le MVP.

---

# 5.4 Entreprises et établissements

## Source

SIRENE / INSEE.

L'API SIRENE permet d'interroger les données d'entreprises et établissements ; l'INSEE indique que les données sont mises à jour quotidiennement.

En 2026, conserver les codes APE actuellement officiels. La NAF 2025 n'entrera officiellement en vigueur qu'au 1er janvier 2027.

### Codes métiers configurables

Première sélection :

- `02.20Z` — exploitation forestière ;
- `16.10A` — sciage et rabotage du bois ;
- `16.10B` — imprégnation du bois ;
- `16.21Z` — fabrication de placage et panneaux ;
- `16.23Z` — charpentes et menuiseries ;
- `16.24Z` — emballages en bois ;
- `46.73A` — commerce de gros de bois et matériaux.

La liste doit être stockée en configuration et jamais codée en dur dans le front-end.

### Données enregistrées

- SIRET ;
- SIREN ;
- raison sociale ;
- enseigne ;
- code APE ;
- libellé métier interne ;
- adresse ;
- code postal ;
- commune ;
- longitude ;
- latitude ;
- état administratif.

Ne conserver que les établissements actifs.

---

# 5.5 Géocodage

Si SIRENE ne fournit pas de coordonnées directement exploitables, utiliser l'API de géocodage IGN Géoplateforme.

L'API est ouverte et autorise actuellement jusqu'à 50 requêtes par seconde et par adresse IP.

Les coordonnées sont stockées localement.

**Ne jamais géocoder dynamiquement les établissements à chaque affichage.**

# 6. Architecture fonctionnelle

Le système comprend quatre composants.

```text
DONNÉES PUBLIQUES
       │
       ▼
PIPELINE ETL
Python / GeoPandas
       │
       ▼
POSTGRES + POSTGIS
Supabase
       │
       ├──────────────┐
       ▼              ▼
API NEXT.JS      EXPORT ENGINE
       │              │
       ▼              ▼
APPLICATION       CSV / GeoJSON
CARTOGRAPHIQUE
```

# 7. Stack technique imposée pour le MVP

## Front-end

- Next.js ;
- TypeScript ;
- React ;
- Tailwind CSS ;
- MapLibre GL JS.

Alternative acceptable :

- Leaflet.

Préférence : **MapLibre GL**.

## Back-end

Next.js Route Handlers.

Pas de microservices.

## Base de données

Supabase :

- PostgreSQL ;
- PostGIS ;
- Storage.

## ETL géospatial

Python :

- GeoPandas ;
- Shapely ;
- PyProj ;
- Pandas ;
- psycopg / Supabase client.

## Paiement

Stripe Checkout.

## Déploiement

- Vercel : application ;
- Supabase : données ;
- GitHub : dépôt.

# 8. Principe architectural important

Le front-end **ne réalise aucun traitement SIG complexe**.

Toutes les intersections doivent être précalculées.

Donc :

```text
Copernicus
+
BD Forêt
+
Cadastre
+
SIRENE

        ↓

traitement offline

        ↓

tables optimisées

        ↓

consultation rapide
```

Objectif :

**< 1 seconde** pour afficher les indicateurs d'une zone déjà calculée.

# 9. Entités métier

## 9.1 Incident

Représente un événement forestier.

```typescript
Incident {
  id: UUID
  slug: string
  name: string
  type: "wildfire"
  external_id?: string
  start_date: date
  end_date?: date
  department_codes: string[]
  source_name: string
  source_url: string
  source_date?: date
  geometry: MultiPolygon
  area_ha: number
  status: "draft" | "published"
  created_at: timestamp
}
```

Exemple :

```text
name = "Incendie de Saumos 2026"
external_id = "EMSR899"
```

# 9.2 Peuplement forestier affecté

```typescript
AffectedForest {
  id: UUID
  incident_id: UUID
  forest_source_id: string
  forest_type_code?: string
  forest_type_label: string
  dominant_species?: string
  area_ha: number
  affected_ratio?: number
  geometry: MultiPolygon
}
```

# 9.3 Parcelle affectée

```typescript
AffectedParcel {
  id: UUID
  incident_id: UUID

  insee_code: string
  commune_name: string

  section: string
  parcel_number: string
  parcel_uid: string

  parcel_area_ha: number
  affected_area_ha: number
  affected_ratio: number

  forest_area_ha: number

  dominant_species?: string

  estimated_volume_min_m3?: number
  estimated_volume_max_m3?: number

  confidence: "low" | "medium" | "high"

  geometry: MultiPolygon
  centroid: Point
}
```

# 9.4 Composition forestière parcellaire

Une parcelle peut comporter plusieurs peuplements.

```typescript
ParcelForestComposition {
  id: UUID
  parcel_id: UUID

  forest_type: string
  species: string

  area_ha: number
  percentage: number
}
```

# 9.5 Site industriel

```typescript
IndustrialSite {
  id: UUID

  siret: string
  siren: string

  company_name: string
  trade_name?: string

  naf_code: string
  category: IndustryCategory

  address: string
  postal_code: string
  commune: string

  latitude: number
  longitude: number

  active: boolean
}
```

## Catégories internes

```typescript
type IndustryCategory =
 | "FORESTRY"
 | "SAWMILL"
 | "PANELS"
 | "PACKAGING"
 | "WOOD_TRADING"
 | "WOOD_ENERGY"
 | "OTHER";
```

# 9.6 Distance zone / industriel

```typescript
IncidentIndustrialSite {
  incident_id: UUID
  industrial_site_id: UUID

  distance_km: number

  distance_band:
    | "0_25"
    | "25_50"
    | "50_100"
    | "100_150"
    | "150_PLUS"
}
```

Pour le MVP :

**distance géodésique à vol d'oiseau.**

Ne pas implémenter de routage routier.

# 10. Schéma PostgreSQL simplifié

Activer :

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Tables principales :

```text
incidents
affected_forests
affected_parcels
parcel_forest_compositions
industrial_sites
incident_industrial_sites
volume_coefficients
data_sources
exports
orders
```

Tous les champs géographiques doivent utiliser :

```text
geometry(..., 4326)
```

Créer des index GIST :

```sql
CREATE INDEX incidents_geom_idx
ON incidents USING GIST (geometry);

CREATE INDEX parcels_geom_idx
ON affected_parcels USING GIST (geometry);

CREATE INDEX industry_location_idx
ON industrial_sites USING GIST (location);
```

# 11. Estimation des volumes

## Principe

La première version utilise :

```text
volume potentiel =
surface forestière affectée
×
coefficient m³/ha
```

Mais les coefficients sont configurables.

Table :

```typescript
VolumeCoefficient {
  id: UUID
  species_code: string
  species_label: string

  min_m3_per_ha: number
  max_m3_per_ha: number

  region?: string

  source?: string
  notes?: string
}
```

Exemple conceptuel :

```text
Pin maritime
minimum = X m³ / ha
maximum = Y m³ / ha
```

Les valeurs réelles devront être documentées avant publication.

**Codex ne doit jamais inventer les coefficients.**

Si aucun coefficient validé n'est disponible :

```text
estimated_volume_min_m3 = null
estimated_volume_max_m3 = null
```

Le front affiche :

> Volume non estimé.

# 12. Niveau de confiance

Ajouter un indicateur simple.

### HIGH

- parcelle clairement intersectée ;
- peuplement forestier identifié ;
- coefficient documenté ;
- données récentes.

### MEDIUM

- peuplement identifié ;
- données forestières plus anciennes ;
- volume issu d'une hypothèse générique.

### LOW

- faible intersection ;
- essence incertaine ;
- information forestière insuffisante.

Le score ne doit pas prétendre exprimer une probabilité statistique.

# 13. Pipeline ETL

Créer :

```text
/scripts
```

avec les commandes suivantes.

## 13.1 Import d'un incident

```bash
python scripts/import_incident.py \
  --file data/emsr899.geojson \
  --name "Saumos 2026" \
  --external-id EMSR899
```

Actions :

1. lecture GeoJSON ;
2. contrôle géométrie ;
3. conversion EPSG:4326 ;
4. dissolution éventuelle ;
5. calcul superficie ;
6. insertion en base.

# 13.2 Import BD Forêt

```bash
python scripts/import_forest.py \
  --file data/bdforet_33.gpkg \
  --department 33
```

Actions :

- normalisation ;
- reprojection ;
- mapping des colonnes IGN ;
- stockage.

Une table intermédiaire `forest_raw` peut être utilisée.

# 13.3 Intersection forêt / incendie

```bash
python scripts/process_forests.py \
  --incident EMSR899
```

Algorithme :

```python
affected = overlay(
    forest,
    incident,
    how="intersection"
)
```

Calcul :

```text
area_ha
species
forest_type
```

# 13.4 Identification des communes

À partir du périmètre de l'incident :

```text
incident
   ↓
communes intersectées
```

Cette liste sert à limiter les appels Cadastre.

# 13.5 Import des parcelles

```bash
python scripts/import_parcels.py \
  --incident EMSR899
```

Pour chaque commune :

1. récupérer les parcelles ;
2. filtrer spatialement ;
3. conserver uniquement celles intersectant l'incendie ;
4. stocker.

# 13.6 Croisement parcelles / forêt

Pour chaque parcelle :

```text
parcelle
∩
zone brûlée
∩
peuplement forestier
```

Calculer :

- surface touchée ;
- surface forestière ;
- essence dominante ;
- composition ;
- volume potentiel.

# 13.7 Import des industriels

```bash
python scripts/import_industries.py
```

Filtrer :

```text
etatAdministratifEtablissement = A
```

et codes NAF configurés.

Limiter géographiquement initialement :

- Nouvelle-Aquitaine ;
- éventuellement Occitanie.

# 13.8 Calcul des proximités

Pour chaque incident :

```sql
ST_DistanceSphere(
    industrial_site.location,
    ST_Centroid(incident.geometry)
)
```

Pré-calculer toutes les distances < 200 km.

# 14. API applicative

Préfixe :

```text
/api/v1
```

# GET /incidents

Retour :

```json
[
  {
    "id": "...",
    "slug": "saumos-2026",
    "name": "Incendie de Saumos 2026",
    "areaHa": 12345,
    "forestAreaHa": 10987,
    "estimatedVolumeMinM3": null,
    "estimatedVolumeMaxM3": null
  }
]
```

# GET /incidents/:slug

Retour :

- informations incident ;
- surfaces ;
- peuplements ;
- volumes ;
- nombre de parcelles ;
- nombre d'industriels par rayon.

# GET /incidents/:slug/parcels

Query :

```text
?species=PIN_MARITIME
&minArea=5
&confidence=medium,high
&page=1
```

# GET /incidents/:slug/industries

Query :

```text
?category=SAWMILL
&maxDistance=100
```

# GET /parcels/:id

Retour :

- identification ;
- géométrie ;
- composition ;
- indicateurs ;
- estimation volume.

# 15. Application web

Structure :

```text
/
├── /
├── /carte
├── /evenements/[slug]
├── /methodologie
├── /acheter/[slug]
└── /download/[token]
```

# 16. Landing page

Objectif :

comprendre le service en moins de 10 secondes.

## Hero

### Titre

**Où se trouve le bois sinistré ?**

### Sous-titre

Cartographiez les peuplements forestiers affectés par les incendies et identifiez les capacités industrielles situées à proximité.

### CTA

**Explorer la carte**

CTA secondaire :

**Télécharger les données**

## Indicateurs

Afficher maximum quatre chiffres :

```text
XX ha
forêt potentiellement affectée

XX %
pin maritime

XXXX
parcelles concernées

XX
sites industriels < 100 km
```

# 17. Carte principale

Route :

```text
/carte
```

La carte occupe environ 70 % de l'écran desktop.

Panneau latéral :

30 %.

## Couches

### Couche 1

Périmètre incendie.

### Couche 2

Peuplements forestiers affectés.

### Couche 3

Parcelles.

Visible uniquement à partir d'un certain niveau de zoom.

### Couche 4

Sites industriels.

# 18. Légende

Exemple :

```text
Forêt affectée

■ Pin maritime
■ Autres résineux
■ Feuillus
■ Mélanges
■ Non identifié

Industrie

● Scierie
● Exploitation
● Panneaux
● Négoce
● Bois énergie
```

# 19. Filtres carte

MVP :

### Incident

Dropdown.

### Essence

Checkboxes.

### Surface touchée

```text
> 1 ha
> 5 ha
> 10 ha
> 25 ha
```

### Industrie

Checkboxes.

### Rayon

```text
25 km
50 km
100 km
150 km
```

Ne pas ajouter d'autres filtres au MVP.

# 20. Interaction parcelle

Au clic :

ouvrir un drawer.

Exemple :

## Parcelle AB 0042

**Saumos – 33680**

```text
Surface cadastrale       7,6 ha
Surface touchée          6,9 ha
Taux affecté             91 %
Surface forestière       6,5 ha

Essence dominante
Pin maritime

Volume potentiel
1 200 – 1 800 m³

Confiance
Moyenne
```

Puis :

### Débouchés proches

```text
6 scieries < 100 km
11 exploitants < 100 km
3 négociants < 100 km
```

CTA :

**Obtenir les données complètes**

# 21. Fiche événement

Exemple :

```text
/evenements/saumos-2026
```

Afficher :

## Incendie de Saumos 2026

### Chiffres clés

```text
Surface totale
Surface forestière
Nombre de parcelles
Essences principales
Volume potentiel
```

### Répartition forestière

Graphique simple :

```text
Pin maritime       78 %
Feuillus            8 %
Mixte               9 %
Autres              5 %
```

### Ressource par commune

Table :

| Commune | Surface forêt | Parcelles | Volume potentiel |
|---|---:|---:|---:|

### Capacités industrielles

```text
< 25 km
< 50 km
< 100 km
< 150 km
```

# 22. Produit payant

CTA :

**Télécharger la base complète — 149 € HT**

Route :

```text
/acheter/saumos-2026
```

Pas de création de compte obligatoire.

Processus :

```text
clic
 ↓
Stripe Checkout
 ↓
paiement
 ↓
webhook
 ↓
création order
 ↓
génération token
 ↓
lien téléchargement
```

# 23. Contenu de l'export

ZIP :

```text
bois-sinistre-saumos-2026.zip
│
├── README.pdf
├── parcelles.csv
├── parcelles.geojson
├── industriels.csv
├── statistiques.csv
└── methodology.txt
```

## parcelles.csv

```text
incident
commune
code_insee
section
numero
surface_parcelle_ha
surface_affectee_ha
ratio_affecte
surface_forestiere_ha
essence_dominante
volume_min_m3
volume_max_m3
niveau_confiance
longitude
latitude
```

## industriels.csv

```text
siret
entreprise
ape
categorie
adresse
commune
distance_incident_km
longitude
latitude
```

# 24. Protection commerciale

L'utilisateur gratuit ne doit pas pouvoir télécharger simplement toute la base via l'API.

Les endpoints publics :

- pagination ;
- géométries simplifiées ;
- nombre maximal de résultats.

Les exports payants :

- géométries complètes ;
- toutes les parcelles ;
- toutes les colonnes.

Ce n'est pas une sécurité absolue contre le scraping.

L'objectif est simplement de rendre l'achat plus simple que la reconstruction de la donnée.

# 25. Pas d'authentification dans le MVP

Décision importante :

**pas de compte utilisateur.**

Pourquoi :

- réduit fortement le temps de développement ;
- évite mot de passe ;
- évite onboarding ;
- Stripe possède déjà l'adresse e-mail client.

Un compte pourra être ajouté avec l'abonnement.

# 26. Administration

Aucune interface admin dans le MVP.

Administration par CLI.

Exemple :

```bash
npm run incident:publish saumos-2026
```

ou script Python :

```bash
python scripts/publish_incident.py EMSR899
```

# 27. Page méthodologie

Route :

```text
/methodologie
```

Elle doit expliquer clairement :

### Sources

- Copernicus EMS ;
- IGN ;
- Cadastre ;
- INSEE SIRENE.

### Calcul

```text
incendie
×
forêt
×
parcelle
```

### Volumes

Estimation par :

```text
surface × coefficient
```

### Limites

- pas d'inventaire terrain ;
- qualité du bois inconnue ;
- état sanitaire non déterminé ;
- exploitabilité non vérifiée ;
- propriété non renseignée ;
- desserte forestière non prise en compte ;
- distances routières non calculées.

# 28. Performance

Objectifs MVP :

### Landing

LCP < 2,5 secondes.

### Carte

premier affichage < 3 secondes.

### API

P95 < 500 ms hors chargement géographique important.

### Parcelles

Ne jamais envoyer plusieurs dizaines de milliers de polygones simultanément.

Utiliser :

- bounding box ;
- zoom ;
- simplification géométrique.

# 29. Simplification géométrique

Créer éventuellement une géométrie d'affichage :

```text
geometry_web
```

générée avec :

```sql
ST_SimplifyPreserveTopology()
```

Conserver :

```text
geometry
```

pour les exports.

# 30. Responsive

## Desktop

Expérience complète.

## Mobile

Priorité :

- carte ;
- indicateurs ;
- fiche parcelle.

Les fonctions complexes peuvent rester desktop-first.

# 31. SEO

Chaque incident possède une page indexable.

Format :

```text
/incendies-foret/saumos-2026
```

Meta-title :

> Incendie Saumos 2026 : carte des forêts et bois affectés

Ces pages constituent potentiellement un canal d'acquisition important.

# 32. Analytics

Installer un analytics simple.

Événements :

```text
map_opened
incident_selected
parcel_clicked
industry_filter_used
export_cta_clicked
checkout_started
purchase_completed
```

Le KPI principal du MVP :

```text
purchase_completed
/
unique_professional_visitors
```

# 33. Critères de réussite commerciale

Ne pas juger le MVP à son trafic.

Après 30 jours :

### Signal faible

aucune demande professionnelle.

→ arrêter ou pivoter.

### Signal intéressant

5+ conversations professionnelles.

### Validation

3+ achats.

### Forte validation

10+ achats ou demande d'accès récurrent.

### Validation stratégique

un acteur souhaite :

- intégrer ses capacités ;
- ajouter ses propres lots ;
- obtenir une API ;
- couvrir d'autres risques ;
- couvrir toute la France.

# 34. Ce qui est explicitement hors périmètre

Codex ne doit PAS implémenter :

- marketplace ;
- enchères ;
- transactions bois ;
- CRM ;
- propriétaires cadastraux ;
- application mobile ;
- notifications ;
- optimisation de tournées ;
- distances routières ;
- calcul précis du stock ;
- classification satellite ;
- IA générative ;
- reconnaissance d'image ;
- prévisions de prix ;
- espace utilisateur ;
- gestion multi-tenant ;
- connecteurs ERP ;
- blockchain ;
- traçabilité lot par lot.

Chaque fonctionnalité ci-dessus est **hors scope MVP**.

# 35. Structure du repository

```text
bois-sinistre-radar/
│
├── app/
│   ├── api/
│   │   └── v1/
│   ├── carte/
│   ├── evenements/
│   │   └── [slug]/
│   ├── acheter/
│   │   └── [slug]/
│   ├── download/
│   │   └── [token]/
│   ├── methodologie/
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── map/
│   ├── incidents/
│   ├── parcels/
│   ├── industries/
│   └── ui/
│
├── lib/
│   ├── db/
│   ├── geo/
│   ├── stripe/
│   └── api/
│
├── scripts/
│   ├── import_incident.py
│   ├── import_forest.py
│   ├── import_parcels.py
│   ├── import_industries.py
│   ├── process_forests.py
│   ├── process_parcels.py
│   ├── calculate_distances.py
│   └── generate_export.py
│
├── supabase/
│   └── migrations/
│
├── data/
│   └── .gitkeep
│
├── docs/
│   ├── DATA_SOURCES.md
│   ├── METHODOLOGY.md
│   └── IMPORT.md
│
├── tests/
│
├── .env.example
├── README.md
└── package.json
```

# 36. Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_INCIDENT_EXPORT=

NEXT_PUBLIC_MAP_STYLE_URL=

INSEE_API_KEY=
```

Ne jamais exposer :

```text
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
INSEE_API_KEY
```

dans le navigateur.

# 37. Tests indispensables

Pas besoin d'une couverture exhaustive.

Tests prioritaires :

## Géospatial

- surface intersection correcte ;
- parcelle hors incendie exclue ;
- parcelle partiellement touchée correctement calculée ;
- CRS correctement converti.

## Volume

- coefficient appliqué correctement ;
- absence de coefficient → null ;
- arrondis cohérents.

## API

- incident inexistant → 404 ;
- filtres parcelle ;
- filtre distance ;
- pagination.

## Paiement

- webhook Stripe valide ;
- webhook invalide refusé ;
- achat → lien téléchargement.

## Export

- CSV valide ;
- GeoJSON valide ;
- export correspondant au bon incident.

# 38. Fixtures

Créer un petit jeu de données fictif permettant à Codex de développer sans attendre les imports réels.

```text
fixtures/
├── incident.geojson
├── forest.geojson
├── parcels.geojson
└── industries.json
```

Au minimum :

- 1 incident ;
- 10 parcelles ;
- 4 peuplements ;
- 10 industries.

C'est indispensable pour découpler :

**développement logiciel**

de :

**préparation des données réelles**.

# 39. Plan d'implémentation sur cinq jours

## Jour 1 — Socle

### Objectif

Afficher un incident avec de fausses données.

Travaux :

- repository ;
- Next.js ;
- Supabase ;
- PostGIS ;
- migrations ;
- fixtures ;
- MapLibre ;
- carte ;
- incident.

Livrable :

**carte fonctionnelle.**

## Jour 2 — Pipeline forêt + parcelles

Travaux :

- import incident ;
- import forêt ;
- intersection ;
- import cadastre ;
- croisement parcellaire ;
- agrégations.

Livrable :

**premières données réelles sur la carte.**

## Jour 3 — Industries + UX

Travaux :

- SIRENE ;
- géocodage ;
- catégories ;
- calcul distances ;
- filtres ;
- fiche parcelle ;
- fiche événement.

Livrable :

**produit utile professionnellement.**

## Jour 4 — Monétisation

Travaux :

- génération CSV ;
- génération GeoJSON ;
- ZIP ;
- Stripe Checkout ;
- webhook ;
- téléchargement sécurisé ;
- landing page.

Livrable :

**produit achetable.**

## Jour 5 — Qualité et lancement

Travaux :

- méthodologie ;
- mentions ;
- performance ;
- SEO ;
- analytics ;
- tests ;
- correction ;
- déploiement ;
- premiers exports.

Livrable :

**MVP public.**

# 40. Priorisation MoSCoW

## MUST

- incident ;
- carte ;
- BD Forêt ;
- parcelles ;
- essences ;
- surfaces ;
- sites industriels ;
- distances ;
- filtres ;
- export CSV ;
- paiement ;
- méthodologie.

## SHOULD

- GeoJSON ;
- graphique répartition ;
- volume indicatif ;
- page SEO événement.

## COULD

- export PDF ;
- rayon dynamique ;
- plusieurs événements.

## WON'T — MVP

- comptes ;
- abonnement ;
- alertes ;
- marketplace ;
- routage ;
- prédictions.

# 41. User stories principales

## US-01 — Explorer un incendie

En tant que professionnel de la filière,

je veux voir la zone incendiée sur une carte,

afin de comprendre l'ampleur géographique du sinistre.

### Acceptance criteria

- polygone visible ;
- nom événement visible ;
- surface affichée.

---

## US-02 — Identifier la forêt concernée

En tant que professionnel,

je veux connaître la composition forestière d'une zone,

afin d'évaluer le type de ressource concerné.

### Acceptance criteria

- surface forestière calculée ;
- essence dominante disponible ;
- répartition par essence.

---

## US-03 — Identifier les parcelles

En tant que professionnel,

je veux visualiser les parcelles forestières concernées,

afin de localiser précisément les concentrations de ressource.

### Acceptance criteria

- parcelles visibles ;
- numéro cadastral ;
- commune ;
- surface ;
- taux affecté.

---

## US-04 — Estimer la ressource

En tant que professionnel,

je veux disposer d'un ordre de grandeur du volume,

afin de prioriser les zones.

### Acceptance criteria

- fourchette uniquement ;
- méthodologie accessible ;
- niveau de confiance ;
- aucune fausse précision.

---

## US-05 — Trouver des industriels

En tant que professionnel,

je veux identifier les établissements proches,

afin d'évaluer les capacités potentielles de valorisation.

### Acceptance criteria

- catégorie ;
- entreprise ;
- localisation ;
- distance.

---

## US-06 — Acheter les données

En tant que professionnel,

je veux télécharger la base,

afin de pouvoir poursuivre mon analyse dans mes outils.

### Acceptance criteria

- paiement ;
- téléchargement ;
- CSV ;
- GeoJSON ;
- documentation.

# 42. Évolution logique du produit

Si le MVP fonctionne, le modèle devient progressivement :

```text
V0
Carte incendie

↓

V1
Radar bois sinistré

↓

V2
Radar événements forestiers

↓

V3
Observatoire dynamique
de la ressource

↓

V4
Matching ressources
↔ capacités industrielles

↓

V5
Pilotage de la mobilisation

↓

V6
Infrastructure numérique
de filière
```

Les événements intégrables ensuite :

- incendie ;
- tempête ;
- scolytes ;
- dépérissement ;
- sécheresse ;
- coupe sanitaire.

La véritable vision produit devient alors :

> **une infrastructure permettant de détecter les variations brutales de disponibilité de la ressource forestière et de les rapprocher des capacités de transformation.**

# 43. Règles de développement pour Codex

Codex doit appliquer systématiquement les règles suivantes.

1. Choisir la solution la plus simple permettant de satisfaire le besoin.

2. Refuser d'introduire une abstraction qui n'est pas nécessaire au MVP.

3. Pas de microservices.

4. Pas de DDD complexe.

5. Pas de système générique d'événements si une table `incidents` suffit.

6. Pas de moteur de workflow.

7. Les traitements SIG lourds sont offline.

8. Les API servent principalement des données précalculées.

9. Tous les calculs métier doivent être testables indépendamment du front-end.

10. Tous les coefficients doivent être configurables.

11. Aucun coefficient métier ne doit être inventé par l'IA.

12. Toute donnée possède une source.

13. Toute estimation possède une méthodologie.

14. Toujours distinguer :
   - donnée source ;
   - donnée calculée ;
   - estimation.

15. Le produit doit pouvoir tourner avec les fixtures sans connexion aux sources externes.

16. Une fonctionnalité non prévue dans ce document ne doit pas être ajoutée sans nécessité technique démontrable.

# 44. Definition of Done du MVP

Le MVP est terminé lorsqu'une personne peut :

1. ouvrir le site ;
2. sélectionner l'incendie de Saumos ;
3. visualiser la zone incendiée ;
4. voir les peuplements forestiers concernés ;
5. voir les parcelles ;
6. cliquer sur une parcelle ;
7. connaître sa surface forestière potentiellement touchée ;
8. connaître son essence dominante ;
9. obtenir éventuellement une fourchette de volume ;
10. visualiser les industriels proches ;
11. filtrer les résultats ;
12. acheter les données ;
13. récupérer un CSV/GeoJSON ;
14. consulter la méthodologie et les limites.

À partir du moment où ces 14 opérations fonctionnent :

> **le MVP doit être considéré comme terminé et mis devant des utilisateurs.**

# 45. Instruction initiale à donner à Codex

Tu peux initialiser le projet avec le prompt suivant :

> Implémente l'application décrite dans `SPEC.md`.
>
> L'objectif est de produire un MVP fonctionnel en cinq jours maximum. La simplicité d'architecture et la rapidité de mise sur le marché priment sur la généricité.
>
> Stack imposée : Next.js, TypeScript, Tailwind, MapLibre, Supabase/PostgreSQL/PostGIS, Python/GeoPandas pour les traitements géospatiaux et Stripe Checkout pour le paiement.
>
> Commence par :
>
> 1. analyser intégralement SPEC.md ;
> 2. produire `IMPLEMENTATION_PLAN.md` ;
> 3. créer les migrations PostgreSQL/PostGIS ;
> 4. créer les fixtures ;
> 5. construire une première tranche verticale fonctionnelle : incident → carte → parcelles → fiche parcelle ;
> 6. ajouter ensuite les imports réels ;
> 7. terminer par les industriels et la monétisation.
>
> Ne développe aucune fonctionnalité explicitement marquée hors périmètre.
>
> Ne crée aucune abstraction sans usage immédiat.
>
> Tous les calculs géospatiaux coûteux doivent être effectués offline et stockés.
>
> N'invente jamais une donnée forestière, un coefficient de volume ou une information provenant d'une source externe. Si une donnée n'est pas disponible, modélise son absence explicitement.
>
> Après chaque étape, exécute les tests, corrige les erreurs et maintiens `IMPLEMENTATION_PLAN.md` avec les tâches réalisées et restantes.
>
> Considère le produit comme terminé dès que la Definition of Done de SPEC.md est satisfaite.