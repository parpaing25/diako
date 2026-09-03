# Diako — règles de production

Diako est le réseau social malgache du voyage, du goût et de l'exploration : un fil de récits,
un annuaire vivant d'établissements avec leurs vrais tarifs, et un référentiel de lieux et de plats.
Stack : Vite + React 18 + TypeScript + Tailwind + shadcn/ui + Supabase. Cible : Android d'entrée
de gamme, 3G, écran 390 px. Le design de référence est `Diako Design Final.dc.html`
(+ `Diako v4 Desktop.dc.html` pour la grille desktop, `Diako Ecrans.dc.html` pour les écrans v3).
La spécification de mise en œuvre est dans `DESIGN-HANDOFF.md`.

## Ne jamais faire

- **Aucune donnée inventée.** Jamais de prix en ariary, de note, de compteur, d'avis ou de
  coordonnée GPS fabriqués, même « pour l'exemple », même en développement. Si la donnée n'existe
  pas, l'écran le dit.
- **Aucune police téléchargée.** Polices système uniquement (`system-ui, -apple-system, "Segoe UI",
  Roboto, "Helvetica Neue", Arial, sans-serif`). Pas de Google Fonts, pas de `@font-face`.
- **Jamais `select('*')`.** Listes de colonnes explicites partout ; un `select('*')` anonyme
  renvoie 401 à cause de la fermeture colonne par colonne sur `profiles`.
- **Jamais de pagination par offset.** Curseur (keyset) uniquement, y compris pour les commentaires.
- **Aucune image dans Supabase Storage.** Tout sur o2switch, avec vignettes 480 / 720 / 1080 px WebP.
- **Realtime uniquement sur le chat et les notifications.** Partout ailleurs, rafraîchissement au focus.
- **`#F4633A` ne porte jamais de texte** (3,14:1). Pour tout texte, étiquette ou bouton :
  `#D0471C` (4,57:1). Le corail clair est décoratif.
- **Aucun vocabulaire de réservation.** « Demander », jamais « Réserver » ni « Payer ». Pas de
  calendrier de disponibilité, pas de date bloquée, pas de panier. Diako met en relation.
- **Aucune valeur commerciale accordée côté client.** `featured_until`, `verification_status`,
  `rating_avg`, `is_published`, `price_min_ar` sont protégés par trigger et modifiés par RPC
  `SECURITY DEFINER` seulement. Jamais d'identifiant utilisateur venant du corps d'une requête.
- **Aucun document d'identité dans un dossier servi par le web.** Bucket privé + URL signées courtes.
- **Aucune entrée de navigation vers un écran non branché.** Un onglet vide coûte plus cher en
  confiance que son absence.

## Toujours faire

- **Le prix ne voyage jamais seul** : montant + unité + base + date de dernière confirmation,
  dans un seul bloc. Au-delà de 6 mois sans confirmation, afficher « Nous consulter » à la place
  du montant et déclasser la fiche. Taxe de séjour affichée à part. Pas de plafond sentinelle :
  « sans limite » = `NULL`.
- **L'état vide d'abord.** Trois obligations : dire ce qui manque, offrir une action, proposer du
  contenu réel à parcourir. Une section vide reste en place — la page ne change pas de forme
  selon la base.
- **Remplir l'écran avec le référentiel**, pas avec des établissements qu'on n'a pas :
  178 destinations, 95 plats et 254 variantes, 41 fiches d'accès, 28 récits.
- **On n'élargit pas les cartes, on ajoute des colonnes.** Colonne de lecture bloquée à 620 px.
- **Les trois tags** (lieu · établissement · plat) sur toute publication, avec leur code couleur
  constant : `#0E7C86` lieu, `#10262B` établissement, `#D0471C` plat.
- **Cibles tactiles 44 × 44 px** et `font-size: 16px` sur tous les champs (anti-zoom iOS).
- **`width`/`height` sur toutes les images** (ratio stocké dans `media`) ; `loading="lazy"` sauf
  la première image du fil, qui prend `fetchpriority="high"`.
- **`auth.uid()` enveloppé dans un sous-`SELECT`** dans les policies RLS, `search_path` fixé sur
  toutes les fonctions `SECURITY DEFINER`.
- 🔴 **Toute RPC appelée par le site se chronomètre SOUS LE RÔLE `anon`** (`statement_timeout`
  3 s ; `authenticated` 8 s). Un contrôle de migration exécuté par le connecteur tourne avec un rôle
  privilégié et ne prouve rien : mettre `set local role anon` + `set local statement_timeout` dans
  le bloc de contrôle. *Migration 0115 du fil par thème : quatre contrôles verts, et le vrai appel
  REST anon rendait 57014 (timeout), soit HTTP 500 pour tout visiteur non connecté — 4 842 ms par
  page, corrigé en 0116 à 22 ms en partant des liens de la publication.*
