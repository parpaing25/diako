# Planificateur de trajet — `/y-aller`

Chantier n° 12 de la liste de lancement. Demande d'origine : « sur Y aller, il
faut un planificateur : on met sa position de départ, sa destination, l'heure de
départ, et ça donne l'itinéraire, les conditions des routes, les heures, où
manger, où passer. Par exemple Antananarivo → Toliara par la RN7. »

---

## 1. Ce sur quoi le planificateur s'appuie — et rien d'autre

Une seule source : la table `place_access`, **42 lignes relevées**, jointe deux
fois à `places` (origine et destination). Rien n'est estimé, rien n'est
extrapolé.

Relevé en direct le 17/08/2026 sur le projet de production
(`eifrwecaszzqrdwjjjbu`), via la RPC `y_aller()` et une lecture de
`place_access` avec la clé `anon` publique :

| fait | valeur |
|---|---|
| lignes de `place_access` | 42 |
| lieux distincts touchés (origine **ou** destination) | **43** |
| lieux sans coordonnées | 3 — `antoetra`, `zafimaniry`, `tulear-recif` |
| lignes sans durée relevée | 0 |
| vitesses moyennes constatées | goudron 46 · bateau 29 · piste 23 · pirogue 15 · 4×4 14 km/h |

Le graphe a **43 sommets et 42 arêtes** : c'est presque un arbre, pas un réseau
routier. 25 des 43 sommets n'ont qu'un seul lien (culs-de-sac : parcs, plages,
îles). Contrôlé : aucun des 43 n'est un doublon fusionné (`merged_into` nul
partout).

### Deux composantes, pas une

- **composante principale : 41 lieux**, tous rattachés à Antananarivo de proche
  en proche ;
- **composante isolée : 2 lieux** — `ankify` ↔ `nosy-be`. Le relevé donne la
  traversée Ankify → Nosy Be (8 km, 0,6 h, vedette) mais **pas** la route
  Antananarivo → Ankify. Nosy Be est donc injoignable depuis le reste du
  référentiel, et l'écran le dit mot pour mot au lieu de bricoler un trajet.

### La RN7 se recoupe elle-même — et c'est la meilleure preuve du dispositif

Le relevé porte à la fois les sept tronçons de la RN7 et la ligne
« Antananarivo → Toliara » d'un seul bloc. Mis bout à bout :

| | distance | durée |
|---|---|---|
| somme des 7 tronçons | 941 km | 19 h 30 |
| ligne directe relevée | 950 km | 20 h 00 |

Deux mesures indépendantes du même trajet, concordantes à 1 %. L'écran affiche
les deux côte à côte : c'est le seul contrôle qu'on puisse offrir au visiteur
sur des chiffres qu'il n'a aucun moyen de vérifier lui-même.

---

## 2. La décision la plus discutable de ce chantier : le sens inverse

Le relevé est **orienté** : « Antananarivo → Toliara ». Il n'existe aucune ligne
« Toliara → Antananarivo ».

1. **Refuser le sens inverse** : la couverture tombe à **143 paires sur 1 806**,
   et le premier visiteur qui tape « Toliara → Antananarivo » — le retour,
   c'est-à-dire la moitié des trajets réels — voit un écran vide et en conclut
   que l'outil est cassé.
2. **Accepter le sens inverse en le disant** : la distance est celle de la même
   route ; la durée est celle relevée **dans l'autre sens**.

J'ai retenu la 2, **avec l'étiquette « relevé dans l'autre sens » posée sur
chaque tronçon concerné** dans le tableau, et une ligne dédiée dans « ce que ce
calcul ne dit pas ». Aucune valeur n'est fabriquée, arrondie ni « ajustée pour
la montée » : c'est une donnée relevée, réutilisée, et l'écran nomme la
réutilisation.

**Pour revenir sur ce choix**, une seule constante : `AUTORISER_SENS_INVERSE`
en tête de `src/lib/trajet.ts`. La passer à `false` ramène la couverture à 143
paires ; l'écran l'annonce alors tout seul, sans autre modification.

---

## 3. Ce que j'ai construit

### `src/lib/trajet.ts` — tout le calcul, sans React ni Supabase

Fichier **sans aucun import**, donc compilable et vérifiable seul.

