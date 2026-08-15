# DESIGN-HANDOFF — Diako

Spécification de mise en œuvre du design final. À lire avec les fichiers de design ouverts à côté :

| Fichier | Contenu |
|---|---|
| `Diako Design Final.dc.html` | Identité, composants, écrans sociaux et culinaires, pages nouvelles, carte des routes |
| `Diako v4 Desktop.dc.html` | Coque et 7 gabarits desktop chiffrés aux 4 seuils, états vides |
| `Diako Ecrans.dc.html` | Les 21 écrans mobiles v3 (A1–F3) et les vues web W1–W5 |
| `CLAUDE.md` | Les règles non négociables — lire en premier |

Ouvrir un `.dc.html` dans un navigateur suffit : ce sont des fichiers autonomes.
Ils vivent dans le projet claude.ai/design `20f5db1e-059e-4675-a473-eeb2be1dafff`.

---

## 1 · Jetons

```css
--dk-teal:        #0E7C86;  /* actions, lieux, état actif ; 4,95:1 sur blanc */
--dk-teal-dark:   #0A5F67;  /* survol, texte teal sur fond clair */
--dk-teal-soft:   #E7F2F3;  /* fond d'accent teal */
--dk-coral-text:  #D0471C;  /* plats, CTA, toute étiquette portant du texte ; 4,57:1 */
--dk-coral-deco:  #F4633A;  /* décor uniquement — jamais sous du texte */
--dk-coral-soft:  #FDEDE8;  /* fond d'accent corail */
--dk-gold:        #E8C77A;  /* bande tissée, jalons */
--dk-gold-soft:   #FFF6E5;  /* fond d'accent doré (bons plans, fady) */
--dk-sand:        #F7EFE3;  /* fond chaud, blocs de prix */
--dk-desk:        #EDE5D9;  /* fond d'application */
--dk-ink:         #10262B;  /* texte, établissements */
--dk-body:        #2B4247;  /* corps de texte long */
--dk-muted:       #5B6E72;  /* secondaire */
--dk-line:        #E3DACE;  /* bordures */
--dk-line-soft:   #EFE7DB;  /* séparateurs internes */
--dk-ok:          #256B3D;  /* ouvert, actif */  --dk-ok-soft:   #E9F5EC;
--dk-warn:        #8A6412;  /* ferme bientôt */  --dk-warn-soft: #FFF6E5;
```

Rayons : 999px (pastilles), 20px (cadre mobile), 16px (grande carte), 12px (carte), 10px (bouton),
8px (pastille de couleur). Ombres : une seule, `0 18px 34px -24px rgba(16,38,43,.4)`.

Typographie : `system-ui` uniquement. 34/700 titre, 22/700 section, 16/600 carte, 15/400 corps,
13/400 secondaire, 11/700 + `letter-spacing:.12em` + majuscules pour les étiquettes.
`tabular-nums` sur tous les chiffres de prix et de compteur. Champs de saisie à 16px.

---

## 2 · Coque et seuils

```
max-w-[1850px] mx-auto flex gap-4 px-3 xl:px-4
rail gauche  w-64  (256px) à partir de xl (1280)
rail droit   w-80  (320px) à partir de lg (1024)
```

| Seuil | Coque | Rail g. | Contenu | Rail d. | Grille du contenu |
|---|---|---|---|---|---|
| 1024 lg | 1000 | — | 664 | 320 | 2 × 324 |
| 1280 xl | 1248 | 256 | 640 | 320 | 2 × 312 |
| 1440 | 1408 | 256 | 800 | 320 | 2 × 392 |
| 1920 | 1850 | 256 | 1242 | 320 | 3 × 403 |

4 colonnes réservées à `/plats` et `/explorer` (cartes sans prix ni extrait) : 4 × 188 à 1440,
4 × 291 à 1920. Colonne de lecture bloquée à 620 px (700 à 1920). En dessous de 1024 : une colonne
et barre du bas à 5 entrées avec bouton central `+`.

> Le seuil 1920 n'existe pas dans Tailwind : il est ajouté sous le nom `large` dans
> `tailwind.config.ts`, à l'intérieur de `extend.screens` — jamais à la racine de `theme`,
> qui effacerait tous les seuils par défaut.

---

## 3 · Les 7 gabarits

| G | Nom | Routes | Colonnes à 1920 (px) |
|---|---|---|---|
| G1 | Flux de cartes | `/`, `/explorer`, `/plats`, `/gouts`, `/pro`, `/evenements`, `/circuits`, `/sites` | 256 · 3 × 403 · 320 |
| G2 | Lecture longue | `/post/:id`, `/guides/:slug`, `/cgu`, `/mentions`, `/confidentialite` | 256 · 700 récit + 518 commentaires · 320 |
| G3 | Dossier éditorial | `/lieu/:slug`, `/plat/:slug`, `/p/:slug`, `/circuit/:slug`, `/site/:slug` | 256 · 620 sections + 340 repères + 250 autour · 320 |
| G4 | Résultats et carte | `/recherche`, `/carte` | 256 filtres · 800 résultats · 730 carte (pleine largeur, sans rails) |
| G5 | Deux volets | `/messages`, `/notifications`, `/favoris`, `/user/:id`, `/pro/:slug/demandes` | 256 · 340 liste + 552 détail + 302 contexte · 320 |
| G6 | Saisie et aperçu | `/publier`, `/projet`, `/compte`, `/parametres`, `/pro/:slug` | 256 · 828 éditeur + 390 aperçu · 320 |
| G7 | Seuil et impasse | `/auth`, `/bienvenue`, `*`, tous les états vides | 2 × 925 (action / contenu réel) |