- **Une seule source de vérité de schéma** : `supabase/migrations/`, numéros croissants,
  `types.ts` régénéré après chaque migration.
- **Build** : `tsc --noEmit && vite build`. Conserver le `manualChunk` radix-vendor (sans lui,
  page blanche sous Firefox) et `skipWaiting()` + `clientsClaim()` dans le service worker.
  Ne précacher que la coquille.

## ⚠️ Chiffres PÉRIMÉS — à recompter avant tout usage

**Le bloc ci-dessous date du 15/08/2026 et n'est plus vrai.** Vérifié le 30/08 : les migrations
sont allées jusqu'à `0114`, et `0113` parle d'« un import de 3 254 fiches » quand ce bloc annonce
54 établissements « tous à Ampefy ». `0108` signale en plus que le compteur « 2 469 sites »
annonce plus que ce qui existe.

**Je ne mets pas de chiffre à la place : aucun de ceux-là n'est un décompte vérifié.** Toute
question de volumétrie se recompte dans la base avant de dimensionner un écran. La règle « à ne
pas embellir » reste entière — elle s'applique maintenant à ces chiffres-ci.

## ~~Chiffres réels au 15/08/2026~~ (conservés pour mémoire, NE PLUS UTILISER)

178 destinations · 5 avec saisonnalité · 41 avec accès · 95 plats + 254 variantes ·
54 établissements publiés, tous à Ampefy · 9 avec GPS propre · 1 chambre saisie ·
0 carte de restaurant · 0 tarif de saison · 0 avis · 0 circuit · 28 récits · 1 membre inscrit.

---

## Notes de mise en œuvre ajoutées par le développement

Ces points ne contredisent pas les règles ci-dessus : ils disent où le code s'en écarte
aujourd'hui, et pourquoi.

- **Il n'existe pas de titre de publication.** `posts` porte `body`, pas `title`. Les maquettes
  qui montrent « titre sur deux lignes » décrivent donc les 3 premières lignes du corps, tronqué
  à 180 caractères. Mesuré : 1 494 caractères de moyenne, 1 910 au maximum, aucun sous 90.
- **`pages.cover_url` et `pages.gallery` sont vides sur les 54 fiches.** Une carte
  d'établissement sans photo est le cas NORMAL, pas le cas dégradé.
- **La taxe de séjour n'a pas de colonne.** La règle « taxe affichée à part » s'appliquera le jour
  où elle existera ; d'ici là, ne pas afficher de ligne inventée.
- **Secrets :** le dépôt `parpaing25/diako` est PUBLIC. Aucune clé ni mot de passe dans l'arbre.
  Ils vivent dans `~/.diako-secrets` et `~/.fonenako-secrets`.

## Le détail

**18 règles** de plus, remontées des fiches mémoire, dans `REGLES-DETAIL.md` (même dossier). Elles ne sont pas chargées automatiquement : les ouvrir quand le sujet les concerne — le routeur les signale.

## Ajouts en cours de route — à ranger

*Écrites au fil des sessions. À replier dans les sections thématiques lors de la prochaine consolidation.*

- 🟠 **Le fil de Diako porte le VECU des voyageurs : un recit exige un vecu (j'ai goute, on a dormi, nahita...). Une offre, un menu de fete ou des voeux venant d'un etablissement nourrissent SA FICHE (contact, plats, prix), jamais le fil. Un voyage organise date est une agence et ses circuits, pas un evenement ; Noel, reveillon, fete nationale ne sont jamais des evenements** *(03/09/2026)*
  *03/09/2026 : 89 des 418 recits en ligne etaient des publicites d'hotel reecrites (FLASH PROMO -30 %, Vos cours de tennis au Carlton), 6 des voeux de fete, ~70 des 118 evenements des voyages organises d'agence, 13 fiches A vendre publiees*
- 🟠 **Un filtre de bruit ancre (^...$) ne voit que les lignes ENTIERES : le meme bruit colle au texte passe, et un motif en .* avale la ligne avec le texte utile. Filtrer le bruit d'interface en INLINE, et mesurer combien de lignes deja publiees en portent** *(03/09/2026)*
  *106 des 213 recits visibles de Diako affichaient « Voir moins... », « Contenu IA », « Indicateur de statut En ligne » ; et BRUIT_FIL supprimait toute la ligne « Indicateur de statut En ligne TL Voyage LOCATION DE VOITURE », texte compris*
