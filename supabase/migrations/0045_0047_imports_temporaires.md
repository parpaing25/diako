# 0045, 0045b, 0047 — les portes d'import, ouvertes puis refermées

Ces trois migrations ne créaient que des **fonctions d'import temporaires**
(`import_osm_lot`, `import_osm_sites`, `import_wikipedia`), et **0054 les a
toutes supprimées**. Leur effet net sur le schéma est nul : le `.sql` n'est pas
repris ici, pour éviter qu'on croie devoir les rejouer.

Elles ont chargé, en une session :

| source | apport |
|---|---|
| OpenStreetMap (2ᵉ passage, 23 régions) | +144 établissements, +132 sites |
| Wikidata (CC0) | +1 470 sites |
| Wikipédia (CC BY-SA) | 157 fiches décrites |
| Wikimedia Commons | 198 photos créditées |

Ce qu'il faut en retenir pour le prochain import :

- **Le dédoublonnage appartient à la fonction, pas à l'appelant.** Le deuxième
  passage repassait sur 3 104 points déjà en base ; sans garde-fou côté SQL,
  l'annuaire aurait doublé sans gagner un seul établissement.
- **L'identité est l'identifiant OSM, pas le nom.** « Hôtel Central » existe à
  Antananarivo et à Tamatave, ce sont deux établissements ; à l'inverse un même
  point renommé reste le même point.
- **`places` n'a pas de `region_slug`.** La colonne s'appelle `region` et porte
  le nom complet (« Haute Matsiatra »). La première version de 0045 échouait sur
  chaque lot pour cette raison — franchement, au moins, sans rien insérer.
- **Un jeton partagé n'est pas un secret.** Celui-ci a voyagé dans des scripts
  et dans des requêtes HTTP. D'où 0054 : le prochain import recrée ses fonctions
  avec un jeton neuf, et les referme en partant.

Le texte exact appliqué reste consultable en base :

```sql
select name, statements[1]
  from supabase_migrations.schema_migrations
 where name in ('0045_import_osm_passe2', '0045b_import_osm_region_nom',
                '0047_import_wikipedia_extraits');
```
