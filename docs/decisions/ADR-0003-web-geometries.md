# ADR-0003 : géométries destinées au web

## Statut

Accepté le 20 août 2026.

## Contexte

Les géométries complètes sont nécessaires aux calculs et aux exports. Leur exposition systématique dans l'API augmente la taille des réponses et le coût de rendu cartographique.

## Décision

Les ETL produisent une seconde géométrie simplifiée avec préservation de la topologie :

- incident : tolérance de `0.0001` degré ;
- peuplement forestier : tolérance de `0.00005` degré ;
- parcelle : tolérance de `0.00002` degré.

Les DTO publics choisissent `geometry_web` lorsqu'elle existe. Ils utilisent la géométrie complète uniquement pour les données anciennes qui n'ont pas encore été retraitées. Les simplifications restent des calculs hors ligne et ne sont jamais exécutées pendant une requête HTTP.

## Conséquences

Les exports contrôlés pourront conserver les géométries complètes. Une modification de tolérance nécessite des mesures de poids, de fidélité et de performance, puis une mise à jour de cette décision.
