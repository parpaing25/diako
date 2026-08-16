# Ce qui reste à faire — Diako

Relevé du **16/08/2026**, établi par inspection du code et de la base, pas de
mémoire. Chaque point porte sa preuve : un fichier avec sa ligne, ou une
requête SQL avec son résultat chiffré.

> ⚠️ **Aucun point n'est classé « fini » dans ce document, et c'est un biais de
> la méthode, pas un constat.** La contre-expertise avait pour consigne de
> réfuter en cas de doute — une consigne rayée à tort n'est jamais reprise,
> alors qu'une consigne gardée à tort coûte seulement une relecture. Lisez donc
> « partiel » comme « livré, avec un cas non traité », et non comme « à
> refaire ».

---


## Profils professionnels et revendication

### Séparer voyageur et professionnel à l'inscription

🟠 partiel

**Ce qui manque** — Le choix voyageur/pro ne figure pas sur l'écran d'inscription lui-même. Qui s'inscrit par Google, ou qui clique « Plus tard » (Bienvenue.tsx:181-186), ou qui a déjà validé /bienvenue en voyageur, n'a plus AUCUN écran pour devenir pro : l'action « Je suis un pro » de PagePro.tsx:252 mène à /compte qui ne le propose pas. Parcours en cul-de-sac.

<sub>Preuve : L'écran d'inscription ne sépare rien : src/pages/Auth.tsx:76-80 appelle signUp({email, password, options:{emailRedirectTo: `${origin}/bienvenue`}}) — aucun choix de type. La séparation vit sur src/pages/Bienvenue.tsx:118-140 (fieldset « Vous êtes… » voyageur/pro), atteint UNIQUEMENT par la redirection de confirmation d…</sub>

### Le professionnel déclare son métier

🟠 partiel

**Ce qui manque** — « partiel » au mieux. Le formulaire existe et la contrainte est bonne, mais l'écran est atteignable par un seul chemin sur deux, sans retour possible, et la preuve de prod est vide. 1) LA MOITIÉ DES INSCRIPTIONS NE VOIT JAMAIS L'ÉCRAN. Auth.tsx:106-112 : `signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } })` — le retour Google tombe sur l'accueil, jamais sur /bienvenue. Seule l'inscription par mot de passe y passe (Auth.tsx:79 `emailRedirectTo: .../bienvenue`). Et le bouton Google est OUVERT en prod : `select cle, actif from public.app_flags` → `facebook_login=false, google_login=TRUE, signup_open=true`. Or Bienvenue.tsx:70 est le SEUL appel à `deven…

<sub>Preuve : src/pages/Bienvenue.tsx:146-170 : le <select id="metier"> n'est rendu que si `type === "pro"`, avec les 7 codes hotellerie/restauration/guide/agence/transport/artisanat/autre ; il part avec l'appel supabase.rpc("devenir_pro", { p_metier: metier }) à la ligne 70. Côté base, migration 0069_verrou_type_de_compte.sql:80-83…</sub>

### Revendiquer exige une photo réelle du lieu, un NIF, un STAT ou une carte prouvant la propriété

🟠 partiel

**Ce qui manque** — La photo du lieu n'est jamais exigée (marquée « facultatif », absente de la condition `assez`). Et l'exigence entière est côté navigateur : un appel direct à rpc('revendiquer_page', {p_page, p_message:null, p_tel:null, p_nif:null, p_stat:null, p_piece:null, p_photo_lieu:null, p_role:null}) par un compte pro crée un dossier sans la moindre pièce. Aucune contrainte CHECK ni test dans la RPC ne l'empêche.

<sub>Preuve : Côté écran seulement : src/components/Revendication.tsx:54 `const assez = (vNif.ok && vStat.ok) || Boolean(piece);` et ligne 234 `disabled={envoi || !assez || enCours !== null}`. La photo du lieu est explicitement hors du compte : ligne 196 titre="Une photo du lieu (facultatif)", et `photo` n'apparaît pas dans `assez`.…</sub>

### SEUL un profil professionnel voit le bouton revendiquer

🟠 partiel

**Ce qui manque** — Au sens littéral de la consigne, non : un visiteur anonyme voit « C'est mon établissement » sur PagePro.tsx:1055-1061 et sur le panneau collant. Choix assumé en commentaire, mais il contredit « SEUL un profil professionnel voit le bouton ». Accessoirement l'attribut HTML `hidden` n'est qu'un affichage — sans conséquence ici puisque la base refuse, mais ce n'est pas un masquage au niveau du rendu.

<sub>Preuve : Le bouton est masqué au voyageur CONNECTÉ, mais montré au visiteur non connecté — c'est écrit dans la condition elle-même : src/pages/PagePro.tsx:1057 `hidden={!!user && !estPro}` (user null ⇒ expression false ⇒ bouton visible) et :1073 `peutRevendiquer={!user || estPro}`, commenté en src/components/PanneauDemande.tsx:…</sub>

### L'inscription n'est pas bloquée si l'on ne revendique pas

🟠 partiel

**Ce qui manque** — le non-blocage est réel, mais il est obtenu en rendant la revendication DÉFINITIVEMENT inaccessible à quiconque ne coche pas « Professionnel » sur cet écran unique. La promesse citée en preuve par le premier examen (Bienvenue.tsx:165-168 « Vous pourrez revendiquer votre établissement ensuite — rien ne vous y oblige maintenant ») est fausse : il n'existe aucun « ensuite ». 1) UN SEUL POINT D'ENTRÉE VERS `pro`, DANS TOUT LE DÉPÔT. `grep -rn "devenir_pro" .` (hors node_modules/dist) → 1 seul appel client : src/pages/Bienvenue.tsx:70, et il est conditionné par `if (type === "pro")` (ligne 69). Aucun autre écran : src/pages/Compte.tsx ne fait qu'AFFICHER le statut (ligne 183 `account_type === "pr…

<sub>Preuve : Aucun garde de route dans src/App.tsx : `grep -n "Navigate|Guard|redirect|profile|account_type|display_name" src/App.tsx` → 0 résultat, pour 38 déclarations <Route> (grep -c '<Route' = 38). src/pages/Bienvenue.tsx:181-186 offre un bouton « Plus tard » qui fait navigate("/") sans écrire quoi que ce soit ; le seul useEff…</sub>

### Une page a UN propriétaire, mais sa gestion est partagée à plusieurs

🟠 partiel

**Ce qui manque** — Aucun écran pour inviter, lister ou retirer un gestionnaire. Et même si une ligne était insérée à la main, le gestionnaire ne verrait pas la page dans /pro (mesEtablissements filtre owner_id) et serait renvoyé sur « refus » par ProConsole.tsx:105. La gestion partagée est inatteignable par un geste utilisateur : 0 ligne en base.

<sub>Preuve : UN propriétaire : tenu. pages.owner_id est unique et gelé — supabase/migrations/0076_cogestion_des_pages.sql:107 `new.owner_id := old.owner_id;` dans pages_avant_ecriture, et 0070_revendication_verrouillee.sql:96-98 refuse d'accepter une revendication si owner_id n'est pas null. SQL : select count(*) from pages → 3355,…</sub>

### Vérification SQL : devenir_pro et revendiquer_page ne sont pas exécutables par anon

🟠 partiel