Détail des 4 seuils par gabarit : section 4 de `Diako v4 Desktop.dc.html`.

---

## 4 · Composants à construire d'abord

1. **`<PriceBlock>`** — montant, unité, base, `checked_at`. Rend « Nous consulter » si
   `checked_at` > 6 mois ou montant absent. Jamais de prix affiché hors de ce composant.
2. **`<TagRow>`** — les trois tags (lieu teal, établissement ink, plat corail), toujours dans cet
   ordre, chacun cliquable vers sa fiche.
3. **`<ReactionBar>`** — 6 réactions nommées : Utile, Beau, J'y vais, Bon prix, Merci, Prudence.
   Une seule par membre et par cible. Pas d'emoji.
4. **`<EmptyState>`** — props `manque`, `action`, `contenuReel`. Les trois sont obligatoires ;
   le composant refuse de rendre s'il en manque un.
5. **`<PostCard variant="recit|adresse|assiette|bonplan|question|alerte|promo">`** — photo à ratio
   fixé, titre 2 lignes, extrait 3 lignes, `<TagRow>`, `<PriceBlock>` si tarif, `<ReactionBar>`.
6. **`<VerifiedBadge>`** — dit ce qui est vérifié (téléphone, lieu, documents, partenaire),
   jamais la qualité du service.
7. **`<FreshnessBadge>`** — « Tarifs confirmés le … » / « Tarif à confirmer ».
8. **`<Shell>`** — coque, rails, barre du bas mobile, seuils. Tout le reste en hérite.

---

## 5 · Écrans du design final

| Réf | Écran | Fichier |
|---|---|---|
| M1 | Fil mobile · récit, adresse, assiette | Design Final §2 |
| M2 | Publier · les trois tags + tarif relevé | Design Final §2 |
| M3 | Mon carnet de goûts *(nouveau)* | Design Final §2 |
| M4 | Fiche plat · où en manger | Design Final §2 |
| D1 | Accueil desktop 1440 · grille + rail culinaire | Design Final §3 |
| D2 | Atlas des plats `/plats` *(nouveau)* | Design Final §3 |
| N1 | Circuit *(sans table)* | Design Final §4 |
| N2 | Site et parc, avec fady *(sans table)* | Design Final §4 |
| N3 | Projet de voyage et offres reçues *(sans table)* | Design Final §4 |
| W1–W5 | Web : fil, recherche + carte, fiche, console pro, règles responsive | Ecrans v3 |
| A1–F3 | 21 écrans mobiles complets | Ecrans v3 |

---

## 6 · Tables à créer pour les écrans nouveaux

| Écran | Tables | Contraintes à ne pas oublier |
|---|---|---|
| Atlas et carnet de goûts | `dish_tastings (user_id, dish_id, post_id, tasted_at)` | unique (user_id, dish_id) ; le référentiel `dishes`/`dish_aliases` existe déjà |
| Circuits | `tours`, `tour_prices`, `tour_days`, `tour_inclusions`, `tour_departures` | prix **par personne** et par palier de `pax_min` ; `months_open` |
| Sites et parcs | `attractions` | double grille résident / non-résident ; guide facturé **par groupe** ; `fady text[]` |
| Événements | `events` | `yearly` pour les phénomènes naturels (baleines, litchis) |
| Projets de voyage | `trip_requests`, `trip_offers` | index unique « un projet actif par membre » ; trigger 5 offres max par pro et par projet |
| Demandes | `bookings` | `children_ages smallint[]` ; `first_reply_at` alimente « répond en N h » |
| Modération | `reports`, `blocks` | masquage auto au 3ᵉ signalement distinct |
| Guides | `guides` (contenu éditorial en base) | une seule source, le HTML pré-rendu est généré |

> État au 15/08/2026 : `tours`, `tour_prices`, `tour_days`, `tour_inclusions`, `reports` et
> `blocks` EXISTENT déjà. Restent à créer : `dish_tastings`, `tour_departures`, `attractions`,
> `events`, `trip_requests`, `trip_offers`, `bookings`, `guides`.

---

## 7 · Ordre de mise en œuvre

1. **`<Shell>` + jetons + les 8 composants.** Les 23+ routes en héritent ; c'est ce qui fait
   disparaître la majeure partie du vide mesuré (628 px → 70 px à 1920).
2. **G1** — `/` et `/explorer`.
3. **G3** — `/lieu/:slug`, `/plat/:slug`, `/p/:slug` : c'est là que le référentiel devient visible.
4. **G7** — les états vides, qui concernent presque tous les écrans aujourd'hui.
5. **`/plats` + `/gouts` + le geste « Assiette »** — l'aventure culinaire, différenciant du produit,
   et la seule brique sociale qui fonctionne avec 1 membre inscrit.
6. **G5 et G6** — messagerie, carnet, console pro.
7. **G2 et G4** — déjà partiellement en place.
8. **Écrans sans table** — circuits, sites, événements, projets, demandes, modération :
   brancher table par table, et n'ouvrir l'entrée de navigation qu'une fois l'écriture en base
   fonctionnelle.

## 8 · Vérification avant de considérer un écran fini

- Passe sur un vrai Android en 3G à 390 px, et à 1024 / 1280 / 1440 / 1920.
- Aucun `select('*')`, aucune nouvelle souscription Realtime hors chat et notifications.
- Chaque prix passe par `<PriceBlock>`, chaque état vide par `<EmptyState>`.
- Aucun texte sur `#F4633A`. Contraste vérifié au contrastomètre, pas à l'œil.
- `types.ts` régénéré, migration unique et rejouable, déployé en ligne.
