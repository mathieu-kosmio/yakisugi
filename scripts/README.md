# ETL géospatial

Les scripts Python préparent les données hors ligne avant publication. Ils n'effectuent aucun appel lors de l'affichage d'une page.

## Ordre cible

1. `import_incident.py`
2. `import_forest.py`
3. `process_forests.py`
4. `import_parcels.py`
5. `process_parcels.py`
6. `prepare_sirene_stock.py`
7. `import_industries.py`
8. `calculate_distances.py`
9. `generate_export.py`

Chaque commande propose un mode `--dry-run`, écrit un journal structuré, refuse les géométries invalides non réparables et produit un résumé des lignes lues, réparées, insérées ou mises à jour.

## Import d'un incident

`import_incident.py` est implémenté. Il :

1. lit le fichier avec GeoPandas ;
2. refuse les entités vides ou non polygonales ;
3. répare les polygones invalides lorsque Shapely le permet ;
4. convertit les coordonnées en EPSG:4326 ;
5. dissout les surfaces en un `MultiPolygon` ;
6. calcule une superficie géodésique en hectares ;
7. insère ou met à jour l'incident et sa provenance dans une transaction PostgreSQL.

Exemple de validation locale :

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

La date de départ et l'URL source sont obligatoires afin de respecter le schéma de provenance sans inventer de valeur. Hors simulation, fournir `DATABASE_URL` ou `--database-url`.

## Import et traitement des forêts

La première commande normalise les champs sources et remplace transactionnellement les peuplements bruts d'un département :

```bash
.venv/bin/python scripts/import_forest.py \
  --file fixtures/forest.geojson \
  --department 33 \
  --source-url local://fixtures/forest.geojson \
  --dry-run
```

Les colonnes par défaut sont `ID`, `CODE_TFV` et `TFV`. Une essence dominante reste `null` tant qu'une colonne vérifiée n'est pas fournie avec `--species-column`.

Après import en base, l'intersection avec un incident est calculée hors ligne :

```bash
.venv/bin/python scripts/process_forests.py --incident EMSR899
```

Le traitement remplace les résultats de l'incident dans une transaction et calcule seulement `area_ha` et `affected_ratio`. Il ne produit aucune estimation de volume.

## Import et traitement des parcelles

La commande suivante normalise une couche parcellaire déjà extraite dans un format lisible par GeoPandas :

```bash
.venv/bin/python scripts/import_parcels.py \
  --file fixtures/parcels.geojson \
  --source-url local://fixtures/parcels.geojson \
  --commune-name-column commune_name \
  --dry-run
```

Les colonnes `id`, `commune`, `section` et `numero` sont utilisées par défaut et restent configurables. Le libellé de commune doit être fourni par une colonne vérifiée ou avec `--commune-name`.

Après les imports incident, forêt et parcelles :

```bash
.venv/bin/python scripts/process_parcels.py --incident EMSR899
```

Cette commande calcule les surfaces touchées, la couverture forestière, l'essence dominante disponible et les compositions. Les résultats sont remplacés dans une transaction. Les champs de volume restent `null`.

## Import des établissements industriels

La sélection des codes APE se trouve dans `config/industry-categories.json`. Le fichier d'entrée CSV ou JSON doit exposer les champs SIRENE normalisés utilisés par la fixture.

Pour une extraction ciblée, utiliser le générateur officiel de listes SIRENE de l'Annuaire des Entreprises avec les départements et codes APE souhaités, puis normaliser le CSV téléchargé :

```bash
.venv/bin/python scripts/prepare_sirene_annuaire.py \
  --file data/sirene/raw/annuaire-des-entreprises-etablissements-2026-08-24.csv \
  --categories config/industry-categories.json \
  --department 33 \
  --department 40 \
  --output data/sirene/yakisugi-industries.csv \
  --manifest data/sirene/manifest.json \
  --retrieved-at 2026-08-24 \
  --geocoding-cache data/sirene/geocoding-cache.json \
  --geocode-missing
```

Le préparateur convertit les coordonnées Lambert-93 de l'Insee en WGS84. Lorsqu'une unité ne possède aucune raison sociale ou enseigne publiable, il utilise le libellé neutre `Établissement SIRENE <SIRET>` sans reconstituer le nom d'une personne. Le manifeste distingue les coordonnées sources, celles issues du cache, celles obtenues par géocodage et les absences restantes.