**Ce qui manque** — Rien sur les deux fonctions demandées. À noter au passage, hors consigne mais vérifié dans la même requête : page_a_moi(uuid) rend anon=true — la règle des trois révocations de 0071 n'a pas été appliquée à cette fonction de 0076. Sans conséquence (SECURITY DEFINER lisant auth.uid(), donc false pour anon), mais c'est la même omission que celle que 0071 corrigeait. — La vérification est incomplète et le verrou qu'elle prétend valider est contournable ailleurs — 4 défauts vérifiés en base et en code. (1) LA PREUVE NE CORRESPOND PAS À SA PROPRE REQUÊTE. La requête citée énumère 5 fonctions, le résultat rapporté n'en restitue que 4. La ligne omise est la seule qui répond `true`. Rejoué en prod (p…

<sub>Preuve : Requête : select p.proname, pg_get_function_identity_arguments(p.oid), has_function_privilege('anon', p.oid,'execute'), has_function_privilege('authenticated', p.oid,'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('devenir_pro','revendiquer_page','accepte…</sub>


## Publier

### ⑥ Consigne « des cartes de récits sous « y aller » »

🔴 **pas fait**

**Ce qui manque** — Aucune carte de récit sur /y-aller ; aucune requête vers posts dans YAller.tsx. Sur la fiche destination, les cartes existent (photo + auteur + date + extrait, lien vers /post/:id, Destination.tsx:389-407) mais ne sont pas placées sous la rubrique « Y aller » et restent invisibles sous 1920 px.

<sub>Preuve : La page /y-aller est src/pages/YAller.tsx (App.tsx:147 `<Route path="/y-aller" element={<YAller />} />`, 313 lignes). `grep -i "recit|récit"` sur ce fichier → aucune correspondance. Ses sections (YAller.tsx:139, :188, :262, :285) sont toutes alimentées par le seul appel `supabase.rpc("y_aller")` (:95), qui sert des tra…</sub>

### ① Le lieu est-il demandé ET EXIGÉ quand la publication porte une photo

🟠 partiel

**Ce qui manque** — Le lieu reste 100 % facultatif : on peut publier une photo (ou n'importe quel type) sans lieu, le bouton « Publier » part et l'insert passe (posts.place_id est nullable, aucune contrainte NOT NULL ni CHECK côté base — pg_constraint sur public.posts ne contient que kind/status/prix/visibilite/non_vide). Le drapeau `lieu` de typesPublication.ts est du réglage mort.

<sub>Preuve : DEMANDÉ : src/pages/Publier.tsx:400-408 rend <ChampLieu> pour tous les types, avec la phrase « Le lieu rend votre publication trouvable ». EXIGÉ : nulle part. src/lib/typesPublication.ts déclare le drapeau `lieu: boolean | null` (:59) mais met `lieu: false` sur les 5 types — recit :84, assiette :99, bon_plan :117, ques…</sub>

### ② Les 5 types de publication sont-ils branchés jusqu'à l'écriture en base

🟠 partiel

**Ce qui manque** — Le montant d'un « bon plan » (champ exigé, Publier.tsx:211) et le plat d'une « assiette » (exigé, :210) sont écrits en base puis jamais réaffichés nulle part dans l'app — le chiffre qui fait le bon plan n'existe pour aucun lecteur. Zéro ligne en base porte dish_id ou price_ar : aucun des types assiette/bon_plan/question/photo n'a jamais produit de ligne. Autre écart de branchement : le bloc photos (Publier.tsx:361-386) est rendu sans condition alors que `def.photos === null` vaut « champ absent » (typesPublication.ts:58) pour les types question et… il n'y a donc pas de type sans photos à l'écran.

<sub>Preuve : ÉCRITURE : OK. Publier.tsx:223-236 appelle publier({kind: type, …}) ; src/lib/api.ts:217-233 fait l'insert avec `kind: entree.kind` + .select('id').maybeSingle(). La contrainte SQL accepte les 5 : posts_kind_check = CHECK (kind = ANY (ARRAY['recit','photo','assiette','bon_plan','question','avis','promo','alerte'])). RL…</sub>

### ③ Que se passe-t-il si l'utilisateur ne trouve pas son lieu dans la liste

🟠 partiel

**Ce qui manque** — Un lieu écrit à la main rend le post introuvable par TOUS les chemins de lecture (recherche, fiche destination, près de moi, lieux du profil), pas seulement par la page de destination — c'est la seule conséquence annoncée à l'écran. Le lien du fil PostCard.tsx:223-229 pointe vers /recherche?q=<texte libre>, qui ne ramènera jamais le post lui-même. Aucune normalisation ni regroupement des saisies libres.

<sub>Preuve : LA SAISIE LIBRE EXISTE et est de première classe : src/components/ChampLieu.tsx:117-123 `saisirLibre()` pose {id: null, nom} ; :267-287 l'option « Utiliser « X » tel quel » apparaît dès 2 caractères (:167), même quand la liste est pleine ; :289-294 l'état vide le dit ; :201-204 la touche Entrée y retombe ; :157-162 ave…</sub>

### ④ Mesure SQL : posts publiés avec place_id NULL

🟠 partiel

**Ce qui manque** — 0 % de place_id NULL ne mesure rien du formulaire : les 28 posts sont un lot d'amorçage, un seul auteur (« diako »), tous du même jour en 3 h 23, tous de type recit, aucun avec dish_id ni price_ar. Aucune publication issue de /publier par un utilisateur réel n'existe en base — l'efficacité réelle du champ Lieu est non mesurée, et le sera d'autant moins que le champ n'est pas exigé (constat ①).

<sub>Preuve : Requête : select count(*) total, count(*) filter (where place_id is null) sans_place_id, count(*) filter (where place is null) sans_place_txt, min(created_at), max(created_at), count(distinct author_id) from posts where status='published' → total 28, sans_place_id 0, sans_place_txt 0, premier 2026-07-31 16:57:29+00, de…</sub>

### ⑤ Consigne « rendre ce 1 récit cliquable »

🟠 partiel

**Ce qui manque** — Le lien ne mène à un contenu visible que sur un écran ≥ 1920 px ; sur téléphone et sur un portable 1366/1440/1600 px il est inerte. Et le compteur peut annoncer un récit que la liste n'affichera pas (privé), auquel cas la cible de l'ancre n'existe pas du tout dans le DOM.

<sub>Preuve : Le badge est bien devenu un lien : src/pages/Destination.tsx:184-191 `<a href="#recits">{f.nb_recits} récit… — les lire</a>`. Mais sa cible, `<section id="recits">` (Destination.tsx:383-384, unique occurrence de id="recits" dans le fichier), est à l'intérieur de l'aside Destination.tsx:355 `className="mt-6 hidden shrin…</sub>


## Remplissage du référentiel

### pages (établissements) — total publié et couverture photo

🔴 **pas fait**

**Ce qui manque** — Zéro photo sur les 3254 établissements publiés : ni cover_url, ni logo_url, ni galerie. 3254 couvertures à produire.

<sub>Preuve : SQL sur pages : total=3355, publiees=3254, pub_cover=0, pct_cover=0,0 %, pub_logo=0, pub_galerie=0 (jsonb_array_length(gallery)>0). Répartition : restaurant 1816 pages / 0 cover, hotel 1421 / 0, location_vehicule 18 / 0.</sub>

### pages (établissements) — prix

🔴 **pas fait**

**Ce qui manque** — 3216 établissements publiés sans aucun prix (98,8 %). Les tables tarifaires annexes sont vides : season_rates=0 ligne, menu_sections=0 ligne, menu_items=4 lignes réparties sur 4 pages.

<sub>Preuve : SQL sur pages (is_published) : pub_prix (price_min_ar non nul)=38 sur 3254 = 1,2 % ; pub_price_level=6. Par catégorie : hotel 33/1421, restaurant 6/1816, location_vehicule 0/18.</sub>

### pages (établissements) — horaires

🔴 **pas fait**

**Ce qui manque** — La table page_hours est vide. Aucun des 3254 établissements publiés n'a d'horaires : couverture 0,0 %.

<sub>Preuve : SQL : select count(*) from page_hours → 0 ligne ; count(distinct page_id) → 0 ; pages_publiees=3254.</sub>

### events — les affiches (poster_url) et le champ que la page /evenements lit réellement

🔴 **pas fait**

**Ce qui manque** — 42 affiches à produire (0 %). Surtout : le remplissage effectué (mois/periode/lieu_libre) n'alimente pas la page /evenements, qui lit starts_on/place_id/poster_url — trois colonnes vides à 100 %.

<sub>Preuve : SQL : avec_affiche (poster_url non nul)=0 sur 42. Et la page lit des colonnes vides : src/lib/decouverte.ts:344-348 sélectionne « starts_on, ends_on, poster_url, price_ar, organizer, place:places(...) » et ordonne par starts_on ; src/pages/Evenements.tsx:98 appelle periode(e.starts_on, ...) qui fait new Date(debut) lig…</sub>

### attractions — total publié et couverture photo

🟠 partiel

**Ce qui manque** — 2267 attractions publiées sur 2476 n'ont AUCUNE photo (91,6 %). Il manque 2267 couvertures pour atteindre 100 %.

<sub>Preuve : SQL sur attractions : total_toutes=2521, publiees=2476, pub_avec_cover=209, pub_sans_cover=2267, pct_cover_pub=8,4 %. (requête : count(*) filter (where is_published and coalesce(cover_url,'')<>''))</sub>

### attractions — « tous les sites et parcs » : le détail par type demandé par la consigne

🟠 partiel

**Ce qui manque** — La consigne visait « sites et parcs » : les sites sont à 15,2 % (532 sans photo) et les parcs à 2,5 % (119 sans photo). Seuls les 35 parcs nationaux nommés comme tels sont à peu près servis (12 encore sans photo). 116 items de 5 types entiers (grottes, musées, parcs animaliers, œuvres, sources) n'ont pas une seule photo.

<sub>Preuve : SQL group by kind (is_published) : site 95/627=15,2 % ; parc 3/122=2,5 % ; reserve 44/133=33,1 % ; sommet 15/801=1,9 % ; plage 10/318=3,1 % ; patrimoine 33/300=11,0 % ; point_de_vue 4/35 ; cascade 4/20 ; aire 1/4. Cinq types sont à 0 % : grotte (0/27), musee (0/27), parc_animalier (0/25), oeuvre (0/23), source (0/14). …</sub>

### places — total, destinations touristiques, couverture photo

🟠 partiel

**Ce qui manque** — 500 destinations touristiques sur 522 sont sans photo. Sur l'ensemble des 22 707 lieux (import OSM), 22 683 sont sans photo.

<sub>Preuve : SQL sur places : total_places=22707, non_fusionnees=18347, touristiques=522, touristiques_avec_cover=22 (4,2 %), total_avec_cover=24 (0,11 %).</sub>

### places — remplissage éditorial (résumé, pourquoi y aller)

🟠 partiel

**Ce qui manque** — 429 destinations touristiques sans résumé, 517 sans « pourquoi y aller ». Seules 5 destinations portent un why_go — les mêmes 5 que la saisonnalité.

<sub>Preuve : SQL sur places : tour_total=522, tour_avec_summary=93 (17,8 %), tour_avec_whygo=5 (0,96 %), tour_avec_region=521. Sur les 22 707 lieux, total_avec_summary=95.</sub>

### pages — le reste des champs de fiche (téléphone, description, équipements, vérification)

🟠 partiel

**Ce qui manque** — Seule la géolocalisation est garnie (98,6 %). La complétude moyenne déclarée par la base elle-même est de 17,3/100. 2875 pages sans téléphone, 3165 sans description, 3249 sans équipements, 0 page vérifiée.

<sub>Preuve : SQL sur pages (is_published) : pub_tel=379 (11,6 %), pub_desc (short_desc)=89 (2,7 %), pub_geo=3209 (98,6 %), completeness moyenne=17,3/100, pages_verifiees (verification_status='verified')=0. Tables liées : page_amenities → 5 pages distinctes, page_cuisines → 1 page, room_types → 35 pages, reviews → 0 ligne.</sub>

### place_seasons — combien de destinations ont leur saisonnalité

🟠 partiel

**Ce qui manque** — 517 destinations touristiques sur 522 n'ont aucune saisonnalité (0,96 % de couverture). Le tableau /quand-partir ne peut comparer que 5 lignes. À noter : 2 des 5 destinations vitrines (Nosy Be, Tsingy de Bemaraha) n'ont même pas de photo.

<sub>Preuve : SQL : lignes_place_seasons=60, places_avec_saison=5, places_saison_12mois=5, places_touristiques=522 → 0,96 %. Les 5 : Isalo, Mahajanga, Nosy Be, Sainte-Marie (nosy-boraha), Tsingy de Bemaraha — chacune 12 mois, 12 raisons renseignées. Le chiffre est assumé dans le code : src/pages/Guides.tsx:112 « cinq destinations po…</sub>

### place_access — combien de destinations ont au moins un accès

🟠 partiel

**Ce qui manque** — 482 destinations touristiques sur 522 sans aucune fiche d'accès (92,3 % manquants). Et 41 destinations n'ont qu'un seul mode d'accès chacune (42 lignes pour 41 lieux) : aucune comparaison route/avion/bateau possible.

<sub>Preuve : SQL : lignes_place_access=42, places_avec_acces=41 (distinct place_id), dont places_tour_avec_acces=40 touristiques → 40/522 = 7,7 %. Chiffre confirmé dans src/pages/Guides.tsx:112 (« et 41 »).</sub>

### events — combien, combien à venir, combien sourcés

🟠 partiel

**Ce qui manque** — Le remplissage par mois/période/source est fait (42/42), mais 0/42 événement porte une date (starts_on) : la notion « à venir » n'existe pas en base. Manquent aussi place_id (0/42, seul le texte libre lieu_libre est rempli), price_ar (0/42) et organizer (0/42).

<sub>Preuve : SQL sur events : total=42, publies=42, sources (chaîne non vide)=42 dont source_url (like 'http%')=42 → 100 % sourcés ; confiance : certaine=9, periode_sure=30, incertaine=3. MAIS avec_date (starts_on non nul)=0 → « à venir » est incalculable par date. Repli par mois : avec_mois=42, et 27/42 ont un mois ≥ 8 (reste de 2…</sub>

### dishes — combien, combien avec photo

🟠 partiel

**Ce qui manque** — Zéro photo sur les 95 plats. Le front prévoit bien un repli (src/pages/Plats.tsx:403 « plat.photo_url ? … : … ») donc rien n'est cassé, mais /plats et /gouts s'affichent sans aucune image. Manquent aussi les ingrédients (0/95) et 23 prix.

<sub>Preuve : SQL sur dishes : total_dishes=95, avec_photo (photo_url non vide)=0 → pct_photo=0,0 % ; avec_desc=95 (100 %), avec_prix=72 (75,8 %), avec_ingredients=0, dish_aliases=254.</sub>

### Les photos servies sont-elles réelles ? (vérification HTTP, pas seulement présence d'une URL)

🟠 partiel

**Ce qui manque** — RÉFUTÉ. Le test HTTP prouve qu'un fichier existe, pas qu'une PHOTO du lieu est servie. J'ai refait la vérification en entier et j'ai trouvé trois failles réelles. ═══ 1. LE PÉRIMÈTRE EST INCOMPLET : 147 URL n'ont jamais été testées ═══ Le premier examen n'a couvert que attractions.cover_url (209) + places.cover_url (24). Or la base sert 380 URL d'images : SQL : `with m as (select jsonb_array_elements(media)->>'url' url from posts where media is not null) select count(*), count(distinct url) from m;` → 147 URL, 147 distinctes, 147 sur diako.fonenako.mg — jamais testées, alors que c'est le fil d'actualité (posts.media, rendu par src/components/Carrousel.tsx:61 et src/pages/Favoris.tsx:230). Je…

<sub>Preuve : Toutes les URL pointent sur diako.fonenako.mg (SQL group by hôte : attractions 209, places 24 ; 233 URL distinctes, aucun doublon entre les deux tables). Test HTTP : échantillon aléatoire de 25 des 209 couvertures de couvertures.json → 25/25 en code 200 + Content-Type image/jpeg ; les 24 couvertures de lieux (photos_en…</sub>

### Stock de photos disponible localement mais non exploité

🟠 partiel

**Ce qui manque** — 856 photos de l'archive locale sur 902 n'ont jamais été envoyées, et 52 dossiers photo sur 97 ne sont rattachés à aucun site ni lieu de la base. Le gisement existe, l'appariement n'est pas terminé.

<sub>Preuve : c:\Users\ANDRIANIRINA\Desktop\Diako\inventaire_photos.json : 99 dossiers, 902 photos. rapprochement.json : 97 entrées, dont 45 appariées à un site ou un lieu, 52 non appariées. photos_envoyees.json : 46 envois (24 places + 22 attractions), 46 slugs distincts.</sub>


## Boutons « Retour »

### Écran /explorer?lieu=… (fiche destination allégée) — lien ArrowLeft « Toutes les destinations »

🔴 **pas fait**

**Ce qui manque** — Destination codée en dur : quand il y a une P-1 (arrivée depuis /recherche, /carte, un lien interne), la flèche ne la reprend jamais et pousse toujours vers le catalogue. Il faudrait `useRetour("/explorer")`, qui garderait le même repli en arrivée directe.

<sub>Preuve : src/pages/Explorer.tsx:219-225 : `<Link to="/explorer">` + `<ArrowLeft className="h-4 w-4"/>` + texte « Toutes les destinations ». grep useRetour sur tout src/ → 5 lignes seulement, toutes dans useRetour.ts, Carte.tsx et ProConsole.tsx : Explorer.tsx n'importe pas le hook. Cet écran reste atteignable par lien partagé e…</sub>

### Écran /messages?c=… (conversation ouverte) — flèche « Retour aux conversations »

🔴 **pas fait**

**Ce qui manque** — Après avoir ouvert puis quitté une conversation, il faut DEUX appuis sur le retour matériel Android pour sortir de /messages (liste→conv = push, conv→liste = push). Et la flèche devrait suivre l'historique (useRetour avec repli « liste des conversations »), pas supposer que l'on vient de la liste.

<sub>Preuve : src/pages/Messages.tsx:115-121 `<button onClick={() => setParams({})} aria-label="Retour aux conversations"><ArrowLeft/></button>`. Deux défauts prouvés : (1) destination codée en dur — l'entrée depuis une fiche se fait par src/pages/PagePro.tsx:224 `navigate(`/messages?c=${conv}`)`, donc la P-1 est la fiche de l'hôtel…</sub>

### Écran /publier — bouton « Annuler »

🔴 **pas fait**

**Ce qui manque** — On arrive sur /publier depuis une fiche destination (src/pages/Destination.tsx, lien « Racontez-y un voyage » vers /publier) ou depuis /quand-partir:379 et /y-aller:297 ; « Annuler » y jette l'utilisateur sur le fil au lieu de le ramener d'où il venait.

<sub>Preuve : src/pages/Publier.tsx:510-516 `<button type="button" onClick={() => navigate("/")}>Annuler</button>`. Destination en dur vers l'accueil.</sub>

### Écran /bienvenue — bouton « Plus tard »

🔴 **pas fait**

**Ce qui manque** — Sortie codée en dur vers l'accueil. À noter que la page pose déjà des `navigate("/", {replace:true})` en ligne 29 et 80 : le choix « Plus tard » n'est pas distingué du parcours normal.

<sub>Preuve : src/pages/Bienvenue.tsx:181-186 `<button onClick={() => navigate("/")}>Plus tard</button>`. Aucune référence à useRetour dans le fichier.</sub>

### Écran Attente (src/pages/Attente.tsx) — bouton « Retour à l'accueil »

🔴 **pas fait**

**Ce qui manque** — Écran orphelin : son bouton retour n'est ni atteignable ni vérifiable. À supprimer ou à rebrancher — en l'état il fausse tout inventaire des retours.

<sub>Preuve : Attente.tsx:62-68 `<Link to="/">Retour à l'accueil</Link>`, mais le composant n'est monté nulle part : `grep -rn "Attente" --include=*.ts --include=*.tsx src/` ne rend QU'UNE ligne, sa propre définition (pages/Attente.tsx:16). Aucune `<Route>` de src/App.tsx:108-158 ne l'utilise.</sub>

### Écran /p/:slug (fiche établissement) — aucun bouton retour

🔴 **pas fait**

**Ce qui manque** — C'est l'écran le plus partagé par lien du produit (l'argument WhatsApp est écrit dans useRetour.ts:14-17) et il n'offre aucune affordance de retour : sur téléphone, seul le geste système permet de sortir.

<sub>Preuve : `grep -n "ArrowLeft|ChevronLeft|useRetour|navigate(-1)"` sur src/pages/PagePro.tsx → 0 résultat. L'en-tête de la fiche (PagePro.tsx:407-412) ne porte que le titre et le badge de vérification.</sub>

### Écran /lieu/:slug (fiche destination complète) — aucun bouton retour

🔴 **pas fait**

**Ce qui manque** — La variante allégée du même lieu (/explorer?lieu=) a, elle, une flèche (Explorer.tsx:219-225) : deux écrans pour le même lieu, un seul avec un retour. Incohérence visible pour l'utilisateur.

<sub>Preuve : `grep -n "ArrowLeft|ChevronLeft|useRetour|navigate(-1)"` sur src/pages/Destination.tsx → 0 résultat. Le premier élément de la page est la photo (Destination.tsx, figure `f.lieu.cover_url`), puis directement l'identité — pas de flèche.</sub>

### Écran /post/:id (récit à son adresse propre) — aucun bouton retour

🔴 **pas fait**

**Ce qui manque** — Écran cible des notifications et du bouton Partager (commentaire Post.tsx:11-19) : on y arrive toujours d'ailleurs, et rien ne ramène à cet ailleurs.

<sub>Preuve : `grep -n "ArrowLeft|ChevronLeft|useRetour|navigate(-1)"` sur src/pages/Post.tsx → 0 résultat. Le seul `to="/"` du fichier est en Post.tsx:89-95, dans l'état « Cette publication n'existe plus ».</sub>

### Couverture réelle du hook sur l'ensemble des écrans

🔴 **pas fait**

**Ce qui manque** — Il y a 4 affordances de retour réelles dans le produit ; 2 utilisent useRetour (Carte, ProConsole), 2 sont codées en dur (Explorer.tsx:219, Messages.tsx:116). La consigne « TOUT les boutons retour » n'est donc traitée qu'à moitié sur les boutons existants, et 30 écrans sur 35 n'en ont aucun.

<sub>Preuve : Dans src/pages, `grep -L -E "ArrowLeft|useRetour|navigate\\(-1\\)" *.tsx` rend 30 fichiers sur 35 — dont Compte, Parametres, Favoris, Notifications, Projet, Recherche, Plats, Plat, Sites, Site, Circuits, Circuit, Guides, QuandPartir, YAller, Evenements, PagePro, Destination, Post, Profil. Les 5 fichiers restants sont C…</sub>

### « Clique retour » matériel quand une couche modale est ouverte

🔴 **pas fait**

**Ce qui manque** — Sur Android, appuyer sur le retour matériel avec le tiroir ou les commentaires ouverts quitte la page au lieu de refermer la couche. La demande vise explicitement « les boutons retour OU clique retour » : ce volet n'est pas traité.

<sub>Preuve : `grep -rn "popstate|pushState|useBlocker" src/ --include=*.ts --include=*.tsx` → 0 résultat. Aucune couche n'intercepte donc le retour système : MenuMobile.tsx:69-88 (tiroir `role="dialog" aria-modal`), Feed.tsx:305-321 (panneau commentaires plein écran), Carte.tsx:445-457 (feuille basse des adresses), Revendication.ts…</sub>

### Le hook src/hooks/useRetour.ts existe et sa logique est valide pour ce router

🟠 partiel

**Ce qui manque** — la prémisse « BrowserRouter v6.30 » est exacte, mais l'inférence « donc idx > 0 ⇒ il y a une page Diako derrière » est fausse sur l'un des deux seuls écrans qui appellent le hook, et l'autre moitié du hook est du code mort aujourd'hui. ① LA CONSOLE PRO — CAS ① DU COMMENTAIRE DU HOOK — N'AFFICHE JAMAIS SON BOUTON (donnée absente, prouvée en SQL). ProConsole.tsx:105 : `if (!user || f.owner_id !== user.id) return setEtat("refus");`. La branche « refus » (ProConsole.tsx:136-155) retourne AVANT l'entête et ne contient AUCUN bouton retour, seulement `<Link to="/pro">`. Or : SQL → `select count(*) as pages_total, count(*) filter (where owner_id is not null) as avec_proprietaire from public.pages;` …

<sub>Preuve : src/hooks/useRetour.ts:25-32 — `const idx = (window.history.state as {idx?:number}|null)?.idx ?? 0; if (idx > 0) navigate(-1); else navigate(repli, {replace:true});`. Le test `history.state.idx` est bien alimenté ici : package.json:65 `"react-router-dom": "^6.30.1"` et src/App.tsx:2 + :239 `<BrowserRouter>` (aucun Hash…</sub>

### Écran /carte — flèche « Retour » de l'en-tête

🟠 partiel

**Ce qui manque** — le bouton existe, mais la consigne « flèche Retour de l'en-tête /carte » n'est pas close : la preuve citée est un artefact de grep, le chemin de repli reste codé en dur exactement là où le hook interdit de l'être, et la barre qui porte la flèche est calée sur une variable CSS inexistante. 1) LA PREUVE CITÉE NE PROUVE PAS CE QU'ELLE DIT. `grep "navigate("` est sensible à la casse : il ne peut PAS matcher `useNavigate()`. Le fichier garde bel et bien un `navigate` résiduel — c:\Users\ANDRIANIRINA\Desktop\Diako\src\pages\Carte.tsx:3 `import { Link, useNavigate, useSearchParams } from "react-router-dom";` et Carte.tsx:102 `const navigate = useNavigate();`. Liaison MORTE : `git show db97ed6 -- sr…

<sub>Preuve : src/pages/Carte.tsx:103 `const retour = useRetour("/");` et Carte.tsx:344-351 `<button onClick={retour} aria-label="Retour"><ArrowLeft/></button>`. Aucun `navigate(` résiduel dans le fichier (grep "navigate(" sur pages/Carte.tsx → 0 résultat).</sub>

### Écran /pro/:slug (console de gestion) — flèche « Retour »

🟠 partiel

**Ce qui manque** — la flèche existe bien dans le code, mais elle est posée sur la seule branche de /pro/:slug que la production ne peut PAS atteindre. Cinq constats vérifiés. 【1】L'ÉCRAN QUI PORTE LA FLÈCHE EST INATTEIGNABLE EN PROD (chiffré) SQL sur eifrwecaszzqrdwjjjbu : select count(*) filter (where owner_id is null) as sans_proprio, count(*) as total from public.pages; → sans_proprio = 3355, total = 3355 — soit 100 % des fiches sans propriétaire. select count(distinct owner_id) from public.pages where owner_id is not null; → 0 gérant. Or C:\Users\ANDRIANIRINA\Desktop\Diako\src\pages\ProConsole.tsx:105 : `if (!user || f.owner_id !== user.id) return setEtat("refus");` Le RPC qui alimente la page renvoie bien …

<sub>Preuve : src/pages/ProConsole.tsx:87 `const retour = useRetour("/pro");` et ProConsole.tsx:168-174 `<button onClick={retour} aria-label="Retour">`. L'ancien `navigate("/pro")` a bien disparu : grep "navigate(" sur pages/ProConsole.tsx → 0 résultat.</sub>

### Assistant de création de fiche (monté dans /pro) — bouton « Retour » de l'étape

🟠 partiel

**Ce qui manque** — L'étape n'est portée que par le brouillon localStorage (AssistantEtablissement.tsx:104-110, clé CLE_BROUILLON) et jamais par l'URL : le retour matériel du téléphone, à l'étape 3, ne revient pas à l'étape 2 — il quitte /pro entièrement. Le « clique retour » demandé par le propriétaire n'est donc pas couvert ici.

<sub>Preuve : src/components/AssistantEtablissement.tsx:402-409 `{etape > 0 && <button onClick={() => maj("etape", etape - 1)}><ArrowLeft/>Retour</button>}` — c'est un retour d'ÉTAPE, pas de route, et à ce titre il fait bien P-1. Monté par src/pages/EspacePro.tsx:183-185.</sub>

### Écran 404 (route *) — lien « Retour à l'accueil »

🟠 partiel

**Ce qui manque** — Le libellé dit « Retour » mais la destination est en dur. Sur une 404 la P-1 existe et a du sens (la page qui portait le lien mort) ; aujourd'hui l'utilisateur perd son fil et repart de l'accueil.

<sub>Preuve : src/pages/NotFound.tsx:12-18 `<Link to="/">Retour à l'accueil</Link>`, monté par src/App.tsx:158 `<Route path="*" element={<NotFound/>} />`.</sub>

### Écran /user/:id, état « Profil introuvable » — lien « Retour à l'accueil »

🟠 partiel

**Ce qui manque** — Même cas que la 404 : libellé « Retour », destination en dur. Idem pour les états vides frères qui ne disent pas « Retour » mais servent de seule sortie : PagePro.tsx:346-352 (« Explorer les destinations »), Destination.tsx (« Explorer Madagascar »), Plat.tsx:123, Site.tsx:148-154, Circuit.tsx:111-117, Guides.tsx:186-192, Post.tsx:89-95.

<sub>Preuve : src/pages/Profil.tsx:166-168 `<Link to="/" …>Retour à l'accueil</Link>`. Aucun useRetour dans le fichier.</sub>


## Accueil et fil

### Supprimer le bandeau d'accueil (barré en rouge sur la capture)

🟠 partiel

**Ce qui manque** — Retirer le bloc `<div class="hero">` (et son CSS) du squelette index.html, ou l'aligner sur ce que React rend réellement, puisque le commentaire index.html l.234-238 affirme « React rend exactement le même contenu » — ce qui est faux depuis la suppression. Et supprimer l'appel `chargerDestinations(12)` + les imports morts de DiakoHero.tsx.

<sub>Preuve : Côté React c'est fait : src/components/DiakoHero.tsx ne rend plus que la rangée de pastilles de catégories (lignes 51-112) et la suppression est documentée lignes 52-68 (« LE BANDEAU D'ACCUEIL ET "RÉGIONS ACTIVES" SONT SUPPRIMÉS »). MAIS le bandeau est toujours peint par le squelette statique : index.html lignes 222-23…</sub>

### Supprimer « Régions actives »

🟠 partiel

**Ce qui manque** — la recherche de chaîne ne prouve que l'absence du LIBELLÉ ; deux morceaux du bloc sont toujours en production. ① L'ÉCRAN OUBLIÉ : LE SQUELETTE STATIQUE PEINT ENCORE LE BANDEAU SUPPRIMÉ (défaut visible par l'utilisateur). Le commit de suppression est 1766739 « feat(accueil): on démarre sur le fil… » ; son message dit « Le bandeau d'accueil ET "Régions actives cette semaine" sont supprimés », motif d'Andry : « tout de suite on démarre sur le filtre ». `git show --stat 1766739` ne touche que 3 fichiers : src/components/DiakoHero.tsx, src/components/RightRail.tsx, src/lib/nav.ts. `git log -- index.html` → dernier passage 59b235c, ANTÉRIEUR. Or index.html:222-230 (et le build déployé dist/index.h…

<sub>Preuve : Recherche insensible à la casse sur tout le dépôt (`Régions actives|Regions actives|regions_actives|RegionsActives`) : 2 occurrences uniquement, toutes deux dans des COMMENTAIRES qui documentent la suppression — src/components/DiakoHero.tsx:52 et :56. Aucune occurrence de « région/regions » dans src/pages/Index.tsx (gr…</sub>

### Démarrer directement sur le filtre, comme Facebook

🟠 partiel

**Ce qui manque** — Brancher les pastilles de catégorie sur la requête du fil (aujourd'hui purement décoratives), et faire apparaître un filtre en haut de la version mobile — sinon « on démarre sur le filtre » n'est vrai qu'au-dessus de 768 px.

<sub>Preuve : SUR ORDINATEUR c'est le cas : src/pages/Index.tsx:40 rend `<DiakoHero>` en tout premier, et ce composant n'est plus que la rangée de pastilles de catégories (DiakoHero.tsx:71-111), suivie du Composer (Index.tsx:65) puis du Feed (Index.tsx:68). DEUX RÉSERVES VÉRIFIÉES. ① Le filtre sur lequel on atterrit ne filtre rien :…</sub>

### « En vogue » doit croiser vues, réactions, commentaires et proximité

🟠 partiel

**Ce qui manque** — Que le client utilise le `score` (ou au moins `vues`) rendu par `recits_en_vogue` au lieu de le recalculer sur les 3 seuls signaux explicites : sinon les vues et la proximité n'influencent que la composition du vivier de 12, jamais le classement final ni la jauge affichée. Et aucun profil ne déclare de ville, donc la proximité n'est jamais exercée en production.

<sub>Preuve : CÔTÉ BASE C'EST FAIT et déployé : `select proname, pg_get_function_identity_arguments(oid) …` sur pg_proc rend `recits_en_vogue(p_limite integer, p_lat double precision, p_lng double precision)` avec lit_vues=true, lit_proximite=true, lit_commentaires=true (définition = supabase/migrations/0077b_vues_lues_dans_le_chemi…</sub>

### « La saison en cours » doit utiliser de vrais événements datés

🟠 partiel

**Ce qui manque** — Le bloc du rail est correct, mais /evenements — sa seule suite — doit lire `periode`/`mois`/`source` au lieu de `starts_on`, sinon il fabrique la date exacte que la migration 0079 interdit explicitement. Et le rattachement des 42 événements au référentiel `places` n'a produit aucune correspondance : la région n'est jamais affichée.

<sub>Preuve : TABLE DES ÉVÉNEMENTS = `public.events`. SQL : `select count(*), count(*) filter (where is_published), count(*) filter (where source is not null and source<>''), count(*) filter (where periode is not null and periode<>''), count(*) filter (where starts_on is not null), count(*) filter (where array_length(mois,1)>0), cou…</sub>

### Plus aucun bouton en double dans le rail

🟠 partiel

**Ce qui manque** — Retirer soit l'entrée `/projet` de NAV_RAIL (nav.ts:99), soit la carte de bas de rail (SideNav.tsx:128-140) — les deux coexistent aujourd'hui. Et vérifier l'accès à « Publier » au-dessus de 1280 px, où plus aucune navigation ne le porte.

<sub>Preuve : L'essentiel du dédoublonnage est fait : src/lib/nav.ts:105-111 marque `railDesktop: false` sur /publier, /favoris, /gouts, /messages, /notifications, /compte, et `NAV_RAIL` les filtre (nav.ts:121) ; l'en-tête porte bien les équivalents (src/components/Header.tsx:98 SearchBar, :120 Messages, :140 Notifications, :181 Men…</sub>


## Filtres et tris

### /circuits — filtres et tri

🔴 **pas fait**

**Ce qui manque** — Tout filtre (durée, axe, difficulté, format) et tout tri — l'écran n'en propose aucun. Rien à vérifier côté ① tant que rien ne filtre.

<sub>Preuve : Aucun filtre, aucun tri, aucune pagination sur l'écran : le seul appel est `chargerCircuits(24)` (Circuits.tsx:51) et la fonction ne prend qu'une limite, sans un seul paramètre de filtre (decouverte.ts:194-205, `.order("duration_days")` en dur). ② État vide explicite et soigné : Circuits.tsx:116-148. ③ Circuits.tsx:45 …</sub>

### /evenements — filtres et tri

🔴 **pas fait**

**Ce qui manque** — Les filtres (mois/type/lieu) et surtout la pagination : 18 des 42 événements publiés ne sont atteignables par aucun chemin de l'écran, sans que rien ne le signale.

<sub>Preuve : Aucun filtre (ni mois, ni type, ni région) : appel unique `chargerEvenements(24)` (Evenements.tsx:52) ; la fonction n'accepte qu'une limite (decouverte.ts:340-352). ② État vide explicite Evenements.tsx:118-141 — mais il ne se déclenchera jamais. ③ Evenements.tsx:46 `useReveal(evts)` — le tableau. SQL : `select count(*)…</sub>

### /guides — filtres et tri

🔴 **pas fait**

**Ce qui manque** — Le filtre par famille de guide (`kind`), pourtant déjà étiqueté en dur dans l'écran.

<sub>Preuve : Aucun filtre ni tri : appel unique `chargerGuides(24)` (Guides.tsx:56), fonction sans paramètre de filtre (decouverte.ts:368-377, `.order("published_at")` en dur) alors que la table porte une colonne `kind` déjà traduite dans l'écran (Guides.tsx:26-32). ② État vide explicite Guides.tsx:100-133. ③ Guides.tsx:50 `useReve…</sub>

### /sites — filtre région (le point signalé « Analamanga ne montre rien »)

🟠 partiel

**Ce qui manque** — Les compteurs des pastilles de genre ne suivent pas la région : `compterSites()` est appelé sans argument (Sites.tsx:127) et la RPC est appelée sans paramètre (decouverte.ts:302), donc les chiffres restent nationaux. SQL : en Analamanga le genre `plage` compte 0 site publié alors que la pastille affichera « Côtes, baies et plages · 317 ». Le clic mène à un état vide correct, mais le compteur a menti avant.

<sub>Preuve : ① Le paramètre atteint la requête : Sites.tsx:98 `region: region || undefined` → decouverte.ts:288 `.eq("places.region", f.region)` avec `!inner` posé conditionnellement en decouverte.ts:284 ; dép. du useCallback correcte, `[genre, region, recherche]` Sites.tsx:119. Vérifié en vrai sur l'API anon : GET /rest/v1/attract…</sub>

### /plats — filtres famille / régime / recherche, et le filtre région annoncé

🟠 partiel

**Ce qui manque** — Le filtre région : aucun contrôle dans l'UI ; le code sous-jacent (decouverte.ts:66) filtre à vide sans erreur ; et la donnée n'existe pas (0 des 95 plats portent un lieu typique). Absent aussi : garde-fou de concurrence sur `charger` (Plats.tsx:70-91) — pas de `useRef` de version, contrairement à Sites.tsx:88.

<sub>Preuve : ① Famille, régime et texte atteignent la requête : Plats.tsx:75-81 → decouverte.ts:63 (`in("family")`), 73-78 (booléens de régime), 68 (`ilike`) ; dép. `[familles, regimes, q]` Plats.tsx:90, débounce 260 ms avec nettoyage Plats.tsx:107-110. ② État vide explicite Plats.tsx:248-269 « Aucun plat ne correspond à ces filtre…</sub>

### /recherche — filtres catégorie / budget / équipements / zone

🟠 partiel

**Ce qui manque** — ③ : passer le tableau de résultats en dépendance (Recherche.tsx:88) et révéler le bouton de recadrage de CarteResultats.tsx:239. En l'état, chaque clic de filtre remonte des cartes qui existent dans le DOM mais restent invisibles — la page paraît vide sans la moindre erreur.

<sub>Preuve : ① Les filtres atteignent la requête : Recherche.tsx:186-197 passe `categorie`, `prixMax`, `equipements` à `chercherPages` ; dép. `[q, categorie, budget, params.get("eq")]` Recherche.tsx:209 ; garde de version contre la course Recherche.tsx:160,182,199. La zone est appliquée côté client sur les 24 résultats déjà rendus …</sub>

### /carte — filtre par catégorie

🟠 partiel

**Ce qui manque** — Le filtre catégorie doit descendre dans `carte_grappes` (ou les pastilles doivent être neutralisées explicitement en vue d'ensemble au lieu de disparaître). Effet secondaire à constater : l'effet Carte.tsx:242-319 dépend de `[visibles, grappes]`, donc chaque clic de filtre rejoue `m.fitBounds` (Carte.tsx:316-318), recadre la carte, déclenche `moveend` et relance un chargement de zone.

<sub>Preuve : ① Le filtre ne touche PAS la requête : il est purement client sur `points` (Carte.tsx:193-201). Or au zoom d'ouverture (6, Carte.tsx:209) on est sous `ZOOM_DETAIL = 11` (Carte.tsx:56), la branche grappes s'exécute et fait `setPoints([])` (Carte.tsx:167). Conséquence mécanique : le compteur de chaque pastille vaut 0 (Ca…</sub>

### /explorer — filtre par grande région puis région administrative

🟠 partiel

**Ce qui manque** — Sur la fiche destination, le filtre de catégorie rend des cartes à `opacity: 0` : il faut une dépendance qui bouge (les établissements chargés) au lieu de `destinations`, qui est figé sur cette branche.

<sub>Preuve : CATALOGUE (sans `?lieu=`) : ① correct — `regionsFiltre` est passé à `chargerDestinations` ET à `compterDestinations` (Explorer.tsx:111-112) et repassé à la pagination (Explorer.tsx:532) ; dép. du useCallback sur les CHOIX et non sur le tableau dérivé (Explorer.tsx:138, motif écrit 134-137). Vérifié en vrai sur l'API an…</sub>

### /favoris — filtre par onglet (Adresses / Enregistrés / Aimés)

🟠 partiel

**Ce qui manque** — Passer une dépendance à `useReveal` en Favoris.tsx:34 (l'onglet et les listes) : sinon l'onglet « Enregistrés » affiche une page blanche alors que les publications sont bien dans le DOM.

<sub>Preuve : ① Le changement d'onglet déclenche bien le chargement paresseux (Favoris.tsx:45-66, dép. `[onglet, charger]`). ② Les trois onglets ont chacun un état vide explicite : Favoris.tsx:129-135, 193-199, 216-222. ③ 🔴 ÉCHEC sur l'onglet « Enregistrés ». Favoris.tsx:34 appelle `useReveal()` SANS ARGUMENT (dépendance `undefined`…</sub>

### /gouts — filtre par onglet (Goûtés / À goûter / Par famille)

🟠 partiel

**Ce qui manque** — Un état vide pour les onglets « À goûter » et « Par famille » ; la totalité du référentiel (55 des 95 plats ne sont jamais atteignables depuis cet écran) ; et une dépendance stable pour `useReveal` (Gouts.tsx:60).

<sub>Preuve : ③ La révélation fonctionne mais par accident : Gouts.tsx:60 `useReveal([onglet, carnet, tous])` passe un TABLEAU LITTÉRAL reconstruit à chaque rendu — la dépendance change toujours, donc l'effet et son IntersectionObserver sont détruits puis recréés à chaque rendu (useReveal.ts:36-72). Le contenu est bien révélé (les v…</sub>

### Transversal — pourquoi « filtrer ne montre rien » survit après le correctif

🟠 partiel

**Ce qui manque** — Le même correctif appliqué à Recherche.tsx:88, Favoris.tsx:34, Post.tsx:25, à la branche fiche d'Explorer et à CarteResultats.tsx:239.

<sub>Preuve : Le correctif f38af55 « fix(affichage): filtrer une liste la rendait INVISIBLE, pas vide » a remplacé `useReveal(liste.length)` par `useReveal(liste)` dans 11 fichiers seulement — `git show --stat f38af55` : Feed, Circuits, Evenements, Explorer, Gouts, Guides, Plats, Profil, QuandPartir, Sites, YAller. Trois écrans qui …</sub>


## « Mon compte » face à Fonenako

### Fonenako « Vérification KYC » (onglet du compte) — absent de Diako

🔴 **pas fait**

**Ce qui manque** — Tout le parcours d'identité : écran de dépôt de pièce, table/bucket, passage de profiles.verification de 'none' à un état vérifié.

<sub>Preuve : Fonenako UserDashboard.tsx:592 onglet « Vérification KYC » → KycTab.tsx:122-131 (dépôt dans le bucket storage kyc-documents), :182-190 (insert dans kyc_verifications), :197-198 (update profiles). Diako : Compte.tsx:60-67 ne déclare que 4 onglets (activite, profil, carnet, pages) ; la colonne profiles.verification EXIST…</sub>

### Fonenako « Abonnement » (onglet du compte) — absent de Diako

🔴 **pas fait**

**Ce qui manque** — Un onglet qui dit ce que le compte donne droit (même s'il dit simplement « tout est gratuit »).

<sub>Preuve : Fonenako UserDashboard.tsx:591 onglet « Abonnement » → SubscriptionTab.tsx:31 (« Tout Fonenako est 100 % gratuit »), :47-67 (liste de ce qui est inclus). Diako Compte.tsx:60-67 : aucun onglet équivalent, et `grep -rn "abonnement"` sur src/ ne rend rien de comparable.</sub>

### Fonenako : changer son mot de passe depuis le compte — absent de Diako

🔴 **pas fait**

**Ce qui manque** — Le changement de mot de passe une fois connecté (ancien mot de passe, confirmation, jauge de force).

<sub>Preuve : Fonenako SettingsTab.tsx:103-146 (ré-authentification par l'ancien mot de passe puis envoi d'un code à 6 chiffres via la fonction send-otp-email), :149-182 (vérification du code puis supabase.auth.updateUser({password})), :39-53 (jauge de force), :198-207 (« réinitialiser par e-mail »). Diako : `grep -rn "updateUser|re…</sub>

### Fonenako « Déconnecter tous les appareils » — absent de Diako

🔴 **pas fait**

**Ce qui manque** — L'action de fermer les sessions partout (le geste utile quand un téléphone est perdu).

<sub>Preuve : Fonenako SettingsTab.tsx:241 `supabase.auth.signOut({ scope: 'global' })`, bouton :536-549. Diako : `grep -rn "scope: *'global'|scope: *\"global\"" src/` = 0 occurrence ; Parametres.tsx:177 et Compte.tsx:142 n'appellent que signOut() local.</sub>

### Fonenako « Dernière connexion » dans les réglages — absent de Diako

🔴 **pas fait**

**Ce qui manque** — L'affichage de la date de dernière connexion.

<sub>Preuve : Fonenako SettingsTab.tsx:91 (lecture de last_sign_in_at) affiché :518-521. Diako Parametres.tsx n'affiche aucune information de session (le seul élément lié au compte est l'e-mail, Parametres.tsx:172).</sub>

### Fonenako : photo de couverture du profil — absente de Diako alors que la colonne existe

🔴 **pas fait**

**Ce qui manque** — Le téléversement de la couverture dans Compte.tsx (onglet profil) et son affichage sur /user/:id.

<sub>Preuve : Fonenako ProfileTab.tsx:305 bouton « Modifier la couverture » → :179-181 update profiles.cover_url. Diako : la colonne profiles.cover_url EXISTE (SQL information_schema.columns sur profiles) et est sélectionnée par UserDataContext.tsx:11, mais `grep -rn cover_url src/` ne rend que des établissements (AssistantEtablisse…</sub>

### Fonenako : champ « Téléphone » du profil — absent de Diako alors que la colonne existe

🔴 **pas fait**

**Ce qui manque** — Le champ téléphone dans l'onglet profil (et son écriture dans profiles.phone).

<sub>Preuve : Fonenako ProfileTab.tsx:433-437 (champ Téléphone) et :214 (phone dans le payload de sauvegarde). Diako : colonne profiles.phone présente en base (SQL) ; Compte.tsx OngletProfil (lignes 480-603) n'édite que display_name, home_place et bio — voir le payload Compte.tsx:436-441.</sub>

### Fonenako « Préférences de contact » (téléphone / WhatsApp / e-mail) — absent de Diako

🔴 **pas fait**

**Ce qui manque** — Le choix du canal de contact préféré, côté écran ET côté colonne.

<sub>Preuve : Fonenako ProfileTab.tsx:503-532 (3 cartes segmentées) sauvegardées :218 (contact_preference). Diako : `grep -rn contact_preference src/` = aucune occurrence ; la colonne n'existe pas non plus dans profiles (SQL : 18 colonnes listées, pas de contact_preference).</sub>

### Fonenako : « Complétion du profil » avec pourcentage et prochaine étape — absent de Diako

🔴 **pas fait**

**Ce qui manque** — Le calcul de complétude du profil membre et le bouton qui mène au champ manquant.

<sub>Preuve : Fonenako UserDashboard.tsx:455-465 (6 critères : photo, nom, bio, ville, identité vérifiée, première annonce), rendu :934-969 avec barre de progression et bouton « Compléter : … ». Diako Compte.tsx : l'en-tête (lignes 153-212) n'affiche que 4 compteurs, aucune notion de complétude. (Une barre de complétude existe chez …</sub>

### Fonenako : bloc « Actions rapides » dans le compte — absent de Diako

🔴 **pas fait**

**Ce qui manque** — Un bloc de raccourcis dans /compte (publier, messages, explorer…).

<sub>Preuve : Fonenako UserDashboard.tsx:1008-1031, 4 raccourcis (Publier, Je cherche, Messages, Explorer). Diako Compte.tsx : rien d'équivalent ; l'onglet « Mes carnets » (Compte.tsx:618-622) ne propose que 3 liens (favoris, goûts, projet) et n'est pas un bloc d'actions.</sub>

### Réglages de confidentialité — annoncés « bientôt » chez Diako

🔴 **pas fait**

**Ce qui manque** — Des réglages de confidentialité qui écrivent quelque chose. Seul réglage réel aujourd'hui : la bascule « Montrer les lieux où je suis allé » (Compte.tsx:560-582).

<sub>Preuve : Diako Parametres.tsx:157 : ligne « Confidentialité — Qui voit mon profil et mes publications — bientôt » dont l'action est `bientot(...)`, c.-à-d. un toast (Parametres.tsx:98-99). Côté Fonenako, la section « Sécurité & confidentialité » porte des actions réelles (SettingsTab.tsx:506-551 : dernière connexion, KYC, décon…</sub>

### Menu avatar : « Mes alertes » (recherches sauvegardées) — aucun équivalent Diako

🔴 **pas fait**

**Ce qui manque** — Toute la fonction : enregistrer une recherche, la retrouver, être prévenu.

<sub>Preuve : Fonenako Header.tsx:431-434 « Mes alertes » → App.tsx:274 /mes-alertes → SavedSearches. Diako : `grep -rni "recherche.*sauvegard|alerte" src/` ne rend que des variables de style dans Plats.tsx (368-379) ; aucune table ni route de recherches sauvegardées, et MenuCompte.tsx:52-60 ne porte pas cette entrée.</sub>

### Menu avatar : « Demandes » côté pro — le pendant Diako n'est branché sur aucun écran

🔴 **pas fait**

**Ce qui manque** — L'écran où un professionnel voit et répond aux demandes ; sans lui la promesse de /projet ne peut pas aboutir.

<sub>Preuve : Fonenako Header.tsx:436-439 « Demandes de biens » (si agence) → /demandes → ProspectBrowse. Diako : la fonction `demandesDeLaPage()` existe (decouverte.ts:513-520, lit bookings) mais `grep -rn demandesDeLaPage src/` ne rend AUCUN appel ; ProConsole.tsx:157-162 n'a que 5 onglets (Ma fiche, Chambres, Carte, Activités, Ci…</sub>

### Mais deux entrées mènent à un écran VIDE : /circuits et /guides

🔴 **pas fait**

**Ce qui manque** — Soit du contenu dans tours et guides, soit `pret: false` (pastille « bientôt ») en attendant. Le commentaire nav.ts:80-86 affirme le contraire de ce que rend la base.

<sub>Preuve : nav.ts:91 (/circuits) et nav.ts:102 (/guides) sont marqués `pret: true` — donc sans pastille « bientôt » (SideNav.tsx:109-113). Or SQL `select count(*) from tours` = 0 et `select count(*) from guides` = 0. Les chargeurs lisent bien ces tables : decouverte.ts:194-204 (tours) et decouverte.ts:368-377 (guides, filtre is_p…</sub>

### Référence retenue : l'écran /compte de Fonenako est UserDashboard.tsx, pas Account.tsx

🟠 partiel

**Ce qui manque** — le fait de tête est juste, le PÉRIMÈTRE qu'il en déduit est faux sur 3 points, et la référence retenue contient elle-même un chemin mort. Statut : PARTIEL. Ce qui tient : Fonenako App.tsx:250 « <Route path="/compte" element={<UserDashboard />} /> » (import lazy :35) ; aucune importation de `pages/Account` — grep « Account » sur src ne rend, pour la page, que ses propres imports internes (Account.tsx:5-18). Diako : App.tsx:111 « <Route path="/compte" element={<Compte />} /> ». 1) « les 4 composants qu'il monte » est FAUX : il y en a 5. UserDashboard.tsx:20 importe `ReclamerMessenger` et le monte SANS condition à la ligne 641, en tête de la colonne principale de l'onglet « dashboard ». Ce n'es…

<sub>Preuve : Fonenako src/App.tsx:250 « <Route path="/compte" element={<UserDashboard />} /> ». `grep -rn "pages/Account" src/` ne rend aucune importation : src/pages/Account.tsx (13 onglets : jetons FNK, paiements, sécurité, support…) n'est branché sur aucune route — c'est du code mort. La comparaison ci-dessous porte donc sur Use…</sub>

### Menu déroulant sur l'avatar, comme Fonenako

🟠 partiel

**Ce qui manque** — PARTIEL — le menu s'ouvre mais ne se ferme pas par son propre bouton (toggle cassé), prouvé par exécution. 1) DÉFAUT PRINCIPAL, MESURÉ. Rendu réel de MenuCompte (React 18 + jsdom, vitest 2.1.9) dans un harnais reproduisant Header.tsx:161-182 à l'identique : « ouvert après 1er clic = true | ouvert après 2e clic = true » ; le test « clic dehors ferme » passe, le test « 2e clic ferme » échoue (expected true to be false). Cause : MenuCompte.tsx:42 pose un listener `mousedown` sur `document` et ferme dès que la cible n'est pas dans `boite` (ref l.64), or `boite` ne couvre que le panneau, PAS le bouton avatar qui est son frère (Header.tsx:162-180). 2e clic : mousedown → onFermer() → panneau=null (…

<sub>Preuve : Diako src/components/Header.tsx:161-182 : le bouton avatar porte aria-haspopup="menu" et bascule le panneau `compte` ; il ne navigue plus. src/components/MenuCompte.tsx:62-108 rend un role="menu" avec 5 entrées (Mon compte, Mon carnet, Mon carnet de goûts, Espace pro si account_type='pro', Paramètres) + « Se déconnecte…</sub>

### Fonenako : choix de la langue (fr / mg) — non câblé chez Diako

🟠 partiel

**Ce qui manque** — Le sélecteur de langue qui écrit réellement profiles.language.

<sub>Preuve : Fonenako ProfileTab.tsx:442-453 (Select Français / Malagasy) sauvegardé :215 (language). Diako : la colonne profiles.language existe avec le défaut 'fr' (SQL) et est lue par UserDataContext.tsx:11, mais Parametres.tsx:156 se contente d'un toast « Bientôt disponible » — `grep -rn language src/` ne rend aucune écriture.</sub>

### Fonenako : ville normalisée + quartier — Diako n'a qu'un champ texte libre

🟠 partiel

**Ce qui manque** — La normalisation de la ville (liste fermée) et le champ quartier.

<sub>Preuve : Fonenako ProfileTab.tsx:460-474 (Select de 6 villes : antananarivo, antsirabe, fianarantsoa, mahajanga, toamasina, antsiranana) et :479-482 (champ Quartier), sauvegardés :216-217. Diako Compte.tsx:518-528 : un seul <input id="ville"> en texte libre (placeholder « Antananarivo ») écrit dans home_place ; aucun champ quar…</sub>

### Compteurs du compte : Diako en a 4, Fonenako en affiche d'autres (vues, messages)

🟠 partiel

**Ce qui manque** — Le nombre de vues (aucun compteur de vues sur les publications d'un membre) et le nombre de messages dans l'en-tête du compte.

<sub>Preuve : Fonenako UserDashboard.tsx:467-473 : « Annonces actives », « Vues totales », « Messages » (+ « Solde FNK » si SHOW_FNK). Diako Compte.tsx:203-208 : publications, lieux visités, plats goûtés, adresses gardées — via le RPC mon_activite (api.ts:602-606 ; la fonction existe bien : SQL pg_proc → mon_activite renvoie jsonb).</sub>

### Gestion de ses publications : Fonenako offre 8 gestes par élément, Diako un seul

🟠 partiel

**Ce qui manque** — Modifier une publication, la supprimer, la partager, filtrer par statut depuis /compte.

<sub>Preuve : Fonenako UserDashboard.tsx:751-874 par annonce : Voir, Ouvrir dans un onglet, Modifier, Partager (Facebook / Instagram / Copier le lien), Booster gratuitement, Marquer non disponible, Republier, Supprimer — plus 2 filtres (statut :662-672, type :673-686). Diako Compte.tsx:339-358 : le SEUL geste est la bascule privé/pu…</sub>

### Suppression de compte : Fonenako a un parcours, Diako renvoie vers une adresse… Fonenako

🟠 partiel

**Ce qui manque** — Une adresse de contact Diako, une confirmation explicite (dialogue) et un traitement réel de la demande ; aujourd'hui rien n'est enregistré.

<sub>Preuve : Fonenako SettingsTab.tsx:613-639 (section « Zone de danger ») + dialogue de confirmation :647-670 avec une action qui mène à /a-propos. Diako Parametres.tsx:183-193 : un bouton qui n'ouvre qu'un toast, dont le texte est « Écrivez à contact.fonenako@gmail.com : votre compte et vos publications seront effacés » (Parametr…</sub>

### Aide / « À propos » depuis les réglages — absent de Diako

🟠 partiel

**Ce qui manque** — Une page « À propos »/aide (c'est aussi la destination du parcours de suppression de compte chez Fonenako).

<sub>Preuve : Fonenako SettingsTab.tsx:593-609 : « À propos de Fonenako » (/a-propos), « Conditions d'utilisation », « Politique de confidentialité ». Diako Parametres.tsx:205-211 : Mentions légales, Confidentialité, Conditions — mais aucune route /a-propos ni page d'aide/support dans App.tsx:108-158.</sub>

### « Évite la liste très longue sur le côté gauche » — la colonne de gauche compte 14 entrées, sur toutes les pages y compris /compte

🟠 partiel

**Ce qui manque** — 14 entrées + 3 intitulés de groupe restent une liste longue ; elle n'est pas raccourcie sur /compte, où Fonenako n'en montre que 5.

<sub>Preuve : nav.ts:87-113 = 20 entrées dans NAV_COMPLET ; NAV_RAIL (nav.ts:121) en garde 14 (compté sur le fichier : 4 hors groupe — Fil, Carte, Rechercher, Paramètres — + 10 réparties en Découvrir/Préparer/Chez moi). SideNav.tsx:39 est rendu dans la coque commune (App.tsx:203), donc AUSSI sur /compte. Pour comparaison, la colonne…</sub>

### Doublon dans le rail gauche : /projet y figure deux fois

🟠 partiel

**Ce qui manque** — Choisir : l'entrée de liste ou la carte. Aujourd'hui la même destination occupe deux places dans une colonne qu'on cherche à raccourcir.

<sub>Preuve : nav.ts:99 « Mon projet de voyage » dans le groupe « Préparer » (donc rendu par SideNav.tsx:88-116), ET SideNav.tsx:128-140 une carte <Link to="/projet"> en bas du même rail. Le commentaire SideNav.tsx:122-127 justifie la carte en disant « il est ici et PAS dans la liste » — or il est dans les deux.</sub>

### Tiroir mobile : les 20 entrées sont affichées à plat, sans les groupes

🟠 partiel

**Ce qui manque** — Le regroupement (Découvrir / Préparer / Chez moi) dans le tiroir mobile, ou une liste plus courte.

<sub>Preuve : MenuMobile.tsx:119-141 boucle sur NAV_COMPLET (20 entrées) sans lire `groupe` ni GROUPES_RAIL — alors que SideNav.tsx:81-120 les regroupe. Le pied de page et ce tiroir partagent donc la liste longue que le rail a, lui, rangée.</sub>

### Aucune entrée de navigation ne pointe vers une route inexistante

🟠 partiel

**Ce qui manque** — RÉFUTÉ. Le premier examen n'a testé qu'une chose : « le chemin figure-t-il dans un <Route> ». Sur ce test-là il a raison. Mais plusieurs entrées de navigation réelles mènent à un état qui n'existe pas, et une table promise est vide. === A. Deux boutons « Voir sur la carte » passent un paramètre que /carte ne lit pas === src/pages/Carte.tsx ne lit QUE deux paramètres d'URL. Vérifié : `grep -n "params\." src/pages/Carte.tsx` ne rend que deux lignes — Carte.tsx:108 const cibleRef = useRef<string | null>(params.get("focus")); Carte.tsx:113 (params.get("cat") as Categorie) || "tout" Or trois liens différents visent /carte, avec TROIS noms de paramètre : • src/pages/PagePro.tsx:902 to={`/carte?foc…

<sub>Preuve : Les 20 cibles de NAV_COMPLET (nav.ts:87-113) et les 5 de MenuCompte.tsx:52-60 ont toutes une <Route> déclarée : App.tsx:108-158 (/, /explorer, /plats, /circuits, /sites, /evenements, /projet, /quand-partir, /y-aller, /guides, /carte, /recherche, /publier, /favoris, /gouts, /messages, /notifications, /pro, /compte, /par…</sub>

### /projet : la promesse « les agences et les hôtels répondent » n'a pas d'écran en face

🟠 partiel

**Ce qui manque** — L'écran professionnel qui lit les trip_requests et écrit un trip_offer. Sans lui, /projet est un formulaire sans destinataire.

<sub>Preuve : SideNav.tsx:135 et Compte.tsx:636 promettent une réponse des pros. Côté données : trip_requests = 1 ligne, trip_offers = 0 ligne (SQL). Côté code, `grep -rn trip_offers src/` ne rend que Projet.tsx (lecture, decouverte.ts:482-489 offresDuProjet) — AUCUN écran n'écrit une offre, et ProConsole.tsx:157-162 n'expose pas le…</sub>

### /parametres : deux lignes de la liste ne mènent nulle part

🟠 partiel

**Ce qui manque** — Câbler la langue (la colonne profiles.language existe) et la confidentialité, ou retirer ces deux lignes de la liste.

<sub>Preuve : Parametres.tsx:156 (« Langue ») et :157 (« Confidentialité ») appellent `bientot(...)`, défini Parametres.tsx:98-99 comme un simple toast « Bientôt disponible ». Les trois autres blocs sont réels : thème (Parametres.tsx:110-134, useTheme), notifications push (Parametres.tsx:146-155 → pushNotifications), liens légaux (:…</sub>


## Construit mais inatteignable, annoncé mais vide

### ② /circuits et /circuit/:slug : entrée de navigation vers une table vide

🔴 **pas fait**

**Ce qui manque** — Zéro circuit en base. /circuits affiche toujours l'état vide et /circuit/:slug répond « introuvable » (src/pages/Circuit.tsx). Le commentaire de nav.ts:80-85 assume le choix — le fait reste : une entrée permanente vers un écran sans matière.

<sub>Preuve : Entrée `{ to: "/circuits", label: "Circuits", pret: true }` src/lib/nav.ts:91 (rail + tiroir mobile). La page lit `tours` (src/lib/decouverte.ts:195 `.from("tours")`). SQL : `select count(*) from tours` → 0 ; `tour_days` → 0 ; `tour_departures` → 0.</sub>

### ② /guides et /guides/:slug : entrée de navigation vers une table vide

🔴 **pas fait**

**Ce qui manque** — 0 guide publié. src/pages/Guides.tsx:100-133 tombe systématiquement dans l'EmptyState, et /guides/:slug rend toujours « Guide introuvable » (Guides.tsx:181-193). Le commentaire Guides.tsx:12-16 présente pourtant ces pages comme « le canal d'acquisition » du site.

<sub>Preuve : Entrée `{ to: "/guides", pret: true }` src/lib/nav.ts:102. Chargement src/lib/decouverte.ts:369-378 `.from("guides").eq("is_published", true)`. SQL : `select count(*) from guides` → 0.</sub>

### ② src/pages/Attente.tsx : écran complet jamais importé

🔴 **pas fait**

**Ce qui manque** — Composant d'état d'attente entièrement écrit (reprise de la requête `?q=`, CTA inscription) et injoignable. Aucun écran ne l'utilise.

<sub>Preuve : `grep -rn "Attente" src --include=*.tsx --include=*.ts` → une seule ligne : src/pages/Attente.tsx:16 (sa propre définition). 72 lignes, aucun import, aucune route dans App.tsx.</sub>

### ② src/components/ui : 48 fichiers sur 50 ne sont importés par aucun écran

🔴 **pas fait**

**Ce qui manque** — Toute la bibliothèque shadcn est morte : les écrans réimplémentent boutons, onglets et cartes en Tailwind brut. Seul `sonner.tsx` est vivant (et `toast.tsx`, uniquement pour un type importé par un hook lui-même mort).

<sub>Preuve : Pour chaque fichier de src/components/ui, recherche des importeurs hors du dossier : 0 pour button, card, dialog, tabs, select, form, table, sidebar, chart, calendar, carousel… Vérification directe : `grep -rn "@/components/ui/" App.tsx main.tsx pages contexts hooks lib components/*.tsx` ne remonte que src/App.tsx:4 `@…</sub>

### ② src/lib/cache.ts : module entier jamais importé

🔴 **pas fait**

**Ce qui manque** — Couche de cache écrite puis jamais branchée. Le fil et les listings refont leurs requêtes sans passer par elle.

<sub>Preuve : `grep -rn "lib/cache" src --include=*.tsx --include=*.ts` → aucun résultat. Le fichier expose 6 symboles (cache.ts:17 getCached, :27 setCached, :31 isFresh, :37 clearCache, :48 feedCache, :55 listingCache), 58 lignes, zéro occurrence ailleurs dans src.</sub>

### ② Trois hooks jamais importés (348 lignes)

🔴 **pas fait**

**Ce qui manque** — useScrollRestore est documenté « v6 — simplified, bulletproof » et la restauration de défilement est en fait faite à la main dans src/App.tsx:86 (`window.scrollTo({top:0})`).

<sub>Preuve : `grep -rn "useScrollRestore|useRefreshOnFocus|getSavedScroll" src` → seulement les définitions : src/hooks/useScrollRestore.ts:20 et :122, src/hooks/useRefreshOnFocus.ts:17. src/hooks/use-toast.ts (186 l.) n'est importé nulle part non plus (`grep -rn "use-toast|useToast" src` hors components/ui → aucun consommateur). T…</sub>

### ② JSON-LD : deux constructeurs écrits, jamais appelés

🔴 **pas fait**

**Ce qui manque** — Seules les fiches d'établissement (/p/:slug) émettent des données structurées. /lieu/:slug et /quand-partir — les pages présentées comme « le fossé défensif » (App.tsx:144-145) — n'en émettent aucune, alors que le constructeur dédié existe.

<sub>Preuve : `grep -rn "poserJsonLd|@/lib/jsonld" src` hors lib/jsonld → uniquement src/pages/PagePro.tsx:24-25 et :147-173. `construireDestinationJsonLd` (src/lib/jsonld.ts:261) et `construireFAQ` (src/lib/jsonld.ts:312) n'ont qu'une occurrence dans tout src : leur définition.</sub>

### ② prechargerFiche() : optimisation écrite pour la route la plus liée du site, jamais branchée

🔴 **pas fait**

**Ce qui manque** — Aucun de ces 12 liens n'appelle prechargerFiche au onPointerDown, contrairement aux liens de navigation (BottomNav.tsx:3, SideNav.tsx:5). Le module PagePro reste demandé après le clic.

<sub>Preuve : src/lib/prechargerRoute.ts:64-68 `export function prechargerFiche()`. `grep -rnw "prechargerFiche" src` → 1 seule occurrence (la définition). Or /p/:slug est la cible la plus fréquente du dépôt : 12 emplacements de liens (FicheCard.tsx:34, FicheLigne.tsx:50, AutourDeMoi.tsx:190, Carte.tsx:484, Circuit.tsx:141, EspacePr…</sub>

### ② Deux RPC déployées + leur enveloppe cliente, appelées par aucun écran

🔴 **pas fait**

**Ce qui manque** — Le code SQL et l'enveloppe TypeScript sont livrés des deux côtés, rien ne les invoque depuis l'interface.

<sub>Preuve : src/lib/etablissements.ts:1089 `supabase.rpc("agent_chercher", …)` dans `agentChercher`, et :1138 `supabase.rpc("trajets_depuis", …)` dans `trajetsDepuis`. `grep -rnw` sur les deux noms de fonction → 1 occurrence chacune (la définition). Les deux RPC existent bien côté serveur (contrôle SQL sur pg_proc des 39 RPC appel…</sub>

### ② 22 autres symboles exportés de src/lib jamais consommés

🔴 **pas fait**

**Ce qui manque** — Cas notable : src/pages/Messages.tsx importe `useChatLive` (ligne 7) et réimplémente l'envoi, laissant `chargerMessages` et `envoyerMessage` de lib/api.ts inertes ; deux implémentations coexistent, une seule est branchée.

<sub>Preuve : Recensement des `export function/const` de src/lib puis comptage des occurrences dans tout src (hors ligne de définition) : api.ts chargerFeed:114, chargerMessages:507, envoyerMessage:518 ; decouverte.ts demandesDeLaPage ; etablissements.ts supprimerSection, supprimerPhotoCarte, enregistrerInclusions, repondreAAvis, me…</sub>

### ② Deux répertoires de source entièrement vides

🔴 **pas fait**

**Ce qui manque** — src/components/guards/ est cité comme existant dans le commentaire src/pages/ProConsole.tsx:64. La garde de propriété est en réalité inline dans la page (App.tsx:117).

<sub>Preuve : `ls -la src/components/guards` → aucune entrée hors . et .. ; `ls -a src/data` → aucune entrée hors . et .. Les deux dossiers sont versionnés et vides.</sub>

### ② Champ NavItem.promesse déclaré, jamais renseigné ni affiché

🔴 **pas fait**

**Ce qui manque** — Champ d'interface mort dans la source unique de navigation.

<sub>Preuve : src/lib/nav.ts:57 `promesse?: string;`. Aucune des 5 entrées de NAV_PRINCIPAL ni des 21 de NAV_COMPLET ne le renseigne (nav.ts:69-113). Aucun consommateur : `grep -rn "promesse" src` ne remonte que le champ homonyme de src/lib/typesPublication.ts:51 et des commentaires.</sub>

### ② Badge « bientôt » : 3 branches de rendu impossibles à atteindre

🔴 **pas fait**

**Ce qui manque** — Le mécanisme d'honnêteté décrit en SideNav.tsx:13 (« La pastille bientôt dit la vérité AVANT le clic ») ne peut jamais s'afficher — y compris pour /circuits et /guides dont les tables sont à 0 ligne.

<sub>Preuve : `grep -c "pret: true" src/lib/nav.ts` → 25 ; `grep -c "pret: false"` → 0. Les trois branches conditionnées par `!pret` sont donc mortes : src/components/SideNav.tsx:65 et :111, src/components/MenuMobile.tsx:133-138, src/components/Footer.tsx:37.</sub>

### ③ Paramètres » Langue » : le clic ne fait qu'un toast « Bientôt disponible »

🔴 **pas fait**

**Ce qui manque** — Ligne cliquable présentée comme un réglage ; aucune écriture, aucun état. La colonne `profiles.language` existe pourtant (src/contexts/UserDataContext.tsx:11).

<sub>Preuve : src/pages/Parametres.tsx:156 `onClick={() => bientot("Le choix de la langue")}`, où `bientot` est défini ligne 98-99 : `toast("Bientôt disponible", …)`.</sub>

### ③ Paramètres » Confidentialité » : le clic ne fait qu'un toast « Bientôt disponible »

🔴 **pas fait**

**Ce qui manque** — Le réglage existe en réalité ailleurs et fonctionne (`changerVisibilite`, src/lib/api.ts:616, et `ouvrirMesLieux`, :666, utilisés depuis /compte). L'entrée de /parametres pointe vers un toast au lieu de cette mécanique déjà livrée.

<sub>Preuve : src/pages/Parametres.tsx:157 `detail="Qui voit mon profil et mes publications — bientôt"` + `onClick={() => bientot("Les réglages de confidentialité")}` (toast défini ligne 98-99).</sub>

### ③ Deux boutons « Voir sur la carte » dont le paramètre est ignoré

🔴 **pas fait**

**Ce qui manque** — `fiche` et `lieu` ne sont jamais lus : les deux boutons ouvrent la carte nationale non centrée. Seul src/pages/PagePro.tsx:902 (`/carte?focus=`) utilise le bon nom de paramètre.

<sub>Preuve : src/components/PanneauDemande.tsx:199 `to={`/carte?fiche=${fiche.slug}`}` et src/pages/Destination.tsx:326 `to={`/carte?lieu=${f.lieu.slug}`}`. Or src/pages/Carte.tsx ne lit que deux paramètres : ligne 108 `params.get("focus")` et ligne 113 `params.get("cat")` (`grep -n "params" src/pages/Carte.tsx` → lignes 104, 108, …</sub>

### ③ Deux drapeaux d'exploitation en base que le code ne lit jamais

🔴 **pas fait**

**Ce qui manque** — `signup_open` est un interrupteur de fermeture des inscriptions qui n'a aucun effet : src/pages/Auth.tsx:65-84 appelle `signUp` sans le consulter. `facebook_login` ne commande aucun bouton.

<sub>Preuve : SQL `select * from app_flags` → 3 lignes : facebook_login (actif=false), signup_open (actif=true), google_login (actif=true). Côté client, `grep -rn "flagActif|signup_open|facebook_login" src` → une seule lecture : src/pages/Auth.tsx:62 `flagActif("google_login")`.</sub>

### ④ pages.views_count : compteur « X vues » affiché aux pros, que rien n'incrémente

🔴 **pas fait**

**Ce qui manque** — L'audience réelle est enregistrée ailleurs, par chemin : `select count(*) from page_views` → 270 lignes, dont 4 sur `/p/%`. Rien ne relie page_views à pages.id (la table n'a pas de colonne page_id : id, path, ref, sid, created_at). Le gérant lira « 0 vue » indéfiniment.

<sub>Preuve : Affichage src/pages/EspacePro.tsx:169 `{e.views_count} vue{…}`, sous le commentaire ligne 157 « Des chiffres RÉELS ». SQL : `select count(*), count(*) filter (where views_count>0), sum(views_count) from pages` → 3 355 / 0 / 0. `select count(*) from pg_proc where prosrc ilike '%views_count%'` → 1 seule fonction, et c'es…</sub>

### ④ dishes.nb_restaurants : colonne à zéro pour les 95 plats, et pourtant clé de tri

🔴 **pas fait**

**Ce qui manque** — Le tri « les plats les plus servis d'abord » est un no-op permanent (toutes les valeurs égales) : l'ordre réel tombe sur `.order("name_fr")`. Et src/pages/Plats.tsx:419-421 écrit « aucune adresse encore » en dur pour chaque vignette au lieu de lire la colonne — l'écran et la colonne coïncident aujourd'hui par hasard, pas par calcul.

<sub>Preuve : SQL : `select count(*) from dishes where nb_restaurants = 0` → 95 sur 95 ; `sum(nb_restaurants)` → 0 ; `select count(*) from menu_items where dish_id is not null` → 0 (sur 4 menu_items, dont 4 in_stock). Le trigger `trg_menu_compteur` recalcule bien `count(distinct page_id) … where dish_id = d.id and in_stock` (fonctio…</sub>

### ④ « 178 destinations » écrit en dur à l'écran, contre 522 en base et 522 dans le rail

🔴 **pas fait**

**Ce qui manque** — Sur un écran ≥1280 px, le rail gauche affiche « Destinations 522 » pendant que le rail droit affiche « 178 destinations et 95 plats référencés ». Le commentaire src/lib/etablissements.ts:340 documente d'ailleurs le passage « de 87 à 524 destinations ». Le chiffre 178 n'a plus aucune source. (Les autres chiffres en dur vérifiés sont exacts : 95 plats, 254 orthographes = dish_aliases, 41 lieux avec accès = count(distinct place_id) sur place_access, 5 avec saisonnalité.)

<sub>Preuve : Texte visible : src/lib/nav.ts:139 (rendu par src/components/RightRail.tsx:437-446, « Ce qui arrive sur Diako »), src/pages/Circuits.tsx:126 « 178 destinations, dont 41 avec leurs accès », :136 « Explorer les 178 destinations », src/pages/Guides.tsx:121 « Les 178 destinations ». SQL : `select count(*) from places where…</sub>

### ① Route /bienvenue déclarée mais aucun lien du site n'y mène

🟠 partiel

**Ce qui manque** — L'écran n'est atteignable que par le lien du courriel de confirmation d'inscription. Aucune porte d'entrée depuis le site lui-même : un membre déjà inscrit ne peut plus jamais y revenir.

<sub>Preuve : Route déclarée src/App.tsx:110. Extraction de TOUTES les cibles de navigation (grep sur `to=`, `href=`, `navigate(` dans src, littéraux + gabarits) : aucune occurrence de "/bienvenue". Les 3 seules mentions dans le dépôt sont src/App.tsx:103 (test `bare`), src/App.tsx:110 (la route) et src/pages/Auth.tsx:79 `emailRedir…</sub>

### ① Toutes les autres routes de App.tsx sont bien liées

🟠 partiel

**Ce qui manque** — La preuve confond « un <Link> existe dans le source » et « un lien est réellement rendu ». Trois routes de détail ne reçoivent AUCUN lien affichable aujourd'hui, car leur unique lien est enfermé dans une garde `liste.length > 0` alimentée par une table vide. (1) /circuit/:slug — unique référence du dépôt : src/pages/Circuits.tsx:87 (grep -rn "/circuit/" src/ public/ scripts/ index.html supabase/ ne rend que App.tsx:134 la route, Circuit.tsx:92 une self-url useSEO, et Circuits.tsx:87). Ce Link est à l'intérieur de la garde src/pages/Circuits.tsx:82 `{!chargement && circuits.length > 0 && (`. Données : chargerCircuits() → src/lib/decouverte.ts:194-196 → supabase.from("tours"). SQL `select coun…

<sub>Preuve : 34 chemins extraits de src/App.tsx (`grep -oE 'path="[^"]+"'`). Chacun sauf /bienvenue reçoit au moins un lien : ex. /projet ← src/lib/nav.ts:99 + src/components/SideNav.tsx:129 ; /circuit/:slug ← src/pages/Circuits.tsx:87 ; /site/:slug ← src/pages/Sites.tsx:217 ; /pro/:slug ← src/pages/EspacePro.tsx:131 ; /post/:id ← …</sub>

### ③ « Supprimer mon compte » : bouton qui n'exécute rien

🟠 partiel

**Ce qui manque** — Le bouton est stylé en `text-destructive` avec une icône corbeille : il annonce une action irréversible et ne produit qu'un message. Aucune suppression, aucune demande enregistrée en base.

<sub>Preuve : src/pages/Parametres.tsx:183-193 : `onClick={() => toast("Suppression de compte", { description: "Écrivez à contact.fonenako@gmail.com …" })}`.</sub>

### ④ places.nb_pages / nb_posts : dénormalisés et affichés, exacts aujourd'hui, sans filet

🟠 partiel

**Ce qui manque** — Aucun recalcul périodique ni contrôle de cohérence : la justesse ne tient qu'aux triggers `pages_maj_nb_pages` et `posts_maj_nb_posts`, qui ne se déclenchent que sur INSERT/DELETE/UPDATE de place_id et is_published/status. Un import massif en SQL brut (comme ceux des migrations 0046/0054) ou un `alter table … disable trigger` refait diverger sans que rien ne le signale. À noter : mesurés contre TOUTES les pages (publiées ou non), 51 lieux s'écartent — dont Antananarivo 521 affiché / 541 réel.

<sub>Preuve : Affichés src/pages/Destination.tsx:193 (« X adresses »), src/pages/Explorer.tsx:500-508 (« X établissements » / « X récits »), src/components/ChampLieu.tsx:254, src/pages/Recherche.tsx:311. SQL de contrôle avec la définition réelle des triggers (maj_nb_pages / maj_nb_posts, lues dans pg_proc : pages publiées et posts s…</sub>

### ④ profiles.followers_count / following_count : lus dénormalisés par la RPC qui, elle, recompte les publications

🟠 partiel

**Ce qui manque** — Deux politiques opposées dans une seule fonction. Les deux compteurs d'abonnement dépendent du trigger incrémental `trg_follows` / `maj_follows` ; aucune table d'abonnement n'ayant encore de ligne, la fiabilité n'est pas démontrée — elle est seulement non contredite.

<sub>Preuve : Affichés src/pages/Profil.tsx:246-247 (« X abonnés », « X abonnements »), alimentés par src/pages/Profil.tsx:75-76 depuis la RPC `profil_public`. Source lue dans pg_proc : la RPC fait `'nb_abonnes', pr.followers_count` et `'nb_abonnements', pr.following_count` (lecture directe de la colonne) alors que quelques lignes p…</sub>

### ④ profiles.posts_count : incrément pur, aveugle au statut et à la visibilité

🟠 partiel

**Ce qui manque** — Le compteur ne bouge pas quand une publication passe de brouillon à publiée, ni quand `visibilite` devient privée : il comptera toujours toutes les lignes de l'auteur. Zéro dérive constatée uniquement parce que les 28 posts sont tous publiés et qu'il n'existe qu'un seul profil. Le `exception when others then return null` avale en plus toute erreur de mise à jour.

<sub>Preuve : Fonction `maj_posts_count` lue dans pg_proc : `if tg_op='INSERT' then … posts_count + 1 … elsif tg_op='DELETE' then … greatest(0, posts_count-1)`, déclencheur `trg_posts_count AFTER INSERT OR DELETE ON posts` (donc pas sur UPDATE), et le corps se termine par `exception when others then return null`. Colonne lue par src…</sub>

### ④ posts.reactions_count / comments_count / saves_count et pages.rating_count : dénormalisés, non contredits mais non éprouvés

🟠 partiel

**Ce qui manque** — rating_count vaut 0 sur les 3 355 fiches parce que la table `reviews` est vide : l'onglet « Avis (N) » (PagePro.tsx:381) n'affiche jamais de nombre, et la justesse du compteur n'est vérifiable sur aucune donnée. Les compteurs de posts sont exacts sur 28 lignes — échantillon trop mince pour valider les triggers `trg_reactions` / `trg_comments` / `trg_saves`.

<sub>Preuve : Affichés src/components/PostCard.tsx:86-88 (état local initialisé depuis la colonne puis muté en optimiste), src/components/PostImmersif.tsx:36 et :156, src/components/RightRail.tsx:291-333 ; rating_count src/components/FicheCard.tsx:95-99, FicheLigne.tsx:104-108, PagePro.tsx:381 et :426-430, EspacePro.tsx:166, Carte.t…</sub>