- `construireGraphe(referentiel)` — 43 sommets, 84 arcs (42 relevés + 42
  inverses). Un tronçon **sans durée relevée est écarté**, jamais estimé par une
  vitesse moyenne.
- `chercherItineraire(g, de, vers)` — Dijkstra sur les **durées relevées**, pas
  sur les kilomètres. Départage total : durée, puis nombre de tronçons, puis
  slug — le même trajet rend toujours le même itinéraire.
- `soleil(lat, lng, dateISO)` — algorithme solaire du NOAA. Lever, coucher, et
  fin du crépuscule civil, en heure de Madagascar (UTC+3, sans heure d'été).
  **Rend `null` sans coordonnées** : aucun horaire approché.
- `planifier(g, demande)` — produit **deux lectures du même trajet** :
  « d'une traite » (l'addition brute) et le découpage jour par jour qui évite de
  rouler après le coucher du soleil.
- `heureLimiteDeDepart`, `excursionsDepuis`, `heureFr`, `dureeFr`,
  `dateEnFrancais`, `aujourdhuiMadagascar`, `decalerDate`.

**Règle du découpage** : on ferme la journée au **dernier lieu atteignable avant
le coucher du soleil**, calculé lieu par lieu et date par date. On ne coupe
**jamais** un tronçon : « Antananarivo → Morondava, 700 km, 14 h » est relevé
d'un seul bloc, donc aucun arrêt n'est inventé sur la RN34 — la journée est
marquée comme roulant dans le noir, et l'écran l'écrit.

### `src/components/trajet/` — quatre composants

| fichier | rôle |
|---|---|
| `Planificateur.tsx` | charge le graphe, tient l'état (dans l'URL), calcule, orchestre |
| `FormulaireTrajet.tsx` | deux listes fermées + date + deux heures, tous avec `<label htmlFor>` |
| `ResultatTrajet.tsx` | synthèse, « d'une traite », journées, contre-vérification, « ce qu'on ne sait pas » |
| `ArretsEtape.tsx` | où dormir, où manger, où passer — à chaque étape |

### `src/pages/YAller.tsx`

Le planificateur est inséré **avant** le tableau existant, et il est
**indépendant** : s'il ne trouve pas ses RPC, lui seul affiche « pas encore
actif » — le reste de la page, servi par `y_aller()`, continue de fonctionner.
Titre et description SEO mis à jour.

---

## 4. Migrations écrites — À APPLIQUER PAR LE PROPRIÉTAIRE

Je n'ai **appliqué aucune migration**. Les deux fichiers sont écrits, idempotents
et terminés par une assertion `do $$ … raise exception … $$`.

