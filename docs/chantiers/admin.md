# Console d'administration — `/admin`

Écrit au fur et à mesure : si la session tombe, ce qui est ci-dessous est déjà acquis.

Demande du propriétaire, mot pour mot : « une page admin comme celle de Fonenako mais
adaptée à Diako : autorisations de publication, insertion photo, statistiques, gestion
utilisateurs, codes promo, liée à contact.diako@gmail.com » et « les utilisateurs peuvent
proposer une photo avec approbation admin ».

---

## 1. Ce que la console remplace

Il n'existait **aucun** écran d'administration. Ce n'est pas un manque de confort :

- `reports` se remplit — `masquer_si_signale()` cache une publication au 3ᵉ signalement
  distinct — et la policy `reports_admin` en réserve la lecture à `is_staff()`. **Aucun
  compte ne portait ce rôle.** La file se remplissait, personne ne pouvait la lire.
- 0044 l'écrivait déjà : « ces signalements alimentent une file, relue à la main ».
  La main n'avait pas d'écran.
- `PagePro.tsx` promettait en commentaire « une feuille de saisie sur mesure viendra avec
  la console de modération ». C'est celle-ci.
- Le référentiel n'a presque aucune image : `pages.cover_url` et `pages.gallery` sont vides
  sur les 54 établissements, 0082 a dû créer `places.cover_url` parce que les 178
  destinations n'avaient rien. Les seules personnes qui ont des photos — celles qui
  reviennent de voyage — n'avaient aucun moyen d'en donner une.

## 2. Le modèle Fonenako, et ce qui a été gardé

`Fonenako FinAL GITHUB/src/pages/AdminDashboard.tsx` (227 lignes) a été lu. Ce qui est repris :

| Repris de Fonenako | Pourquoi |
|---|---|
| **Onglet actif dans l'URL** (`/admin?tab=…`) | Le geste retour Android remonte d'onglet en onglet au lieu de quitter la console. Commentaire d'origine conservé dans l'esprit. |
| **Pastilles scrollables** pour la barre d'onglets | Dix onglets ne tiennent pas sur 390 px ; le `overflow-x-auto` est la seule mise en page qui ne casse pas. |
| **Un composant par onglet**, la page ne fait que router | `AdminDashboard` n'a aucune logique métier ; chaque onglet est autonome et se recharge seul. |
| **Garde en tête de page + état `null` tant qu'on ne sait pas** | On n'affiche jamais la console « en attendant de savoir ». |
| **Chargement paresseux du plus lourd** | Fonenako isole `recharts` (422 Ko). Ici, l'onglet Photos est le seul à tirer la compression d'image ; il est en `lazy()`. |

Ce qui est **écarté** :

- Tout le domaine immobilier (recharges FNK, KYC, affiliation, mandats, estimation).
- **shadcn/ui.** Fonenako s'en sert (`Tabs`, `Button`, `Skeleton`). Diako ne l'utilise
  nulle part : un `grep` de `@/components/ui` hors de `src/components/ui/` ne rend que
  deux lignes (`sonner` dans `App.tsx`, un type dans `use-toast.ts`). La console est
  écrite en Tailwind à la main avec les recettes de classes du dépôt, comme les 34 autres
  pages.
- **`useToast`.** Diako n'utilise que `sonner` (`import { toast } from "sonner"`).
- Le contrôle d'accès par `user_roles` **seul** — voir ci-dessous, il est élargi.

## 3. Le contrôle d'accès — pourquoi il n'est pas où on l'attendrait

Le propriétaire veut la console liée à `contact.diako@gmail.com`. La solution évidente —
une fonction `dk_est_admin()` à côté, utilisée par la console — **a été refusée**, et c'est
la décision structurante de ce chantier.

0001 dit en commentaire avoir refusé chez Fonenako la cohabitation de deux systèmes de
droits concurrents. Une deuxième fonction les recréait : le jour où `dk_est_admin()` dit
oui et `is_admin()` dit non, la console affiche « enregistré » et le déclencheur
`pages_avant_ecriture` annule l'écriture **en silence** — exactement le défaut que 0092 a
mis une migration entière à comprendre.

Donc : **`is_admin()` et `is_staff()` sont élargies**, signature et contrat inchangés.

