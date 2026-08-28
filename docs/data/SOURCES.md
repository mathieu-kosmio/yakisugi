# Sources de données

## IGN BD Forêt version 2

Références officielles :

- [Inventaire forestier IGN](https://geoservices.ign.fr/inventaire-forestier)
- [Descriptif de livraison BD Forêt version 2](https://geoservices.ign.fr/sites/default/files/2021-06/DL_BDForet_2-0.pdf)

Le descriptif de livraison indique une organisation par département et un format standard Shapefile. Le script accepte les formats lus par GeoPandas et impose le code département au moment de l'import.

Le mapping normalisé utilise par défaut `ID`, `CODE_TFV` et `TFV`. Les options `--id-column`, `--type-code-column` et `--type-label-column` permettent d'adapter un autre millésime. L'essence dominante reste `null` par défaut. Elle est importée uniquement lorsque l'opérateur fournit une colonne vérifiée avec `--species-column`.

Chaque exécution doit recevoir l'URL exacte de la ressource importée avec `--source-url`. La date de source peut être précisée avec `--source-date`.

## Plan cadastral informatisé

Référence officielle : [Plan cadastral informatisé](https://cadastre.data.gouv.fr/datasets/plan-cadastral-informatise).

La page officielle décrit le PCI Vecteur, son organisation par communes, sections et feuilles, ainsi que les téléchargements directs par feuille ou département. Les livraisons courantes sont proposées en EDIGÉO et DXF-PCI.

Le script Yakisugi importe une couche de parcelles vectorielle préalablement extraite dans un format lisible par GeoPandas. Ses colonnes par défaut suivent la fixture GeoJSON : `id`, `commune`, `section` et `numero`. Elles sont configurables en ligne de commande. Le nom de commune doit provenir d'une colonne vérifiée ou être fourni explicitement. La surface est recalculée depuis la géométrie normalisée et enregistrée comme donnée calculée.

## INSEE SIRENE et géocodage Géoplateforme

Références officielles :

- [Consulter et télécharger la base SIRENE](https://www.insee.fr/fr/information/3591226)
- [Actualités SIRENE et NAF 2025](https://www.insee.fr/fr/information/9019311)
- [API de géocodage Géoplateforme](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/)

L'import utilise `etatAdministratifEtablissement` et `activitePrincipaleEtablissement`. Pendant 2026, la sélection métier reste fondée sur les codes APE courants. La configuration versionnée est `config/industry-categories.json`.

`scripts/prepare_sirene_stock.py` lit en flux les fichiers stock des établissements et des unités légales, puis produit le sous-ensemble normalisé attendu par l'import. Les filtres portent sur l'état actif, les départements explicitement demandés et la table de catégories APE. Le nom d'une personne physique n'est jamais reconstitué depuis les champs nom et prénom.

`scripts/prepare_sirene_annuaire.py` traite une liste ciblée produite par le générateur officiel de l'Annuaire des Entreprises. Il contrôle à nouveau l'état actif, le département et les codes APE, convertit les coordonnées Lambert-93 en WGS84 et produit un manifeste avec les checksums et compteurs. Une unité dépourvue de raison sociale et d'enseigne reçoit un libellé neutre fondé sur son SIRET. Ce libellé est une valeur calculée de présentation, comptée séparément dans le manifeste.

Une coordonnée présente dans la source est contrôlée puis mise en cache. Une adresse sans coordonnée consulte d'abord le cache local. L'option explicite `--geocode-missing` autorise ensuite l'appel hors ligne de l'application à `https://data.geopf.fr/geocodage/search`. Seul le premier résultat de l'index `address` est retenu, avec un score minimal configurable de 0,5. Les adresses non résolues sont comptées et exclues de l'import.
