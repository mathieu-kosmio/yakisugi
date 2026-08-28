# ADR-0002 : confiance des parcelles affectées

## Statut

Accepté le 20 août 2026 pour la première méthode `parcel-forest-v1`.

## Contexte

Le modèle qualifie chaque parcelle avec un niveau `low`, `medium` ou `high`. Ce niveau décrit la couverture méthodologique des données et ne représente pas une probabilité statistique.

## Décision

La méthode applique les règles déterministes suivantes :

- `low` lorsque la parcelle touchée ne recoupe aucun peuplement forestier identifié ;
- `medium` lorsqu'une surface forestière est identifiée avec une couverture inférieure à 80 %, ou lorsque l'essence dominante est absente ;
- `high` lorsque la couverture forestière atteint au moins 80 % de la surface touchée et qu'une essence dominante est renseignée.

Les surfaces proviennent d'intersections géométriques. L'essence reste `null` lorsqu'elle est absente de la source. Les volumes minimal et maximal restent `null` jusqu'à validation de coefficients documentés.

## Conséquences

La règle est simple, testable et explicable. Toute modification incrémente la version de méthodologie et nécessite une nouvelle décision documentée.