Pour un traitement national, les deux fichiers stock officiels SIRENE peuvent aussi être réduits aux départements et codes APE utiles :

```bash
.venv/bin/python scripts/prepare_sirene_stock.py \
  --establishments data/sirene/StockEtablissement_utf8.csv \
  --legal-units data/sirene/StockUniteLegale_utf8.csv \
  --categories config/industry-categories.json \
  --department 33 \
  --department 40 \
  --output data/sirene/yakisugi-industries.csv
```

```bash
.venv/bin/python scripts/import_industries.py \
  --file data/sirene/yakisugi-industries.csv \
  --categories config/industry-categories.json \
  --geocoding-cache data/geocoding-cache.json \
  --source-url URL_EXACTE_DU_MILLESIME_SIRENE \
  --dry-run
```

Les coordonnées sources sont validées et alimentent le cache local. Pour résoudre les seules adresses absentes du cache avec l'API Géoplateforme, ajouter `--geocode-missing`. Cette option intervient uniquement pendant l'ETL. L'application web ne géocode aucun établissement.

## Calcul des distances

Après l'import des établissements, les proximités sont pré-calculées hors ligne :

```bash
.venv/bin/python scripts/calculate_distances.py --incident EMSR899
```

La commande conserve les sites situés dans un rayon de 200 km, calcule une distance géodésique à vol d'oiseau et affecte les bandes `0_25`, `25_50`, `50_100` ou `100_200`.

## Génération d'un export professionnel

Après tous les traitements, l'archive complète est générée depuis les géométries PostGIS non simplifiées :

```bash
.venv/bin/python scripts/exports/generate_export.py \
  --incident EMSR899 \
  --output-directory exports \
  --upload
```

Le ZIP contient `README.pdf`, `parcelles.csv`, `parcelles.geojson`, `industriels.csv`, `statistiques.csv` et `methodology.txt`. Son checksum SHA-256 est enregistré dans la table `exports`. La même donnée d'entrée produit la même archive. Les volumes sont laissés vides en l'absence de coefficients documentés et validés. L'option `--upload` envoie l'archive dans le bucket Storage privé configuré par `YAKISUGI_EXPORT_BUCKET` avec la clé de service côté ETL.

Le mode `--dry-run` valide la présence de l'incident et compte les lignes sans créer de fichier :

```bash
.venv/bin/python scripts/exports/generate_export.py \
  --incident EMSR899 \
  --dry-run
```

## Chargement du snapshot réel EMSR899

Les commandes ci-dessous utilisent les fichiers contrôlés le 28 août 2026. `DATABASE_URL` doit rester dans `.env.local` ou dans le gestionnaire de secrets du runner.

```bash
set -a
source .env.local
set +a

.venv/bin/python scripts/import_incident.py \
  --file data/incidents/EMSR899/observed-event.json \
  --name "Incendie du Porge et de Lacanau 2026" \
  --external-id EMSR899 \
  --start-date 2026-07-22 \
  --source-url https://mapping.emergency.copernicus.eu/activations/EMSR899/ \
  --source-date 2026-07-30 \
  --department-codes 33

.venv/bin/python scripts/import_forest.py \
  --file data/forest/bdforet-v2-emsr899-bbox.json \
  --department 33 \
  --source-url "https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
  --source-date 2026-05-13 \
  --id-column id \
  --type-code-column code_tfv \
  --type-label-column tfv \
  --species-column essence

.venv/bin/python scripts/process_forests.py --incident EMSR899

.venv/bin/python scripts/import_parcels.py \
  --file data/cadastre/cadastre-emsr899-parcelles.gpkg \
  --source-url https://cadastre.data.gouv.fr/data/etalab-cadastre/2026-06-01/geojson/communes \
  --source-date 2026-06-01 \
  --commune-name-column commune_name

.venv/bin/python scripts/process_parcels.py --incident EMSR899

.venv/bin/python scripts/import_industries.py \
  --file data/sirene/yakisugi-industries.csv \
  --geocoding-cache data/sirene/geocoding-cache.json \
  --source-url https://annuaire-entreprises.data.gouv.fr/export-sirene \
  --source-date 2026-08-24

.venv/bin/python scripts/calculate_distances.py --incident EMSR899
```

Après contrôle des compteurs et des géométries, publier l'incident avec une requête SQL exécutée depuis un client de confiance :

```sql
update public.incidents
set status = 'published', updated_at = now()
where external_id = 'EMSR899';
```
