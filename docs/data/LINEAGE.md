# Traçabilité des données

## Catégories

### Donnée source

Valeur reproduite d'une source identifiée, par exemple l'identifiant Copernicus, le code parcellaire, le code APE ou la géométrie IGN. Chaque import conserve le nom, l'URL, la date de source et la date d'import.

### Donnée calculée

Valeur déterministe issue de données sources, par exemple une surface d'intersection, un taux affecté ou une distance géodésique. La méthode et sa version doivent être enregistrées.

### Estimation

Valeur dépendant d'une hypothèse documentée, par exemple un volume potentiel calculé avec une fourchette de coefficients. La source du coefficient, sa région d'application et ses limites doivent être accessibles.

## Règles

- Aucune estimation de volume avec un coefficient absent ou non validé.
- Une donnée manquante reste `null`.
- Le niveau de confiance qualifie la couverture méthodologique et n'exprime pas une probabilité.
- Les géométries complètes restent séparées des géométries web simplifiées.
- Les exports comportent la version de méthodologie et la date de génération.

## Snapshot réel EMSR899 du 28 août 2026

| Jeu | Source | Transformation | Résultat vérifié |
|---|---|---|---|
| Incident | Copernicus EMSR899, `DEL_MONIT02` du 30 juillet 2026 | validation, dissolution et calcul géodésique | 1 832 entités, 31 602,37 ha |
| Forêt | IGN BD Forêt V2 par WFS | extraction sur l'emprise, validation et normalisation des attributs | 3 615 formations |
| Cadastre | Cadastre Etalab du 1er juin 2026 | assemblage communal, sélection par intersection et conservation des parcelles entières | 11 790 parcelles candidates, 15 communes |
| Industries | Annuaire des Entreprises du 24 août 2026 | contrôle APE et département, conversion Lambert-93 et géocodage en cache | 2 019 sites importables, 85 non résolus exclus |

Les fichiers, URLs, dates, compteurs et checksums sont consignés dans `data/real-data-manifest.json`. Le dossier `data/` reste ignoré par Git afin de séparer les données de travail du code et d'éviter la publication involontaire de fichiers volumineux.
