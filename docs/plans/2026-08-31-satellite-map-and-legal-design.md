# Fond satellite et informations légales

Date : 31 août 2026

## Besoin

La carte Yakisugi doit permettre de comparer les données forestières et cadastrales à une vue aérienne, tout en conservant le fond cartographique actuel. Le site doit également identifier clairement Kosmio comme éditeur.

## Décision d'interface

Un sélecteur à deux états, `Plan` et `Satellite`, est placé au-dessus de la carte. Le fond satellite est une couche raster IGN chargée sous les couches Yakisugi. Le changement de fond agit uniquement sur la visibilité de cette couche. La carte, le zoom, les filtres et la parcelle sélectionnée restent inchangés.

Le contrôle expose son état avec `aria-pressed`, reste utilisable au clavier et conserve une cible tactile d'au moins 40 pixels. Le mode Plan reste le mode initial afin de préserver le chargement et le rendu actuels.

## Source cartographique

La ressource `ORTHOIMAGERY.ORTHOPHOTOS` est diffusée par le service WMTS public de la Géoplateforme IGN. Son URL est configurable par `NEXT_PUBLIC_SATELLITE_TILE_URL`. Une valeur IGN fonctionnelle est fournie par défaut et l'attribution demeure visible dans MapLibre.

## Informations légales

Une page `/mentions-legales` publie les informations publiques nécessaires de Kosmio : forme juridique, capital, SIREN, SIRET du siège, TVA intracommunautaire, adresse, responsabilité éditoriale et hébergeur. Le pied de page rend cette page et le contact de l'éditeur accessibles depuis toutes les routes.

Les données d'identification sont recoupées avec l'API Recherche d'entreprises de l'État et les publications officielles de Kosmio au 31 août 2026.

## Vérifications

- test du composant de sélection et de ses états accessibles ;
- test de présence de la page dans le sitemap ;
- `npm run check` ;
- `npm run build`.