| fichier | contenu |
|---|---|
| `supabase/migrations/0099_planificateur_le_graphe_des_troncons.sql` | RPC `trajet_referentiel()` — le graphe entier en un aller-retour (43 sommets avec coordonnées et nombre d'adresses, 42 arêtes) |
| `supabase/migrations/0100_planificateur_ou_manger_ou_dormir.sql` | RPC `trajet_etapes(text[], integer)` + auxiliaire `dk_trajet_adresses` — hôtels et restaurants publiés aux étapes |

**Le planificateur ne s'affiche pas tant que 0099 n'est pas appliquée.** C'est
volontaire : mieux vaut un bloc qui dit « pas encore actif » qu'un bloc qui
invente. `0100` n'est nécessaire que pour les listes d'adresses ; sans elle, le
planificateur fonctionne et retombe sur les compteurs du graphe.

Après application : **régénérer `src/integrations/supabase/types.ts`**. Les deux
nouvelles fonctions n'y sont pas ; l'appel passe pour l'instant par un
échappatoire non typé isolé en un seul point de `Planificateur.tsx` (commenté sur
place), précisément pour ne pas éditer à la main un fichier généré.

Pièges tenus dans les migrations :
- `drop function if exists` **explicite** sur les deux formes de `trajet_etapes`
  avant création — `create or replace` ne sait pas changer un type de retour
  (42P13) et deux surcharges cassent PostgREST (PGRST203) ;
- **aucune colonne ajoutée à `places`** — donc pas de problème de grant par
  colonne (`pg_attribute.attacl`) ; les fonctions sont `security definer` et
  lisent en tant que propriétaire, ce qui rend le point sans objet ;
- pas de `LATERAL` sur la cible d'un `UPDATE` : ces migrations n'écrivent rien ;
- `revoke execute … from public` puis `grant … to anon, authenticated` sur les
  deux RPC publiques ; l'auxiliaire `dk_trajet_adresses` est révoquée à `anon`
  ET `authenticated` pour que PostgREST ne l'expose pas ;
- listes de colonnes explicites partout, aucun `select *` ;
- top-N borné (12 max), aucun `offset`.

---

## 5. Couverture réelle — quelles paires marchent, lesquelles non

Mesuré en exécutant `planifier()` sur **les 1 806 paires ordonnées** des 43 lieux :

| | paires |
|---|---|
| **planifiables** | **1 642** |
| refusées | 164 |
| total | 1 806 |

Les 164 refusées sont **exactement** celles qui opposent `ankify` ou `nosy-be`
aux 41 autres lieux (2 × 41 × 2). Aucune autre paire n'échoue.

**Ce qui marche particulièrement bien** (chaînes de tronçons, donc étapes de nuit
proposées) :

- **la RN7 complète** : Antananarivo → Antsirabe → Ambositra → Fianarantsoa →
  Ambalavao → Ihosy → Ranohira → Toliara, et tous les sous-trajets ;
- les excursions greffées dessus : Réserve d'Anja, Tsaranoro, Andringitra,
  Isalo, Zombitse, Ranomafana, Ifaty, Mangily, Anakao, Nosy Ve ;
- l'axe est : Antananarivo → Andasibe → Analamazaotra, Antananarivo → Toamasina
  → Sainte-Marie → Île aux Nattes ;
- l'axe RN4 : Antananarivo → Mahajanga → {Cirque Rouge, Ankarafantsika} ;
- l'ouest : Antananarivo → Morondava → {Allée des Baobabs, Kirindy, Tsingy} ;
- le nord : Antananarivo → Antsiranana → {Ramena, Montagne d'Ambre, Ankarana} ;
- l'Itasy : Antananarivo → Analavory / Ampefy → Lac Itasy ;
- le pays Zafimaniry : Antananarivo → Antsirabe → Ambositra → Antoetra →
  Zafimaniry.

**Ce qui ne marche pas, et ce que l'écran répond :**

| cas | réponse à l'écran |
|---|---|
| Nosy Be et Ankify vers tout le reste (164 paires) | « … appartiennent à deux morceaux du relevé qui ne se touchent pas : il manque au moins un tronçon entre les deux, et nous ne l'inventerons pas » + bouton « Relever ce tronçon » |
| Antananarivo → Morondava (14 h d'un bloc) | plan d'un jour, marqué « roule dans le noir » : « Nous n'avons relevé aucun point d'arrêt intermédiaire sur cette route, et nous n'en inventerons pas. Pour arriver avant la nuit, il faudrait partir à 03 h 50 — avant le lever du jour, qui est à 06 h 24. » |
| Antananarivo → Antsiranana (24 h d'un bloc) | « Ce tronçon dure plus longtemps qu'une journée entière : aucune heure de départ ne permet d'arriver de jour. » |
| étapes sans coordonnées (Antoetra, Zafimaniry, Grand récif) | « coucher du soleil inconnu ici » — aucun horaire n'est affirmé |
| étape sans aucune adresse publiée (Zombitse) | état vide complet : ce qui manque + « Ajouter une adresse » + les tronçons relevés depuis là |
| tronçons `all_year = false` (Antoetra, Tsaranoro, Andringitra, Tsingy, Sainte-Marie) | listés dans « ce que ce calcul ne dit pas », avec leur état relevé, et « le relevé ne dit pas à quelles dates exactement » |

---

## 6. Les données que j'ai refusé d'afficher

- **`place_access.price_ar`** (renseigné sur 1 ligne sur 42, la RN7 : 80 000 Ar).
  La table n'a **ni unité, ni base, ni date de confirmation**. La règle du projet
  interdit qu'un montant paraisse seul, et un prix de transport sans date se
  périme en silence. On affiche les transporteurs relevés, pas le montant — c'est
  d'ailleurs déjà le parti pris du tableau existant.
- **Les prix des établissements** : renseignés sur 38 fiches sur 3 254, et la
  discipline prix (montant + unité + base + date, déclassement à 6 mois) est déjà
  tenue sur `/p/<slug>`. La rejouer ici créerait deux endroits où elle peut
  diverger. Le planificateur nomme l'adresse et y renvoie.
- **Les photos** : `cover_url` est nul sur les 3 254 fiches publiées.
- **Une carte Leaflet.** Les 43 lieux ont des coordonnées, mais un segment droit
  entre deux étapes donnerait à voir une route qui n'existe pas : la RN7 fait
  170 km d'Antananarivo à Antsirabe pour 105 km à vol d'oiseau. Tracer cette
  ligne, c'est dessiner une géométrie qu'on n'a pas mesurée — le même défaut
  qu'une durée inventée, en plus visuel. Le jour où le référentiel portera des
  tracés, la carte sera légitime.
- **Toute durée de pause.** Le total est un plancher, dit comme tel deux fois à
  l'écran.

---

## 7. Ce que j'ai vérifié, et comment

**① Le calcul solaire, contre un calcul à la main.**
`soleil()` rend pour Antananarivo (−18,910 ; 47,526) : 21 juin lever 06 h 22 /
coucher 17 h 21 ; 21 décembre 05 h 10 / 18 h 26 ; 17 août 06 h 09 / 17 h 39.
J'ai refait les trois à la main (angle horaire par
`acos(cos z / (cos φ cos δ) − tan φ tan δ)`, midi solaire corrigé de l'équation
du temps et de la longitude) : **écart maximal 1 minute**. Contrôle
supplémentaire d'écartement : le même 17 août, Toliara (−23,35) couche à 17 h 50
et Antsiranana (−12,28) à 17 h 39 — 11 minutes d'écart sur 13 degrés de
latitude, recalculés à la main également.

**② Les invariants du plan, sur 32 840 plans générés.**
`planifier()` exécuté sur les 1 642 paires planifiables × 4 dates (15 janvier,
21 juin, 17 août, 21 décembre) × 5 heures de départ (05 h, 06 h, 08 h, 15 h,
20 h). Contrôles à chaque fois :

- la chaîne de tronçons part bien du départ et finit bien à l'arrivée, sans trou ;
- la somme des tronçons répartis dans les journées égale l'itinéraire complet ;
- l'horloge est strictement monotone d'un tronçon au suivant, jours compris ;
- une journée non marquée « nuit subie » ne contient **aucun** tronçon roulant
  après le coucher du soleil ;
- `heuresTotal` égale la somme des durées relevées ;
- la dernière journée se termine bien sur la destination demandée.

**Résultat : 0 anomalie sur les 20 combinaisons.**

**③ Le rendu réel des composants, avec les vraies données.**
Les composants ont été bundlés (esbuild, alias `@/` du `tsconfig.app.json`) et
rendus par `react-dom/server` avec les 42 tronçons de production et les
établissements réels d'Ambalavao, Toliara et Zombitse. Sept cas passés en revue
sur le HTML produit : Tana → Toliara, Tana → Morondava, Tana → Zombitse,
Tana → Nosy Be (échec attendu), Tana → Zafimaniry, **Toliara → Tana** (sens
inverse), Tana → Antsiranana (24 h). Vérifié sur le texte rendu : distances,
durées, horaires, marges sur le soleil, étiquettes, noms d'établissements,
états de route — tous conformes à la base.

**Trois défauts trouvés et corrigés par ce rendu** — ils seraient tous passés
inaperçus sans lui :

1. `Antananarivo → Antsiranana`, 24 h de route parti à 6 h, arrivait à 6 h le
   lendemain et l'écran annonçait **« 11 h 39 avant la nuit »**. Rigoureusement
   exact, et le pire conseil possible : on venait de rouler toute la nuit. La
   marge n'est plus affichée sur une journée qui a roulé dans le noir.
2. Le même trajet affichait **« pour arriver avant la nuit, il faudrait partir à
   17 h 39 »** — une heure du soir parfaitement plausible, obtenue en repliant
   une valeur négative dans la journée. Remplacé par « ce tronçon dure plus
   longtemps qu'une journée entière ».
3. Le numéro et la date des journées se décalaient dès qu'un tronçon franchissait
   minuit : le premier jour d'un Tana → Antsiranana s'affichait « mardi 18 »
   alors que le départ était le lundi 17.

**④ Un quatrième défaut, trouvé en relisant `src/hooks/useReveal.ts`.**
`.dk-reveal` part à `opacity: 0` et n'est révélé que par un observateur lancé par
`useReveal`. `/y-aller` l'appelle sur SES données ; le graphe du planificateur
arrive après, donc l'observateur était déjà passé. Le filet de sécurité de
l'application n'attend que 700 ms — moins que la RPC sur une 3G. **Le bloc
serait resté invisible, sans la moindre erreur nulle part** : exactement le
défaut décrit dans le commentaire du hook, constaté en production sur `/sites`.
Corrigé par un `useReveal(graphe)` dans `Planificateur.tsx`, sur sa propre
dépendance.

**⑤ Types et style.** `npx tsc -p tsconfig.app.json --noEmit` : **0 erreur**
(sur tout le dépôt). `npx eslint` sur `src/lib/trajet.ts`,
`src/components/trajet/` et `src/pages/YAller.tsx` : **0 avertissement**.

**⑥ Couverture.** Les 1 642 / 164 / 1 806 du § 5 sont un comptage exécuté, pas
une estimation.

**⑦ Périmètre des fichiers.** `git status` contrôlé : seuls `src/pages/YAller.tsx`
(modifié), `src/lib/trajet.ts`, `src/components/trajet/`, `docs/chantiers/` et
les migrations `0099`/`0100` portent ma marque. Aucun nom de fonction ne heurte
les migrations `0097`, `0098` et `0101` de l'autre agent (vérifié par recherche).
Aucun `npm run build`, `npm run dev`, ni écriture dans `dist/`. Aucun `git add`,
`commit` ni `push`.

---

## 8. Ce que je n'ai PAS pu faire

- **Exécuter les migrations 0099 et 0100.** Consigne explicite : j'écris les
  `.sql`, je ne les applique pas. **Leurs assertions n'ont donc jamais tourné.**
  Elles sont écrites pour échouer bruyamment si le graphe rendu est incomplet, si
  un tronçon pointe vers un lieu absent, si un compteur ment, si une fiche
  dépubliée fuit, ou si les droits sont mal posés — mais c'est à l'application
  qu'on le saura. J'ai en revanche reproduit à l'identique, par lectures
  PostgREST directes, les résultats que les deux fonctions doivent produire
  (43 sommets, 42 arêtes, comptages d'établissements par lieu), et c'est sur ces
  résultats-là que le planificateur a été rendu et vérifié.
- **Lancer l'application** (`npm run dev` / `npm run build` interdits — un autre
  agent travaille dans le dossier). La vérification visuelle a été faite par
  rendu serveur hors application ; les styles Tailwind eux-mêmes n'ont donc pas
  été vus à l'écran. Les classes employées n'utilisent que des jetons déjà en
  service ailleurs dans le projet (`bg-ok`/`text-ok-foreground`,
  `bg-accent/15`/`text-accent-strong`, `bg-warn-soft`/`text-warn`), choisis pour
  tenir en thème sombre comme en thème clair.
- **Vérifier les 42 durées elles-mêmes.** Elles viennent du lot 1 ; ce chantier
  les met bout à bout, il ne les recontrôle pas.
- **Couvrir Nosy Be.** Il manque un tronçon vers Ankify. Une ligne de plus dans
  `place_access` — et une seule — rendrait 82 paires planifiables d'un coup.
- **Un mode « je veux arriver à telle heure »** (calcul à rebours) : faisable
  avec les mêmes données, mais hors demande.

---

## 9. Ce qu'il reste à faire côté propriétaire

1. Appliquer `0099` puis `0100` (dans cet ordre), et lire les éventuels
   `raise warning`.
2. Régénérer `src/integrations/supabase/types.ts`.
3. Ouvrir `/y-aller` et vérifier d'un œil le cas de référence :
   `/y-aller?de=antananarivo-2&vers=toliara&date=2026-08-17&h=06:00&hm=06:00`
   doit donner 941 km, 19 h 30, nuit à Ambalavao le premier jour, arrivée à
   Toliara le lendemain à 15 h 30.
4. Décider s'il garde le sens inverse (§ 2).
5. S'il veut Nosy Be : relever Antananarivo → Ankify.
