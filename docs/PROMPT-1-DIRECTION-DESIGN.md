# PROMPT 1 — Direction artistique de Diako

> **À copier-coller tel quel à Claude.** Il n'a pas accès au dépôt : tout ce dont
> il a besoin est ci-dessous.

---

Tu es directeur artistique. Tu conçois l'identité visuelle et le système de
design de **Diako**, le réseau social malgache du voyage et de l'exploration
(diako.fonenako.mg). Lis tout avant de proposer quoi que ce soit.

## 1. Ce qu'est Diako, en une phrase

Ce n'est **pas** un annuaire d'hôtels ni un comparateur. C'est l'endroit où les
gens racontent leurs voyages à Madagascar — avec les prix qu'ils ont réellement
payés — et où les hôtels, tables, agences et guides tiennent leur page. La
promesse affichée en haut de l'accueil : *« Madagascar se raconte par ceux qui y
vont. »*

Le modèle mental est celui d'un **carnet de voyage collectif**, pas d'un tableau
de bord.

## 2. Qui s'en sert, vraiment

Quatre personnes réelles, à garder en tête pour chaque décision :

1. **Un touriste étranger** qui prépare la RN7 depuis l'Europe, sur un bon
   ordinateur, et qui veut écrire à une agence.
2. **Une Malgache** qui part à Majunga avec un budget serré, sur un **Android
   d'entrée de gamme en 3G**, écran de 390 px de large. C'est elle qui décide de
   tout : si la page est lourde, elle ne la voit jamais.
3. **Un voyageur qui rentre** de Sainte-Marie et veut publier son récit avec des
   photos, en mentionnant les établissements où il est passé.
4. **Un gérant d'hôtel-restaurant à Ifaty** qui saisit ses chambres avec des
   tarifs saisonniers, ses plats avec leurs prix, ses activités.

Les langues : **français d'abord, malgache ensuite**, anglais en dernier. Les
récits mélangent souvent les deux (« Ny varavarana mankany amin'ny ala tsy misy
mpiditra ») — le design doit accueillir ce mélange sans le trahir.

## 3. La charte actuelle (point de départ, pas une prison)

Elle a été posée récemment et tient les contrastes AA. Tu peux la faire évoluer,
mais dis-moi ce que tu changes et **prouve les contrastes**.

| Rôle | Valeur | Note |
|---|---|---|
| Fond | `#FAF6EF` papier | Jamais blanc pur : sur les écrans bon marché très lumineux du marché, le blanc d'application bancaire fatigue et ne raconte rien |
| Encre | `#142524` | |
| Carte | `#FDFBF7` | Elle respire sur le papier |
| Primaire | `#0F5C5A` teal profond | 7,2:1 sur papier |
| Accent | `#B4472F` brique | Terre cuite des Hautes Terres. 4,9:1 sur papier, 5,0:1 pour le texte posé dessus |
| Or | `#B8912F` | **Liseré uniquement**, jamais un aplat de texte |
| Sable | `#EFE6D7` | |

Typographie actuelle : **Inter** (auto-hébergée, variable) pour le courant,
**serif système** (Georgia) en italique pour les titres éditoriaux, **monospace
système** en petites capitales espacées pour les étiquettes de section.

Éléments décoratifs existants : une **frise tissée** rappelant le lamba (dégradés
CSS répétés, 4 px de haut), un **grain de papier** (trame de points à 3,5 %
d'opacité).

Le logo : palmier + « Diako » manuscrit + arc « voyager c'est vivre », tracé noir
uni. Il est détouré, reteint à l'encre du site, et s'inverse en mode nuit.

## 4. Les contraintes NON NÉGOCIABLES

Ce sont des règles de survie du produit, pas des préférences. Une proposition qui
les enfreint est inutilisable.

### 4.1 Performance — c'est la contrainte n°1

- Cible : **bundle initial < 200 Ko brotli**, sur **3G malgache**.
- **AUCUNE police décorative importée.** Serif et monospace sont ceux du système.
  Une police d'affichage coûterait 30 à 80 Ko pour trois titres. Si tu veux du
  caractère typographique, obtiens-le par la mise en page, la graisse, la casse
  et l'espacement — pas par un téléchargement.
- **Aucune bibliothèque d'animation** (pas de Framer Motion, GSAP, Lottie).
  Tout en CSS. La couche actuelle fait moins de 3 Ko.
- **Aucune image décorative lourde.** Les motifs sont des dégradés CSS. Les
  photos sont celles des utilisateurs, servies en vignettes WebP de ~18 Ko puis
  remplacées par la pleine qualité.
- Les icônes viennent de **lucide-react** (déjà présent, tree-shaké).

### 4.2 Honnêteté des données

- **Ne dessine JAMAIS un bloc qui suppose des données inexistantes.** La version
  précédente affichait « Nosy Be — 1.2k posts », « Hôtel Sakamanga 4,8 (245
  avis) », « Festival Donia 15 déc 2024 » : tout était inventé et périmé de deux
  ans. Un compteur qui ment une fois ne se rattrape jamais.
- **Aucun prix en ariary inventé**, jamais, même en maquette. Écris `—` ou
  « tarif non communiqué ».
- Si un état vide est probable, **dessine l'état vide en même temps que l'état
  plein**, et rends-le utile (que faire maintenant ?) plutôt que décoratif.

### 4.3 Accessibilité

- Contraste **AA minimum** sur fond papier ET sur fond de nuit. Donne-moi les
  ratios calculés.
- Cible tactile **44 px minimum**.
- `prefers-reduced-motion` neutralise tout mouvement — conçois en le supposant.
- Focus clavier **visible partout**. Jamais `outline: none` sans remplacement.
- Chaque champ a une étiquette. Le site est actuellement à zéro champ sans
  étiquette : ne régresse pas.

### 4.4 Mobile d'abord, pour de vrai

Dessine **390 px en premier**, puis élargis. Le desktop est un bonus. La barre de
navigation du bas a 5 emplacements et « Publier » est au centre.

### 4.5 Technique

- **Tailwind + shadcn/ui**, jetons HSL en variables CSS (`--primary`,
  `--background`…). Exprime tes couleurs en jetons, pas en valeurs en dur.
- Mode clair **et** mode nuit, tous les deux.
- ⚠ Une seule clé `colors:` dans la config Tailwind. En JS, une seconde clé
  écrase la première et fait disparaître tout le thème.

## 5. Ce qui existe réellement en base (et ce qui n'existe pas)

Dessine pour **ça**, pas pour un site imaginaire.

**Il y a :** 178 destinations avec leur région, leur saisonnalité mois par mois
(idéale / correcte / déconseillée, avec la raison) · 95 plats malgaches
référencés avec leurs alias · 54 fiches d'établissements (hôtels et maisons
d'hôtes d'Ampefy) · 28 récits de voyage avec photos · un modèle
`PAGE → OFFRE → TARIF` (chambres, plats, activités, circuits, tarifs
saisonniers) · avis et notes · messagerie · notifications push · une carte
Leaflet/OpenStreetMap · un agent conversationnel qui répond aux questions de
voyage.

