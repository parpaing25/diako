# PROMPT 2 — Moderniser TOUTES les pages de Diako

> **À copier-coller tel quel à Claude**, après le prompt 1 (ou avec, dans la même
> conversation). Il n'a pas accès au dépôt : tout est ci-dessous.

---

Tu reprends la direction artistique établie et tu l'appliques à **l'intégralité**
du site Diako. Pas un échantillon : les 21 routes et les 22 composants partagés
listés ci-dessous, sans exception.

Rappel du contexte, si tu ne l'as pas : Diako est le réseau social malgache du
voyage (diako.fonenako.mg). Cible = **Android d'entrée de gamme, 390 px, 3G**.
Français puis malgache. Fond papier `#FAF6EF`, teal `#0F5C5A`, brique `#B4472F`,
or `#B8912F` en liseré. Tailwind + shadcn, jetons HSL. Aucune police importée,
aucune bibliothèque d'animation, aucun prix inventé, contrastes AA, mode nuit
obligatoire, `prefers-reduced-motion` respecté.

## Comment traiter chaque écran

Pour **chacun** des écrans ci-dessous, produis :

- **Le diagnostic** : ce qui ne va pas aujourd'hui, en une à trois phrases.
- **La structure cible** en 390 px puis en 1440 px : ce qu'on voit du haut vers
  le bas, dans l'ordre, avec les tailles et les graisses.
