# Audit performance côté base — Diako, 16/08/2026

> État : (terminé)

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

### `explorer_region` et `explorer_ville` (0088) : pas de N+1 coûteux — 7 ms sur les cas les plus gros
Mesures sur les pires cas réels : Diana = 78 destinations (la plus grosse région), Antananarivo = 48 destinations rattachées (la plus grosse ville) :
- `explorer_region('diana')` : **7,05 ms, 1 770 buffers** (appel réchauffé ; le 1er appel d'une connexion paie 137,7 ms de construction du cache de plans — voir 🟠).
- `explorer_ville('antananarivo-2')` : **6,56 ms, 1 652 buffers** (réchauffé ; 1er appel 30,0 ms).
Le corps de `explorer_region` à nu (2,5 ms, 544 buffers) montre pourquoi c'est sain : la CTE `dest` est matérialisée **une fois** via `places_region_touristique_idx` (78 lignes, 49 buffers), et les sous-requêtes par ville (SubPlan 7/8/9, `loops=6`) balaient cette CTE en mémoire — un N+1 formel, mais sur 78 lignes déjà lues, pas sur la table. Le sous-plan `pages` passe par `pages_place_idx` (Index Only Scan, `loops=72`). Conséquence : la descente Explorer niveau 2 et 3 tient la charge ; seul le niveau 1 (`explorer_regions`, voir 🔴) est malade.

### `suggestions_envie` (0089) : 11 ms sur les deux envies les plus chargées
Mesures réchauffées, appels réels : `suggestions_envie('culture', null, null, null, 24)` = **10,9 puis 11,2 ms, 3 268 buffers** ; `('trek', …)` = **11,9 ms, 2 867 buffers**. Pagination par curseur. Conséquence : l'écran « envies » ne pose pas de problème de latence ni de dérive avec la profondeur de page.

### `sites_de_la_region('diana')` : 24 ms sur la plus grosse région, curseur sans offset
Mesure : **24,2 ms, 2 993 buffers** (réchauffé, 2 appels concordants à 25,8/24,2 ms). La pagination est à curseur sur la clé `ordre collate "C"` (0091:479), donc le coût ne croît pas avec la profondeur de page. Acceptable pour l'écran région de /sites.

### Realtime : la doctrine anti-egress est respectée — un seul canal, le chat, fermé proprement
Preuve : `grep '\.channel\(|postgres_changes|\.subscribe\('` sur tout `src/` ne trouve qu'UN ouvreur de canal, `src/hooks/useChatLive.ts:74-116` — canal par conversation ouverte, deux `postgres_changes` filtrés `conv_id=eq.<id>` sur `messages`, la frappe en `broadcast` (0 écriture en base), et `removeChannel` au démontage (ligne 123). Aucun canal sur le fil, les compteurs ou les notifications. Conséquence : pas d'egress Realtime caché.

### Les réponses JSON des fiches sont sobres — mesuré sur les cas les plus lourds
`octet_length(rpc(...)::text)` sur les plus gros objets de la base : `fiche_destination('antananarivo-2')` (579 établissements rattachés) = **3 193 octets**, `('nosy-be')` = 2 261 o, `get_page_by_slug('hotel-vanilla')` = **948 octets** (galeries toutes vides à ce jour : `pg_column_size(gallery)` max = 5 o), `explorer_regions()` = 4 820 o, `sites_par_region()` = 9 206 o, `sites_de_la_region('diana')` = 12 565 o. Conséquence : côté egress, les écrans de consultation coûtent quelques Ko — le poste à surveiller est le fil (voir 🟠).

### Index inutilisés : rien à retirer
`pg_stat_user_indexes` avec `idx_scan = 0` (hors clés uniques/PK) ne liste côté `public` que ~15 petits index de 8 à 48 Ko (`reactions_post_idx`, `messages_conv_idx`, `conversations_a_idx`, `tours_norm_idx`, `events_mois_idx`…) — tous posés sur des tables de fonctionnalités encore sans trafic (0 à 2 lignes dans `reactions`, `messages`, `bookings`). Le planificateur préfère aujourd'hui le seq scan sur ces tables minuscules ; les index serviront dès que le volume viendra. Conséquence : aucun poids mort significatif, aucune suppression à faire.

### Les 160 M de lignes lues en seq scan sur `pages` ne sont PAS du trafic de production
`pg_stat_user_tables` affiche `pages : seq_scan=50 765, seq_tup_read=160 094 764` — alarmant en apparence. `pg_stat_statements` montre les vrais coupables : des requêtes d'audit et de migration exécutées UNE fois chacune avec une sous-requête corrélée par lieu (`(select count(*) from pages g where g.place_id = p.id)` évaluée pour 22 530 lieux = autant de seq scans comptabilisés ; 5 773 090 blocs pour un seul appel, 9,8 s), plus la migration 0043 (2 200 769 blocs). Le trafic applicatif réel passe par `pages_place_idx`/`pages_slug_key`. Conséquence : pas de correctif à faire côté application — mais ces requêtes d'audit ponctuelles gagneraient un index si on les rejoue (voir la note `nb_pages` du dépôt).

## 🔴 Ce qui ne marche pas

### `explorer_regions()` : 167 ms et ~1,3 Go de lectures logiques PAR APPEL — la page /explorer paie 23 fois le parcours complet de `pages`
Preuve : `EXPLAIN (ANALYZE, BUFFERS) select public.explorer_regions()` → **Execution Time: 166,9 ms, Buffers: shared hit=166 841** (~1,27 Gio en pages de 8 Ko). Le plan interne montre :
- SubPlan `nb_etablissements` : `Index Only Scan using pages_place_idx on pages … rows=3254, loops=23` — pour **chaque** des 23 régions, on parcourt la totalité des 3 254 pages puis on sonde `places` (Memoize `loops=74 842`, Evictions: 9 460 — le cache mémoïze déborde). 81 352 buffers pour ce seul sous-plan.
- Ce sous-plan est exécuté **deux fois** (SubPlan 2 et SubPlan 4 identiques : une évaluation dans la clé de tri `jsonb_agg(x order by x->>'nom')`, une dans l'agrégat) → 162 704 buffers sur les 165 799.
- `Heap Fetches: 74 934` sur `pages_place_idx` : la visibility map de `pages` est périmée (6 222 updates), l'index-only scan retombe sur le tas à chaque ligne.
Conséquence : chaque visiteur qui ouvre /explorer coûte 167 ms de CPU base et l'équivalent d'un balayage de 23× la table `pages` — pour un contenu quasi statique (liste des 23 régions et leurs compteurs). C'est la brique la plus chère mesurée de tout l'audit, sur un écran d'entrée. Correctifs par ordre d'impact : (1) inverser la jointure — partir de `places` filtré par région (≈22 lignes) et sonder `pages(place_id)`, ou dénormaliser `nb_etablissements` par région ; (2) sortir le calcul de la clé de tri (trier sur `r.name_fr`, pas sur `x->>'nom'`) pour cesser de payer double ; (3) `VACUUM (ANALYZE) pages, places` pour restaurer les vrais index-only scans.

### La vue `sites_localises` recalcule ~291 000 distances À CHAQUE lecture — 79 ms par affichage de /sites, et un Seq Scan de 22 707 lignes pour trouver 23 régions
Preuves :
- `sites_par_region()` : **79,1 et 91,0 ms, 6 476 buffers** sur deux appels consécutifs — ce n'est pas un coût de premier appel, c'est le prix constant de la grille /sites.
- `explain (analyze, buffers) select count(*) from sites_localises` → 64,7 ms, 5 000 buffers, et le plan montre les deux gouffres :
  1. Le LATERAL « ville la plus proche » : `Limit … loops=2465` → `Sort` + `CTE Scan on villes … rows=5, Rows Removed by Filter: 113, loops=2465`. Chaque site compare sa position aux 118 villes (2 465 × 118 ≈ 291 000 `sqrt/power/cos`), soit ~52 ms des 64,7 (0,021 ms × 2 465). La CTE `villes` étant matérialisée en mémoire, **aucun index ne peut aider ce nœud** — c'est le calcul lui-même qu'il faut sortir de la lecture.
  2. `Seq Scan on places r … Filter: kind = 'region', Rows Removed by Filter: 22684, Buffers: 1273` — 1 273 blocs (~10 Mo) balayés pour extraire 23 lignes. `pg_indexes` sur `places` (12 index) le confirme : **aucun index ne couvre `kind`**.
Conséquence : chaque ouverture de /sites paie 79 ms de CPU base et ~50 Mo de lectures logiques pour un résultat qui ne change qu'à l'édition d'un site. Le dépôt a déjà le bon geste pour `places` (0088 : colonne `ville_proche_id` posée à l'écriture, précisément pour éviter « un produit cartésien à chaque ouverture d'écran », 0088:16-19) — `attractions` a besoin du même traitement : colonnes `ville_id`/`km_ville` calculées par une fonction rappelable, la vue devenant une simple jointure. À défaut, un index partiel `on places(name_fr) where kind='region' and merged_into is null` éteint au moins le point 2.

### `recits_en_vogue` : l'agrégat des vues est ré-exécuté une fois PAR post (N+1 dans le plan)
Preuve (EXPLAIN ANALYZE du corps) : `GroupAggregate … loops=28` + `Sort … loops=28` + `Seq Scan on page_views … Rows Removed by Filter: 335`. La CTE `vues` est inlinée par le planificateur et rejouée pour chacun des 28 posts, car la jointure se fait sur `substring(v.path from '^/post/…')` — non indexable.
Coût actuel : 2,6 ms (339 lignes dans `page_views`). Conséquence : le coût croît en **posts × page_views** ; `page_views` est une table de tracking qui ne fait que grossir (`vues_7j` la balaye déjà). Correctif simple : `with vues as materialized (…)` + index sur `page_views(created_at)`, ou une colonne `post_id` extraite à l'écriture.

### `feed_filtre` : le tri se fait sur une expression, pas sur l'index
Preuve : `Sort Key: (EXTRACT(epoch FROM (now() - p.created_at)))` — top-N heapsort après lecture de TOUS les posts publiés (Seq Scan, 28 lignes aujourd'hui). Trier par `p.created_at desc` directement permettrait un parcours d'index borné par le curseur. Coût actuel négligeable (1,2 ms) ; à 5 000 récits, chaque page du fil relira la table entière. Les sous-requêtes `ma_reaction`/`enregistre` par ligne (SubPlan 2 : Seq Scan sur `reactions`, `loops=12`) suivent la même pente.

### `stats_diako` : 8 count(*) dont 2 balayages de `places` (22 707 lignes) à chaque affichage
Preuve : 4 448 buffers (~35 Mo lus) par appel ; InitPlan 1 = 555 buffers avec **Heap Fetches: 1259** (visibility map périmée — 103 567 updates sur `places`, cf. pg_stat_user_tables), InitPlan 2 = 412 buffers pour compter 18 334 localités. 9 ms par appel d'accueil pour des chiffres qui changent une fois par jour. Conséquence : du CPU/IO payé en boucle pour un résultat cacheable (vue matérialisée ou cache client de 24 h suffirait).

### Le fil expédie le corps COMPLET de chaque récit : 32,9 Ko pour 12 cartes
Preuve : `octet_length(feed_filtre('tout', null, 12)::text)` = **32 911 octets**, soit ~2,7 Ko par récit ; le corps de la fonction (`pg_get_functiondef`) embarque `'body', p.body, 'media', p.media` en entier dans chaque élément du fil. `recits_en_vogue(12)` suit la même pente (12 lignes de 1,7 à 2,9 Ko ≈ 28 Ko). Conséquence egress : le fil est l'écran le plus rechargé du site ; chaque page de 12 cartes coûte ~33 Ko là où des cartes tronquées (extrait de `body` à ~300 caractères, le plein texte à l'ouverture du récit) diviseraient le poste par 5 à 8. À chiffrer contre le choix produit « le fil montre tout ».

### `to_jsonb(p)` dans `fiche_destination` et `fiche_plat` : un `select *` caché qui publiera toute colonne future
Preuve : les deux seules RPC utilisant `to_jsonb` (recherche sur `pg_proc.prosrc`) : `fiche_destination` → `'lieu', to_jsonb(p) - 'norm'` et `fiche_plat` → `'plat', to_jsonb(d) - 'norm'`. La ligne `places`/`dishes` ENTIÈRE part au client, colonnes internes comprises (`merged_into`, `ville_proche_id`, `nb_pages`…) ; seule `norm` est soustraite, nommément. Aujourd'hui c'est petit (3 193 o mesurés sur le pire cas) parce que les colonnes sont creuses. Conséquence : toute colonne ajoutée demain à `places` (note interne, coût d'import, champ de modération…) sortira dans l'API sans qu'aucune revue ne le voie — le dépôt s'interdit ce motif ailleurs (0091:456-457 : « jamais `*`, même sur une vue à soi »). Énumérer les colonnes règle l'egress ET le risque de fuite.

### Écriture sur `pages` : DEUX déclencheurs refont exactement le même recomptage — `places` encaisse 2 UPDATE par écriture de page
Preuve (`pg_get_functiondef`) : `pages` porte 3 déclencheurs non internes (`pg_trigger`) — `trg_pages_avant` (BEFORE I/U), `pages_maj_nb_pages` (AFTER I/U/D) et `trg_pages_compteur` (AFTER I/U/D). Or `maj_nb_pages` ET `maj_compteurs_referentiels` exécutent le même ordre : `update places set nb_pages = (select count(*) from pages where place_id = pl.id and is_published)` — mot pour mot la même sous-requête, sur le même lieu. Chaque insert/update/delete d'une page écrit donc **deux fois** la même ligne de `places` (deux versions mortes par écriture).
Conséquence mesurable : `pg_stat_user_tables` montre **103 567 updates sur `places`** pour 22 707 lignes vivantes — c'est cette inflation qui pourrit la visibility map et explique les `Heap Fetches: 74 934` payés par `explorer_regions` et les 1 259 de `stats_diako` à CHAQUE lecture. Supprimer l'un des deux déclencheurs (ils sont redondants à l'identique) divise par deux l'usure sans rien changer au résultat.
Le reste du coût d'écriture est sain : les 4 sondes `EXISTS` de `pages_avant_ecriture` (room_types, menu_items, activities, tours) ont toutes leur index `page_id` (`pg_indexes` vérifié), et les 3 déclencheurs de `posts` (`maj_nb_posts`, `maj_posts_count`, `touch_updated_at`) font chacun un travail distinct et indexé. Coût d'exécution réel d'une écriture : non vérifié (audit en lecture seule — aucun INSERT de test), chiffrage établi sur les corps de fonctions et les plans des sous-requêtes équivalentes.

## Verdict pour un lancement demain

**PRÊT SOUS CONDITIONS.** Aucune mesure ne bloque : toutes les RPC des écrans d'entrée répondent sous 30 ms réchauffées (sous 12 ms pour l'accueil), les réponses JSON tiennent en quelques Ko, le Realtime est confiné au chat. Mais deux briques brûlent du CPU et de l'I/O à chaque visite pour un contenu quasi statique, et une usure structurelle est déjà mesurable. Conditions, triées :

1. **`explorer_regions()` — à corriger avant que /explorer prenne du trafic.** 167 ms et ~1,3 Gio de lectures logiques PAR VISITE (mesuré), pour une liste de 23 régions qui change à l'édition. Trois gestes, par impact : partir de `places` par région au lieu de re-balayer `pages` 23 fois ; trier sur `r.name_fr` pour cesser d'évaluer le sous-plan deux fois ; ou plus simple encore, cacher le résultat (il est identique pour tous les visiteurs).
2. **`sites_localises` — sortir le calcul de distance de la lecture.** 79 ms constants par affichage de /sites (2 465 × 118 distances recalculées à chaque fois) + un Seq Scan de 22 707 lignes faute d'index sur `kind`. Le remède est déjà dans le dépôt pour `places` (0088, colonne posée à l'écriture) : appliquer le même motif à `attractions`, et poser l'index partiel `kind='region'`.
3. **Supprimer l'un des deux déclencheurs jumeaux de `pages`, puis `VACUUM (ANALYZE) places, pages`.** Le double recomptage de `nb_pages` a déjà produit 103 567 updates sur `places` ; la visibility map périmée fait payer des dizaines de milliers de Heap Fetches à chaque lecture des RPC d'entrée. Deux minutes de travail, effet immédiat sur TOUTES les mesures ci-dessus.

Dette à suivre sans urgence : cache 24 h sur `stats_diako`, CTE `materialized` + colonne `post_id` pour `recits_en_vogue` (le N+1 grossira avec `page_views`), tri de `feed_filtre` sur `created_at` nu, cartes du fil tronquées (~33 Ko → ~5 Ko par page de fil), colonnes énumérées à la place de `to_jsonb(p)` dans les deux fiches.