```
dk_compte_proprietaire()   ← l'adresse e-mail vit ICI, et nulle part ailleurs
        ↓
   is_admin()  =  propriétaire  OU  user_roles.role = 'admin'
   is_staff()  =  propriétaire  OU  user_roles.role ∈ {admin, moderateur}
```

Conséquence utile : **tout ce qui s'appuyait déjà sur `is_admin()` reconnaît le
propriétaire sans qu'une ligne soit retouchée** — les triggers de gel (`pages_avant_ecriture`),
les policies du bucket privé `justificatifs` (0078/0084), `reports_admin` via `is_staff()`.

Trois précautions :

- **L'e-mail doit être confirmé** (`email_confirmed_at is not null`). Sans cela, si la
  confirmation par e-mail est un jour désactivée dans le tableau de bord Supabase,
  n'importe qui s'inscrit avec cette adresse et devient administrateur sans jamais avoir
  ouvert la boîte.
- **Le rôle est aussi semé dans `user_roles`** si le compte existe au moment de la
  migration : l'e-mail est la ceinture, la ligne de `user_roles` les bretelles.
- **La console ne distribue jamais le rôle `admin`**, seulement `moderateur`. La RPC
  `dk_admin_role` n'accepte même pas le nom du rôle en argument. Sinon un modérateur
  promu par erreur se promeut administrateur et évince le propriétaire — deux clics.

Et surtout : **le garde est dans chaque RPC**, en première instruction
(`if not public.is_admin() then raise … errcode 42501`). Le `if` React ne décide que de
l'affichage. La clé anonyme du projet est publique par construction : n'importe qui peut
appeler ces RPC à la main, et se fera refuser par le serveur.

## 4. Fichiers écrits

### `supabase/migrations/0097_console_administration.sql`