- **Les trois états** : vide (aucune donnée — c'est le cas le plus fréquent
  aujourd'hui), chargement, plein.
- **Ce qui bouge**, et pourquoi.
- **Le premier geste** que l'utilisateur doit avoir envie de faire, et comment
  l'écran l'y amène.

Sois concret. « Améliorer la hiérarchie » ne sert à rien ; « le prix passe en
28 px semi-gras teal, la catégorie descend en 12 px gris » est utilisable.

---

## A. Les écrans publics — c'est là que tout se joue

| # | Route | Rôle | État actuel, franchement |
|---|---|---|---|
| 1 | `/` | **Accueil** : bandeau + fil des récits + rail droit | Le bandeau, le fil et le rail ne se parlent pas. Trois blocs empilés. |
| 2 | `/explorer` | Les 178 destinations, filtrables par région et saison | Grille de cartes sans caractère. La saisonnalité, qui est notre meilleure donnée, y est invisible. |
| 3 | `/recherche` | Recherche par lieu, par plat, par budget | Formulaire honnête mais austère. Les résultats vides ne guident nulle part. |
| 4 | `/carte` | Carte Leaflet/OSM des établissements | Fonctionne. 9 fiches sur 54 ont leur position exacte, les 45 autres sont au centre de la commune et c'est écrit. Le panneau du bas mérite mieux. |
| 5 | `/p/:slug` | **Fiche d'un établissement** — l'écran le plus important du site | 1 071 lignes, six onglets (chambres, carte, activités, circuits, avis, infos), tarifs, contact WhatsApp, avis, revendication. Dense et plat. C'est ici que se décide une réservation. |
| 6 | `/post/:id` | Un récit en pleine page (cible de tous les partages) | Minimal. C'est pourtant la première page que voit quelqu'un qui arrive par WhatsApp. |
| 7 | `/user/:id` | Profil public d'un membre | Squelettique. |
| 8 | `/bienvenue` | Première visite | Correct, à mettre au niveau. |

## B. L'espace personnel

| # | Route | Rôle | État actuel |
|---|---|---|---|
| 9 | `/auth` | Connexion et inscription | Sobre. Premier contact : doit rassurer et donner envie. |
| 10 | `/compte` | Mon compte | Liste de réglages sans hiérarchie. |
| 11 | `/parametres` | Paramètres (thème, notifications, confidentialité) | Fonctionnel, terne. |
| 12 | `/favoris` | **Mon carnet** : 3 onglets — adresses gardées, récits enregistrés, publications aimées | Neuf. Les onglets méritent un vrai traitement. |
| 13 | `/messages` | Messagerie façon Messenger, temps réel, accusés de lecture | Récemment refaite, correcte. À harmoniser. |
| 14 | `/notifications` | Le fil des notifications | Liste brute. |
| 15 | `/publier` | **Publier un récit** : photos, texte, lieu, plat, mention d'établissement | 319 lignes. C'est l'acte qui fait vivre le site : il doit être le plus agréable de tous. |

## C. L'espace professionnel

| # | Route | Rôle | État actuel |
|---|---|---|---|
| 16 | `/pro` | Tableau de bord du gérant : ses fiches, complétude, tarifs, avis, vues | Correct mais sans souffle. |
| 17 | `/pro/:slug` | **Console de gestion** : chambres, carte des plats, activités, circuits, tarifs saisonniers, photos, horaires | **1 363 lignes — l'écran le plus lourd du site.** Un gérant d'hôtel à Ifaty doit s'y retrouver seul, sur un téléphone. Priorité absolue de simplification. |

## D. Les pages légales et de service

| # | Route | Rôle |
|---|---|---|
| 18 | `/mentions` | Mentions légales |
| 19 | `/confidentialite` | Confidentialité |
| 20 | `/cgu` | Conditions générales |
| 21 | `*` | **404** — 21 lignes aujourd'hui, une occasion gâchée |
| 22 | *(interne)* | **Écran d'attente** pendant que le projet Supabase se réveille |
| 23 | *(interne)* | **Écran d'erreur** (ErrorBoundary) quand une page casse |
| 24 | *(interne)* | **`offline.html`** — la page servie sans réseau. Sur ce marché, ce n'est pas un cas rare. |

## E. Les composants partagés — les traiter, c'est traiter tout le site

| # | Composant | Rôle | Remarque |
|---|---|---|---|
| 25 | En-tête | Logo, recherche, thème, messages, notifications, compte | Panneaux déroulants façon Facebook déjà en place |
| 26 | Barre du bas (mobile) | 5 emplacements, « Publier » au centre | |
| 27 | Rail latéral (desktop) | Navigation complète | |
| 28 | Menu mobile | Tiroir latéral | |
| 29 | Rail de droite | Chiffres animés, tendances, saison en cours, espace pro | Refait récemment |
| 30 | Bandeau d'accueil | Titre éditorial, recherche, destinations, catégories | |
| 31 | **Carte d'un récit** | Photos, cœur, commentaire, partage, signet | **412 lignes, le composant le plus vu du site** |
| 32 | Récit immersif | Plein écran, façon story | |
| 33 | Carte d'un établissement | Photo, nom, catégorie, prix, note | |
| 34 | Fil | Chargement par curseur, défilement infini | |
| 35 | Composeur | Le champ « Où êtes-vous allé, et combien ça a coûté ? » | |
| 36 | Barre de recherche | Trois tailles : bandeau, en-tête, page | |
| 37 | Carrousel de photos | | |
| 38 | Commentaires | | |
| 39 | **Assistant de création** | 6 étapes, brouillon sauvegardé, pour créer une fiche | 446 lignes |
| 40 | **Agent Diako** | Assistant conversationnel de voyage | 286 lignes. Doit se distinguer d'un chat quelconque |
| 41 | Autour de moi | Établissements proches par géolocalisation | |
| 42 | Image progressive | Vignette floutée puis pleine qualité | |
| 43 | Invitation à installer | Bandeau PWA | |
| 44 | Pied de page | | |
| 45 | Frontière d'erreur | | |

## F. Les éléments transverses à unifier

| # | Élément | Pourquoi c'est important |
|---|---|---|
| 46 | **Les squelettes de chargement** | Visibles sur 17 écrans. Ils balayent aujourd'hui ; harmonise leur forme avec le contenu qu'ils annoncent. |
| 47 | **Les états vides** | L'état le plus fréquent du site aujourd'hui. Chacun doit dire quoi faire, pas seulement qu'il n'y a rien. |
| 48 | **Les messages d'erreur et les notifications passagères** | |
| 49 | **Les formulaires** : champs, étiquettes, aides, erreurs, boutons | Étiquette obligatoire partout, sans exception |
| 50 | **L'affichage des prix en ariary** | La donnée la plus regardée du site. Elle mérite un traitement typographique propre, cohérent partout, avec une règle claire pour « à partir de », « par nuit », « par personne » et « non communiqué ». |
| 51 | **L'affichage des dates et des saisons** | |
| 52 | **Les onglets** | Présents sur la fiche, le carnet, la console pro — trois traitements différents aujourd'hui |
| 53 | **Le mode nuit** | À vérifier écran par écran, pas seulement sur les jetons |

---

## Ce que je veux comme rendu

Un **rapport unique, complet, en français**, organisé ainsi :

### Partie 1 — Ce que j'ai trouvé
Les défauts transverses, classés par gravité. Ce qui casse la cohérence du site
entier plutôt que les détails d'un écran.

### Partie 2 — Les décisions de système
Ce que tu changes dans les motifs communs, et l'effet en cascade sur les écrans.

### Partie 3 — Écran par écran
Les **53 entrées ci-dessus**, dans l'ordre, chacune avec son diagnostic, sa
structure cible en 390 px et 1440 px, ses trois états, son mouvement et le
premier geste visé. Si un écran ne nécessite aucun changement, écris-le et
explique pourquoi — mais ne le saute pas.

### Partie 4 — L'ordre d'exécution
Classe les changements en trois lots : **ce qui change tout pour peu d'effort**,
**ce qui demande du travail mais en vaut la peine**, **ce qui peut attendre**.
Pour chaque lot, dis ce que l'utilisateur remarquera.

### Partie 5 — Ce que tu déconseilles
Ce que tu n'as pas fait exprès, et pourquoi. Cette partie m'intéresse autant que
les autres.

---

**Trois rappels avant de commencer :**

1. **N'invente aucune donnée**, aucun prix, aucun nom d'hôtel, aucun compteur. La
   plupart de ces écrans sont vides aujourd'hui — dessine pour ça.
2. **Aucune police importée, aucune bibliothèque d'animation, aucune image
   décorative lourde.** La 3G malgache est la contrainte qui prime sur tout.
3. **Écris en texte, pas en code.** Descriptions précises, croquis ASCII si utile.
   Je ferai coder ensuite.

Prends le temps qu'il faut. Je préfère un rapport long et exploitable qu'un
résumé élégant.
