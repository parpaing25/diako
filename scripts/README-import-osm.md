# Import OpenStreetMap — les 23 régions

`moisson_osm.py` interroge l'API Overpass région par région et enregistre le
résultat brut dans `osm/<Region>.json`. Il est **rejouable** : un fichier déjà
présent n'est pas re-téléchargé.

## Ce qu'on importe, et ce qu'on n'importe pas

| On prend | On ne prend pas |
|---|---|
| nom, type, **coordonnées relevées** | prix, notes, avis |
| téléphone, site web quand ils existent | horaires (souvent périmés dans OSM) |
| la région, par la relation administrative | photos (licence des contributeurs) |

⚠ **Aucun prix n'entre par cet import.** OSM n'en porte pas de fiables, et la
règle n°1 du projet interdit d'en fabriquer. La RPC d'import ne comportait même
pas les colonnes commerciales : elles ne pouvaient physiquement pas être écrites.

## Le piège des noms de région

OSM nomme les régions en **malgache**, notre référentiel en français. Sur 23
régions, une seule diverge — et c'est la plus peuplée après Analamanga :

| Notre référentiel | OSM |
|---|---|
| Haute Matsiatra | **Matsiatra Ambony** (`name:fr` porte « Haute Matsiatra ») |

La première moisson l'a donc silencieusement sautée : la requête Overpass
renvoie un jeu VIDE quand l'aire ne correspond à rien, sans erreur. Vérifier le
compte par région après import est le seul moyen de s'en apercevoir.

OSM connaît aussi une 24ᵉ région, **Ambatosoa**, issue d'un découpage récent.
Notre référentiel suit le découpage officiel à 23 : elle est ignorée.

## Procédure d'import

1. `python scripts/moisson_osm.py`
2. Créer une RPC `SECURITY DEFINER` temporaire protégée par un jeton, qui
   n'accepte QUE les colonnes non commerciales.
3. Pousser les lots par l'API REST avec la clé anonyme.
4. **Supprimer la RPC immédiatement.** Une fonction `SECURITY DEFINER` ouverte à
   `anon` ne doit pas survivre à l'opération qui l'a justifiée, même protégée
   par un jeton : le jeton finit toujours par se retrouver quelque part.
5. Vérifier le compte par région, et que `pg_proc` ne contient plus la fonction.

## Attribution

Données © contributeurs OpenStreetMap, sous licence ODbL. Chaque fiche porte
sa source dans la colonne `source` (`OpenStreetMap · node/123456`), affichée sur
la fiche publique sous « Cette fiche est tenue par Diako ».