- `dk_compte_proprietaire()` — l'adresse, à un seul endroit.
- `is_admin()` / `is_staff()` élargies, `grant execute` reposés pour `anon` (0018).
- Semis du rôle `admin` dans `user_roles` si le compte existe.
- Table **`promo_codes`** + RLS admin + révocations (`public` **et** `anon` **et**
  `authenticated` : aucun rôle client n'a de droit sur la table, tout passe par RPC).
- RPC : `dk_admin_statistiques`, `dk_admin_membres`, `dk_admin_publications`,
  `dk_admin_moderer_publication`, `dk_admin_role`, `dk_admin_promos`,
  `dk_admin_promo_enregistrer`, `dk_admin_promo_supprimer`.
- Assertion finale en 5 points (voir § 7).

**Décision à connaître : `promo_codes` n'a ni `usage_count` ni `usage_max`.** Aucun écran
ne consomme un code ; rien n'incrémenterait ce compteur. 0092 a passé une migration
entière à réparer deux compteurs affichés que rien n'alimentait — en poser un troisième
le jour même serait un défaut connu créé volontairement. L'onglet le dit franchement :
« Les utilisations ne sont pas comptées. » La colonne viendra le jour où un parcours de
validation existera, et avec lui.

Autre décision : `avantage` est un **texte** saisi à la main (« −10 % sur la nuitée »), pas
un nombre. Rien dans ce dépôt ne sait calculer une remise, et un pourcentage stocké
laisserait croire le contraire. Cohérent avec « Diako met en relation » : un code est
mentionné sur place, il n'est pas un moyen de paiement.

### `supabase/migrations/0098_photos_proposees.sql`

- Trois colonnes de crédit ajoutées à `pages` (`cover_credit`, `cover_licence`,
  `cover_source`) + `grant select (...)` explicite — **piège 0082 traité, pas supposé** :
  sur `places`, `anon` n'avait que des grants par colonne et une colonne ajoutée
  n'héritait de rien. Le grant explicite est inoffensif si la table a un grant global,
  indispensable sinon ; l'assertion le prouve dans les deux cas.
- Table **`photo_propositions`** : 4 cibles (`destination`, `site`, `plat`,
  `etablissement`), contrainte d'URL o2switch, index unique partiel « une seule
  proposition en attente par personne et par fiche », RLS lecture = la sienne ou
  l'administration, **aucune policy d'écriture** (tout par RPC).
- `dk_poser_photo()` interne (révoquée pour `public`, `anon` **et** `authenticated`),
  `dk_photo_cible_nom()`, `dk_proposer_photo()`, `dk_admin_photos()`,
  `dk_admin_traiter_photo()`, `dk_admin_poser_photo()`.
- `dk_admin_statistiques()` remplacée pour ajouter les deux compteurs de photos — elle
  est dans 0098 et pas 0097 parce que la table n'existe qu'ici : compter dedans depuis
  0097 casserait 0097 sur une base neuve.

**La promesse « une photo proposée n'apparaît nulle part », et sa limite dite franchement.**
La table est fermée à `anon` (aucun grant) et surtout : l'approbation est la **seule**
écriture qui recopie l'URL sur la fiche visée. Tant qu'elle n'a pas eu lieu, aucune requête
du produit ne peut ramener cette photo, parce qu'aucune requête du produit ne lit cette
table. Il n'y a pas de filtre `statut = 'approuvee'` à oublier quelque part : il n'y a rien
à filtrer.

En revanche le **fichier** part sur o2switch avant la décision, comme toute image publique
de ce dépôt (Supabase Storage reste réservé aux pièces d'identité — bucket privé
`justificatifs`, facteur 17 sur l'egress ailleurs). Une photo en attente est donc joignable
par qui connaît son URL exacte, mais elle n'est liée nulle part et aucune page ne la nomme.
**Le refus efface le fichier** (l'écran appelle `deleteFromO2Switch`), ce qui referme la
fenêtre. Dire « c'est privé » serait faux ; c'est *non publié*, ce n'est pas la même chose.

### `src/lib/admin.ts`

Seul point d'entrée du client vers les RPC. Types, curseurs, et utilitaires d'affichage.
Le client Supabase y est typé **localement** (idiom `SupabaseClient<SchemaAdmin>` déjà
employé dans `Cogestion.tsx` et `etablissements.ts`) : `types.ts` est régénéré depuis la
base et ne connaîtra ces fonctions qu'une fois les migrations appliquées. Aucun `any` —
l'entête de `types.ts` l'interdit (« chaque contournement est un bug futur ») et le
tsconfig le refuse. Le jour où les types seront régénérés, le bloc `SchemaAdmin` et `base`
disparaissent sans qu'une seule requête change.

### `src/pages/Admin.tsx`

La page ne fait que router : garde d'affichage, onglet porté par l'URL (`/admin?tab=…`),
pastilles scrollables, et un composant par onglet. Aucune logique métier.

L'onglet **Photos** est le seul en `lazy()` : il embarque la compression d'image et le
téléversement o2switch dont les quatre autres n'ont aucun besoin. Même geste que Fonenako
avec `recharts`.

### `src/components/admin/`

| Fichier | Rôle |
|---|---|
| `Communs.tsx` | Recettes de classes (`CARTE`, `BTN_PRIMAIRE`, `CHAMP`…) et briques partagées : `Carte`, `Chiffre`, `Pastille`, `Note`, `Squelette`, `BoutonSuite`, `Filtres`. |
| `Statistiques.tsx` | Les chiffres, en quatre blocs — « À traiter » en premier. Rafraîchissement au focus (`useRefreshOnFocus`), jamais Realtime. |
| `Publications.tsx` | File de modération : autoriser / masquer / retirer, avec motif obligatoire pour les deux derniers. |
| `Photos.tsx` | Les propositions (approuver / refuser) **et** la pose directe d'une photo par l'administration. |
| `Membres.tsx` | Liste + recherche (nom ou e-mail), bascule du rôle modérateur. |
| `Promos.tsx` | Création, modification, suppression des codes. |

Aucun compteur n'est calculé côté client ; aucune liste n'utilise d'offset ; aucun
`select('*')` ; les quatre recherches de fiches nomment leurs colonnes une par une.

---

## 5. Ce que TU dois brancher toi-même

Je n'ai touché ni `App.tsx`, ni `nav.ts`, ni aucune page existante. Il reste **deux**
gestes, et un seul est obligatoire.

**① La route** — dans `src/App.tsx`, à côté des autres `lazy()` :

```tsx
const Admin = lazy(() => import("./pages/Admin"));
```

puis, parmi les `<Route>` :

```tsx
{/* Console d'administration : la garde est dans la page ET dans chaque RPC. */}
<Route path="/admin" element={<Admin />} />
```

**② L'entrée de navigation — mon conseil : ne pas en poser.** `src/lib/nav.ts` est la
source unique de la navigation, et la règle du dépôt dit qu'aucune entrée ne doit mener à
un écran que la personne ne peut pas ouvrir. Une entrée « Administration » visible par
tout le monde afficherait « Cet espace est réservé » à 100 % des visiteurs. La console
s'atteint en tapant `/admin`, ce qui suffit pour un compte unique. Si tu en veux une
malgré tout, il faut la conditionner à `jeSuisAdmin()` — donc un appel réseau avant
d'afficher la barre de navigation, sur toutes les pages.

**Rien d'autre.** `src/lib/admin.ts` est importé par la page, `Communs.tsx` par les
onglets ; aucun `index.css`, aucun `tailwind.config.ts`, aucun composant existant n'a
besoin d'être modifié.

---

## 6. Les migrations, et ce que le propriétaire doit faire

Écrites, **non appliquées** — comme demandé.

```
supabase/migrations/0097_console_administration.sql
supabase/migrations/0098_photos_proposees.sql
```

À appliquer **dans cet ordre** (0098 remplace une fonction créée par 0097 et lit
`promo_codes`), par la CLI Supabase, jamais à la main dans l'éditeur SQL.

Puis, dans l'ordre :

1. **Créer le compte `contact.diako@gmail.com`** dans Diako s'il n'existe pas, et
   **confirmer l'adresse** (le lien reçu par mail). Tant que `email_confirmed_at` est nul,
   `is_admin()` répond `false` et la console affiche « Cet espace est réservé » à son
   propre propriétaire. La migration émet un `raise warning` explicite dans ce cas —
   **lire la sortie de la migration**, l'avertissement y est.
2. Si le compte est créé **après** la migration : rien à faire, la reconnaissance par
   e-mail prend le relais immédiatement. Le semis dans `user_roles` peut être rejoué plus
   tard, il est idempotent.
3. **Régénérer `src/integrations/supabase/types.ts`** (`supabase gen types`). Le bloc
   `SchemaAdmin` de `src/lib/admin.ts` devient alors redondant et peut disparaître — les
   signatures y sont identiques à celles des migrations, argument par argument, donc aucune
   requête ne change.

---

## 7. Ce qui a été vérifié — et comment

| Vérification | Moyen | Résultat |
|---|---|---|
| Types du projet | `npx tsc -p tsconfig.app.json --noEmit` | **0 erreur**, projet entier |
| Style / règles ESLint sur mes fichiers | `npx eslint src/pages/Admin.tsx src/lib/admin.ts src/components/admin/` | **0 erreur, 0 avertissement** |
| Grammaire SQL des deux migrations | `pglast` v8.4 = **libpg_query**, l'analyseur réel de PostgreSQL | 0097 : 25 instructions OK · 0098 : 25 instructions OK |
| Corps PL/pgSQL des fonctions | `parse_plpgsql` (même bibliothèque) | 0097 : **14 corps valides, 0 échec** · 0098 : **10 corps valides, 0 échec** |
| Le harnais d'analyse est réel | 0092 et 0096, déjà en production, passés en témoins | 0096 passe intégralement |
| Noms d'arguments RPC : SQL ↔ TypeScript | script de comparaison sur les 16 fonctions `dk_*` | **13 appels, 100 % concordants** |
| Colonnes `RETURNS TABLE` ↔ interfaces TS | script, ordre inclus | `dk_admin_membres` 10/10 · `dk_admin_publications` 11/11 · `dk_admin_promos` 11/11 · `dk_admin_photos` 16/16 · `dk_admin_statistiques` 19/19 clés |
| Périmètre des fichiers | `git status --porcelain` | seuls mes fichiers ajoutés ; **aucun fichier existant modifié** |
| Colonnes réelles du schéma | lecture de `0001`, `0003`, `0004`, `0007`, `0032`, `0049`, `0082`, `0092`, `0096` | `dishes.name_fr`/`photo_url`, `attractions.name`, `places.name_fr`, `pages.name` confirmés |
| Routes utilisées par les liens | `grep '<Route path='` dans `App.tsx` | corrigé : le profil est `/user/:id`, pas `/profil/:id` |
| Comportement de `deleteFromO2Switch` | lecture de `o2switchUpload.ts` et `public/api/o2delete.php` | **ne jette jamais** ; et voir § 8, le refus ne supprime pas le fichier d'autrui |

**Ce que je n'ai PAS pu vérifier :** les migrations n'ont pas été **exécutées**. Docker
Desktop n'était pas démarré et je n'ai pas voulu le lancer la veille du lancement (il aurait
ralenti la machine et l'autre agent qui travaille dans le même dossier). L'analyse par
libpg_query prouve la **syntaxe** SQL et PL/pgSQL, pas la sémantique : qu'une colonne existe
bien, qu'une policy se comporte comme prévu, que les assertions passent. C'est précisément
pour ça que chaque migration se termine par un bloc `do $$ … raise exception … $$` : la
sémantique se vérifiera toute seule, au moment de l'application, et échouera bruyamment
plutôt que silencieusement.

---

## 8. Ce qui reste ouvert — à savoir avant de s'y fier

1. **🔴 Le refus d'une photo n'efface pas le fichier d'un membre.**
   `public/api/o2delete.php` (ligne 111) n'autorise que les chemins sous le dossier de
   l'appelant — `^<dossier>/<jwtUserId>/`, un garde anti-IDOR posé pour empêcher un membre
   d'effacer les photos d'un autre. L'administration n'y échappe pas : le fichier refusé
   d'un membre survit à son adresse o2switch, sans être lié nulle part.
   *Ce qui est vrai malgré ça :* la photo ne sera publiée nulle part, et l'écran ne dit
   rien de plus que ça — j'ai retiré le message « le fichier a été supprimé », qui aurait
   été faux.
   *Pour fermer complètement :* apprendre à `o2delete.php` à reconnaître un administrateur
   (vérifier le rôle via l'API Supabase avec la clé de service, côté serveur). `o2delete.php`
   n'était pas dans mon périmètre.

2. **Aucun bouton « Proposer une photo » sur les fiches publiques.** La RPC
   `dk_proposer_photo()` existe, est gardée, et `proposerPhoto()` l'expose dans
   `src/lib/admin.ts` — mais poser le bouton demande de modifier `Destination.tsx`,
   `Site.tsx`, `Plat.tsx` et `PagePro.tsx`, qui ne sont pas à moi. Tant que ce bouton
   n'existe pas, la file ne se remplit que par l'administration, et l'onglet le dit au lieu
   de faire semblant. Le branchement est d'une ligne par page.

3. **Les CGU ne parlent pas des photos proposées.** Une photo de membre publiée sur une
   fiche est affichée avec son nom en crédit ; il faudrait que `Cgu.tsx` dise que le membre
   accorde à Diako le droit de l'afficher. Je n'ai rien inventé ni écrit dans les CGU —
   c'est une décision de l'éditeur, pas du développement.

4. **Les modérateurs ne peuvent encore rien faire.** `is_staff()` reconnaît le rôle
   `moderateur` et l'onglet Membres sait le distribuer, mais **toutes** les RPC de la
   console sont gardées par `is_admin()`, pas `is_staff()`. C'est volontaire : ouvrir la
   modération à un rôle qu'on distribue depuis un écran demande de réfléchir à ce qu'un
   modérateur peut voir (les e-mails ? les codes promo ? non). Le jour venu, il suffira de
   changer le garde des deux RPC de publications — et d'elles seules.

5. **`promo_codes.page_id` n'est pas remplissable depuis l'écran.** La colonne existe, la
   RPC accepte `p_page`, mais le formulaire n'a pas de sélecteur d'établissement. Un code
   est donc global tant que ce champ n'est pas ajouté. L'écran n'affiche pas de champ vide
   trompeur : il n'affiche rien, et la liste montre le nom de l'établissement quand il y en
   a un.

6. **Aucun historique de statistiques**, donc aucune courbe ni aucun « +12 % ». Il faudrait
   une table d'instantanés. Une flèche de croissance tirée d'une seule mesure serait une
   donnée inventée.
