# ETL géospatial

Les scripts Python préparent les données hors ligne avant publication. Ils n'effectuent aucun appel lors de l'affichage d'une page.

## Ordre cible

1. `import_incident.py`
2. `import_forest.py`
3. `process_forests.py`
4. `import_parcels.py`
5. `process_parcels.py`
6. `import_industries.py`
7. `calculate_distances.py`
8. `generate_export.py`

Chaque commande devra proposer un mode `--dry-run`, écrire un journal structuré, refuser les géométries invalides non réparables et produire un résumé des lignes lues, rejetées, insérées et mises à jour.

Le premier script à implémenter est suivi par T-006 dans `IMPLEMENTATION_PLAN.md`.
