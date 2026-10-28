# Éditeur du jour, page Di'ako : le malgache à relire avant le 04/11/2026

Le fournisseur `editeur_du_jour.py` fabrique trois publications par jour à partir du 04/11 :
**00:00** (événement, plat ou site), **18:00** (album d'une ville ou d'un lieu), **20:00** (reel).
Les textes sont en français. Le malgache n'apparaît qu'à deux endroits : **la ligne de titre**
(sur l'image et en tête du texte) et **la question de fin**. Il vient UNIQUEMENT des phrases
ci-dessous, écrites une seule fois. Seuls des noms propres (lieu, plat, région) y sont insérés,
à la place de `{nom}`.

**Pour corriger** : écrire la correction dans la dernière colonne. Je la reporte dans
`GABARITS_MG` (en tête de `editeur_du_jour.py`) ou dans `serie3.json` ; tout ce qui sort ensuite la prend.
Une phrase que vous barrez sans la remplacer est retirée, et le texte passe en français.

Contrôles déjà faits par le script à chaque fabrication : aucune lettre c, q, u, w, x, ç dans un mot
malgache des gabarits ; une question fermée (qui commence par « Efa ») porte « ve ».

## 1. Les phrases de l'éditeur (nouvelles, jamais relues)

| Code | Malgache | Sens voulu | Où | Correction |
|---|---|---|---|---|
| `mg-titre-evenement` | *Amin'ity volana ity* | En ce mois-ci | titre, 00:00, événement du mois | |
| `mg-q-evenement` | *Efa nahafantatra izany ve ianao ?* | Le saviez-vous déjà ? | question, 00:00, événement | |
| `mg-titre-plat` | *Sakafo malagasy matsiro* | Un plat malgache savoureux | titre, 00:00, plat | |
| `mg-titre-boisson` | *Zava-pisotro malagasy* | Une boisson malgache | titre, 00:00, boisson (eau de coco, rhum arrangé) | |
| `mg-q-plat` | *Efa nanandrana {nom} ve ianao ?* | Avez-vous déjà goûté le {nom} ? | question, 00:00, plat ({nom} = nom malgache de la base) | |
| `mg-q-plat-generique` | *Efa nanandrana izany ve ianao ?* | Avez-vous déjà goûté cela ? | question, 00:00, plat sans nom malgache distinct | |
| `mg-titre-site` | *Toerana tsara ho tsidihina* | Un bel endroit à visiter | titre, 00:00, site | |
| `mg-q-site` | *Efa nandeha tany {nom} ve ianao ?* | Êtes-vous déjà allé à {nom} ? | question, 00:00, site | |
| `mg-titre-lieu` | *Andao ho any {nom}* | Allons à {nom} | titre, 18:00, lieu | |
| `mg-q-lieu` | *Efa tonga tany {nom} ve ianao ?* | Êtes-vous déjà venu jusqu'à {nom} ? | question, 18:00, lieu | |
| `mg-titre-reel` | *Madagasikara tsara tarehy* | Madagascar, la belle | titre, 20:00, tous les reels | |
| `mg-q-reel-lieu` | *Efa nandeha tany {nom} ve ianao ?* | Êtes-vous déjà allé à {nom} ? | question, 20:00, reel d'un lieu | |
| `mg-q-reel-region` | *Efa nitsidika ny faritra {nom} ve ianao ?* | Avez-vous déjà visité la région {nom} ? | question, 20:00, reel d'une région | |
| `mg-q-reel-plats` | *Iza amin'ireo no tianao indrindra ?* | Lequel préférez-vous ? | question, 20:00, reel de plats (question ouverte : pas de « ve ») | |

Les noms malgaches de plats qui peuvent entrer dans `mg-q-plat` sont ceux de la base
(`dishes.name_mg`), par exemple *Vary maina*, *Lasary voatabia*, *Akoho sy voanio*, *Ravimbomanga*,
*Ranom-boanio*. Un nom qui porte une lettre hors de l'alphabet malgache n'y entre jamais : la
question générique le remplace.

## 2. Les villes de la série 3, reprises à 18:00

Les 30 albums « ville par ville » (`serie3.json`) n'ont jamais été publiés (refus 368 du 07/10).
L'éditeur les reprend tels quels, chiffres recomptés en direct. Leur malgache **n'a pas encore été relu** :
il est déjà détaillé, avec le sens voulu et une colonne de correction, dans
**`A-RELIRE-malgache-serie3.md`** (§ 1 titres, § 2 questions, § 3 et 4 mots glosés sur les cartes).
Une correction écrite là-bas vaut pour l'éditeur : je la reporte dans `serie3.json`.

Deux libellés fixes s'y ajoutent, sur les images :

| Où | Malgache | Sens | Correction |
|---|---|---|---|
| carte « le nom » (fabriquer3.py) | *Ny anarana · le nom* | le nom | |
| pastille en haut de l'affiche | *Tanàna* / *Anaran-tanàna* | Ville / Nom de ville | |

## 3. Ce qui n'est jamais en malgache

- Les reels n'ont **aucune voix** : une voix malgache de synthèse demande votre écoute
  (consigne des tutos) ; ils sortent en musique seule, texte à l'écran en français.
- Les cartes, les textes, les crédits et les noms de rubrique de l'éditeur (« Ce mois-ci »,
  « Le goût », « À voir », « Destination ») sont en français.
