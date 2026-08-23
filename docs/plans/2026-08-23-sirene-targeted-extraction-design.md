# Extraction SIRENE ciblée pour Yakisugi

Date de validation : 23 août 2026

## Objectif

Produire un fichier d'établissements industriels directement importable par Yakisugi, sans télécharger les stocks SIRENE nationaux. L'extraction couvre les établissements actifs de Gironde et des Landes correspondant aux codes APE configurés dans `config/industry-categories.json`.

## Source et périmètre

La source est le générateur officiel de listes SIRENE de l'Annuaire des Entreprises : `https://annuaire-entreprises.data.gouv.fr/export-sirene`.

Filtres :

- état administratif actif ;
- départements `33` et `40` ;
- codes APE `02.20Z`, `16.10A`, `16.10B`, `16.21Z`, `16.23Z`, `16.24Z` et `46.73A`.

Le fichier brut est conservé sous `data/sirene/raw/`, hors Git. Un manifeste enregistre l'URL source, la date de récupération, les filtres, le checksum SHA-256 et les compteurs de transformation.

## Transformation

Un script dédié lit le CSV de l'Annuaire, détecte son séparateur et valide son schéma. Il produit le contrat attendu par `scripts/import_industries.py` : SIRET, SIREN, raison sociale, enseigne, état administratif, code APE, adresse, code postal, commune, longitude et latitude.

Seuls les champs nécessaires au MVP sont conservés. Le script ne reconstitue aucun nom de personne physique et ignore les coordonnées incomplètes ou invalides. Les coordonnées absentes restent vides et pourront être résolues par le cache puis par l'API Géoplateforme pendant l'ETL.

## Contrôles et erreurs

La préparation échoue si le schéma requis est absent, si un SIRET est dupliqué, ou si une ligne sort du périmètre demandé. Le manifeste distingue les lignes lues, retenues, rejetées, sans adresse et sans coordonnées. Les contrôles vérifient le format des SIRET, l'état actif, les départements, les codes APE et les bornes géographiques.

## Vérification

Les tests unitaires couvrent la correspondance de schéma, les filtres, la confidentialité, les doublons, les coordonnées et le manifeste. La sortie réelle est ensuite validée avec `scripts/import_industries.py --dry-run`. Aucune écriture PostGIS n'est réalisée dans cette tâche.
