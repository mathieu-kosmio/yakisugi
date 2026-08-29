# Sources de données

## IGN BD Forêt version 2

Références officielles :

- [Inventaire forestier IGN](https://geoservices.ign.fr/inventaire-forestier)
- [Descriptif de livraison BD Forêt version 2](https://geoservices.ign.fr/sites/default/files/2021-06/DL_BDForet_2-0.pdf)

Le descriptif de livraison indique une organisation par département et un format standard Shapefile. Le script accepte les formats lus par GeoPandas et impose le code département au moment de l'import.

Le mapping normalisé utilise par défaut `ID`, `CODE_TFV` et `TFV`. Les options `--id-column`, `--type-code-column` et `--type-label-column` permettent d'adapter un autre millésime. L'essence dominante reste `null` par défaut. Elle est importée uniquement lorsque l'opérateur fournit une colonne vérifiée avec `--species-column`.

Chaque exécution doit recevoir l'URL exacte de la ressource importée avec `--source-url`. La date de source peut être précisée avec `--source-date`.

### Extraction réelle EMSR899

Le 28 août 2026, la couche `LANDCOVER.FORESTINVENTORY.V2:formation_vegetale` a été extraite depuis le [WFS public de la Géoplateforme](https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities) sur l'emprise de l'incendie EMSR899. Le fichier préparé contient 3 615 formations valides, avec les champs sources `id`, `code_tfv`, `tfv` et `essence`. Le checksum SHA-256 du GeoJSON est `9cab5df10432b4b085b24f2630ecc175c11ba1c18e6a126df6c74c7dd600049b`.

## Plan cadastral informatisé

Référence officielle : [Plan cadastral informatisé](https://cadastre.data.gouv.fr/datasets/plan-cadastral-informatise).

La page officielle décrit le PCI Vecteur, son organisation par communes, sections et feuilles, ainsi que les téléchargements directs par feuille ou département. Les livraisons courantes sont proposées en EDIGÉO et DXF-PCI.

Le script Yakisugi importe une couche de parcelles vectorielle préalablement extraite dans un format lisible par GeoPandas. Ses colonnes par défaut suivent la fixture GeoJSON : `id`, `commune`, `section` et `numero`. Elles sont configurables en ligne de commande. Le nom de commune doit provenir d'une colonne vérifiée ou être fourni explicitement. La surface est recalculée depuis la géométrie normalisée et enregistrée comme donnée calculée.

### Extraction réelle EMSR899

Le millésime Etalab du 1er juin 2026 a été téléchargé par commune depuis [cadastre.data.gouv.fr](https://cadastre.data.gouv.fr/data/etalab-cadastre/2026-06-01/geojson/communes). Dix-sept archives communales couvrent l'emprise Copernicus. La sélection spatiale conserve 11 790 parcelles entières intersectant le périmètre brûlé, réparties dans 15 communes. Toutes les géométries sont valides en EPSG:4326. Le GeoPackage préparé porte le checksum SHA-256 `e4eb7ceb97e661a802390b1b076da7bfbd45465a9d4338496d7a025475c35755`.

## Copernicus Emergency Management Service

Référence officielle : [activation EMSR899](https://mapping.emergency.copernicus.eu/activations/EMSR899/).

Le produit final de délinéation `DEL_MONIT02`, livré le 30 juillet 2026, constitue la source du périmètre. Les 1 832 polygones `observedEventA_v1`, tous classés `Burnt area`, sont valides et produisent après dissolution une surface géodésique calculée de 31 602,37 ha. Le checksum SHA-256 de l'archive officielle est `6a3c3bc24c91f56ca44486a17a5c279add2213bdb0bad9c6925d09212735e672`. Le GeoJSON préparé porte le checksum `17118036ebebcc3d1cb1f45a3b03a54d9667482dcd71e5420d37d47933ee905e`.

## INSEE SIRENE et géocodage Géoplateforme

Références officielles :

- [Consulter et télécharger la base SIRENE](https://www.insee.fr/fr/information/3591226)
- [Actualités SIRENE et NAF 2025](https://www.insee.fr/fr/information/9019311)
- [API de géocodage Géoplateforme](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/)

L'import utilise `etatAdministratifEtablissement` et `activitePrincipaleEtablissement`. Pendant 2026, la sélection métier reste fondée sur les codes APE courants. La configuration versionnée est `config/industry-categories.json`.

`scripts/prepare_sirene_stock.py` lit en flux les fichiers stock des établissements et des unités légales, puis produit le sous-ensemble normalisé attendu par l'import. Les filtres portent sur l'état actif, les départements explicitement demandés et la table de catégories APE. Le nom d'une personne physique n'est jamais reconstitué depuis les champs nom et prénom.

`scripts/prepare_sirene_annuaire.py` traite une liste ciblée produite par le générateur officiel de l'Annuaire des Entreprises. Il contrôle à nouveau l'état actif, le département et les codes APE, convertit les coordonnées Lambert-93 en WGS84 et produit un manifeste avec les checksums et compteurs. Une unité dépourvue de raison sociale et d'enseigne reçoit un libellé neutre fondé sur son SIRET. Ce libellé est une valeur calculée de présentation, comptée séparément dans le manifeste.

Une coordonnée présente dans la source est contrôlée puis mise en cache. Une adresse sans coordonnée consulte d'abord le cache local. L'option explicite `--geocode-missing` autorise ensuite l'appel hors ligne de l'application à `https://data.geopf.fr/geocodage/search`. Seul le premier résultat de l'index `address` est retenu, avec un score minimal configurable de 0,5. Les adresses non résolues sont comptées et exclues de l'import.

### Extraction réelle EMSR899

Le fichier normalisé du 24 août 2026 contient 2 019 établissements actifs et géolocalisés sur les départements 33 et 40 pour les sept codes APE configurés. Quatre-vingt-cinq établissements sans coordonnées résolues sont exclus. Le CSV préparé porte le checksum SHA-256 `311886c9f6d75c0432b90bb9e3145cf04b064c53d3da51e7f17bed86dee5f0e8`.
