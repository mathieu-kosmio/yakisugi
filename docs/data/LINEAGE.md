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
