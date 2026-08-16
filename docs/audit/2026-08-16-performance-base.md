# Audit performance côté base — Diako, 16/08/2026

> État : (en cours)

Périmètre : projet Supabase `eifrwecaszzqrdwjjjbu`, lecture seule. Mesures EXPLAIN ANALYZE sur les RPC chaudes, index, déclencheurs, egress, Realtime.

## ✅ Ce qui marche

### Les 5 RPC du premier écran répondent toutes en moins de 12 ms (cache chaud)
Mesures `EXPLAIN (ANALYZE, BUFFERS)` sur l'appel réel de chaque fonction :

| RPC | Temps total | Buffers lus (shared hit) |
|---|---|---|
| `feed_filtre('tout', null, 12)` | 7,7 ms | 1 732 (~13,5 Mo) |
| `recits_en_vogue(12)` | 11,5 ms | 1 864 (~14,6 Mo) |
| `saison_en_cours(8)` | 7,5 ms | 967 |
| `stats_diako()` | 9,0 ms | 4 448 (~34,8 Mo) |
| `compter_sites()` | 3,9 ms | 526 |

Conséquence : l'accueil ne fera pas attendre l'utilisateur côté base — le coût est en I/O logique (voir 🟠), pas en latence.

### `saison_en_cours` : corps quasi gratuit
Le corps exécuté à nu : Seq Scan sur `events` (42 lignes, 4 buffers) + boucle indexée `places_pkey` — **0,24 ms d'exécution**. Le seq scan sur 42 lignes est le bon plan.

## 🔴 Ce qui ne marche pas

### `explorer_regions()` : 167 ms et ~1,3 Go de lectures logiques PAR APPEL — la page /explorer paie 23 fois le parcours complet de `pages`
Preuve : `EXPLAIN (ANALYZE, BUFFERS) select public.explorer_regions()` → **Execution Time: 166,9 ms, Buffers: shared hit=166 841** (~1,27 Gio en pages de 8 Ko). Le plan interne montre :
- SubPlan `nb_etablissements` : `Index Only Scan using pages_place_idx on pages … rows=3254, loops=23` — pour **chaque** des 23 régions, on parcourt la totalité des 3 254 pages puis on sonde `places` (Memoize `loops=74 842`, Evictions: 9 460 — le cache mémoïze déborde). 81 352 buffers pour ce seul sous-plan.
- Ce sous-plan est exécuté **deux fois** (SubPlan 2 et SubPlan 4 identiques : une évaluation dans la clé de tri `jsonb_agg(x order by x->>'nom')`, une dans l'agrégat) → 162 704 buffers sur les 165 799.
- `Heap Fetches: 74 934` sur `pages_place_idx` : la visibility map de `pages` est périmée (6 222 updates), l'index-only scan retombe sur le tas à chaque ligne.
Conséquence : chaque visiteur qui ouvre /explorer coûte 167 ms de CPU base et l'équivalent d'un balayage de 23× la table `pages` — pour un contenu quasi statique (liste des 23 régions et leurs compteurs). C'est la brique la plus chère mesurée de tout l'audit, sur un écran d'entrée. Correctifs par ordre d'impact : (1) inverser la jointure — partir de `places` filtré par région (≈22 lignes) et sonder `pages(place_id)`, ou dénormaliser `nb_etablissements` par région ; (2) sortir le calcul de la clé de tri (trier sur `r.name_fr`, pas sur `x->>'nom'`) pour cesser de payer double ; (3) `VACUUM (ANALYZE) pages, places` pour restaurer les vrais index-only scans.

## 🟠 À améliorer

### `recits_en_vogue` : l'agrégat des vues est ré-exécuté une fois PAR post (N+1 dans le plan)
Preuve (EXPLAIN ANALYZE du corps) : `GroupAggregate … loops=28` + `Sort … loops=28` + `Seq Scan on page_views … Rows Removed by Filter: 335`. La CTE `vues` est inlinée par le planificateur et rejouée pour chacun des 28 posts, car la jointure se fait sur `substring(v.path from '^/post/…')` — non indexable.
Coût actuel : 2,6 ms (339 lignes dans `page_views`). Conséquence : le coût croît en **posts × page_views** ; `page_views` est une table de tracking qui ne fait que grossir (`vues_7j` la balaye déjà). Correctif simple : `with vues as materialized (…)` + index sur `page_views(created_at)`, ou une colonne `post_id` extraite à l'écriture.

### `feed_filtre` : le tri se fait sur une expression, pas sur l'index
Preuve : `Sort Key: (EXTRACT(epoch FROM (now() - p.created_at)))` — top-N heapsort après lecture de TOUS les posts publiés (Seq Scan, 28 lignes aujourd'hui). Trier par `p.created_at desc` directement permettrait un parcours d'index borné par le curseur. Coût actuel négligeable (1,2 ms) ; à 5 000 récits, chaque page du fil relira la table entière. Les sous-requêtes `ma_reaction`/`enregistre` par ligne (SubPlan 2 : Seq Scan sur `reactions`, `loops=12`) suivent la même pente.

### `stats_diako` : 8 count(*) dont 2 balayages de `places` (22 707 lignes) à chaque affichage
Preuve : 4 448 buffers (~35 Mo lus) par appel ; InitPlan 1 = 555 buffers avec **Heap Fetches: 1259** (visibility map périmée — 103 567 updates sur `places`, cf. pg_stat_user_tables), InitPlan 2 = 412 buffers pour compter 18 334 localités. 9 ms par appel d'accueil pour des chiffres qui changent une fois par jour. Conséquence : du CPU/IO payé en boucle pour un résultat cacheable (vue matérialisée ou cache client de 24 h suffirait).

## Verdict pour un lancement demain

(en cours)