**Il n'y a pas encore :** aucune carte de restaurant saisie (`menu_items` est
vide) · aucun tarif saisonnier saisi · aucune mesure de recherche · une seule
personne inscrite · des établissements uniquement à Ampefy, nulle part ailleurs.

Conséquence directe : **la plupart des écrans sont aujourd'hui vides ou presque.**
Un design qui n'est beau que plein est un design raté ici. Montre-moi comment
chaque écran se tient avec 0, 1 et 50 éléments.

## 6. Le problème que tu dois résoudre

Le propriétaire du site a dit, en regardant la version actuelle :

> « Je ne suis pas vraiment convaincu sur le design, c'est encore comme un site
> mort. »

Puis, plus tôt :

> « Pour être plus original, et bien refléter le réseau social voyage à
> Madagascar. »

Traduction : c'est propre mais **générique et inerte**. Ça pourrait être
n'importe quel réseau social. Il manque le caractère malgache, et il manque la
sensation qu'il se passe quelque chose.

**Ta mission : trouver la forme juste.** Pas « ajouter des animations » —
trouver ce qui fait que ce site ne peut être que celui-là, et de Madagascar.

Quelques pistes à explorer ou à écarter en argumentant : le lamba et ses motifs
tissés · les couleurs de la latérite, du zébu, de la vanille, du raphia · la
typographie des enseignes peintes à la main de Tana · la logique du carnet
(papier, tampon, ticket, itinéraire tracé à la main) · la saisonnalité comme
motif central, puisque c'est la donnée la plus riche du site · la distinction
franche entre le récit (chaud, humain) et la fiche (froide, factuelle).

## 7. Ce que je veux que tu me rendes

Un **rapport écrit**, en français, structuré ainsi :

1. **Le parti pris**, en cinq lignes maximum. Qu'est-ce qui fait que c'est Diako
   et pas autre chose ?
2. **Ce que tu gardes de l'existant, ce que tu jettes, et pourquoi.** Sois franc.
3. **Le système** : palette complète avec ratios de contraste calculés en clair
   ET en nuit, échelle typographique, échelle d'espacement, rayons, ombres,
   traitement des états (repos / survol / appui / focus / désactivé / chargement
   / vide / erreur).
4. **Le langage de mouvement** : quoi bouge, quand, combien de temps, avec quelle
   courbe — et surtout **ce qui ne doit PAS bouger**. Justifie chaque animation
   par ce qu'elle apprend à l'utilisateur.
5. **Les motifs d'interface récurrents** : la carte d'un récit, la carte d'un
   établissement, la carte d'une destination, l'en-tête, la navigation, le
   composeur, les états vides, les squelettes de chargement.
6. **Trois écrans dessinés en détail** — l'accueil, la fiche d'un hôtel, la carte
   — en **390 px et en 1440 px**, décrits assez précisément pour être codés :
   position, taille, graisse, couleur, espacement.
7. **Ce que tu déconseilles** et pourquoi. Cette section m'intéresse autant que
   les autres.

Écris en ASCII ou en description textuelle précise, pas en code. Je ferai coder
ensuite.

**Une dernière chose :** si une de mes contraintes te paraît empêcher un bon
design, dis-le et propose l'alternative. Mais ne l'ignore pas en silence.
