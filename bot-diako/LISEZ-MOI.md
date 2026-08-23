# Bot de collecte — Diako

Automatise la partie répétitive de la prospection : parcourir Facebook (groupes,
pages, votre fil, des **recherches**) **et le site officiel des établissements**,
repérer ce qui parle de voyage, de goût et de sorties à Madagascar, en faire un
dossier prêt à publier, et pousser le résultat sur diako.fonenako.mg depuis une
interface web.

Le tri et la décision restent à vous. Le bot ne publie **rien** tout seul.

**Les deux moitiés ne rapportent pas la même chose.** Facebook donne de la vie —
des photos, des ouvertures, des récits, des événements. Il donne mal les
**tarifs structurés** : un hôtel ne publie pas sa grille de chambres sur sa page,
il la met sur son site. C'est pour ça que le bot lit aussi le web ouvert.

---

## Pourquoi ce bot n'est pas celui de Fonenako

Le bot immobilier crée une annonce par publication. Ici, **l'annuaire existe
déjà** — et c'est tout le problème. Mesuré sur la base le 23/08/2026 :

| Ce que Diako a | Ce qui lui manque |
|---|---|
| **3 356 fiches** d'établissement (1 862 restaurants, 1 476 hôtels), 3 310 avec GPS | **0 photo de couverture sur 3 356.** 2 966 sans aucun contact, 3 264 sans description |
| 95 plats et 255 orthographes au référentiel | **4 lignes de carte** sur tout le site → « qui sert du ravitoto, et à quel prix » ne répond rien |
| 22 707 lieux, 2 521 sites | 2 295 sites sans photo |
| 42 événements au calendrier | **0 événement à venir** |
| 29 récits, 1 membre | le fil est vide |

Le référentiel est plein, les fiches sont creuses. Le travail du bot n'est donc
pas de créer la fiche n° 3 357 : c'est de **remplir les 3 356 qui existent**.
D'où deux mécanismes que le bot immobilier n'a pas :

- le **rapprochement** avec l'annuaire, avant toute écriture ;
- l'écriture **sans écrasement** : seules les colonnes vides sont remplies.

Le tableau *Ce qui manque à Diako* du tableau de bord affiche ces chiffres en
direct, et la carte *Où chercher* en déduit des recherches Facebook à ajouter —
chacune justifiée par un compte réel (« 438 restaurants sans carte à
Antananarivo »).

---

## Démarrer

Double-cliquez **`DEMARRER.bat`**. L'interface s'ouvre sur
<http://127.0.0.1:8757> ; laissez la fenêtre noire ouverte tant que vous
travaillez. Le port est voisin du 8756 du bot immobilier : les deux peuvent
tourner en même temps.

```bash
cd bot-diako
python demarrer.py                    # port 8757
python demarrer.py --port 9000 --sans-navigateur
```

### Première installation

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

---

## Les quatre étapes

### 1. Connecter le compte Facebook (une seule fois)

Tant qu'aucun compte n'est branché, un bandeau orange occupe le haut du tableau
de bord et le bouton *Lancer la collecte* reste gris. Cliquez **Connecter mon
compte Facebook** : une fenêtre Chromium s'ouvre, vous vous connectez
normalement, et **elle se referme d'elle-même** dès que la session est
enregistrée.

Aucun mot de passe n'est saisi dans l'interface du bot : la connexion se fait
sur le vrai site Facebook, et seule la session Chromium est gardée dans
`data/profil-fb/`. Le lien **Changer de compte** oublie la session.

### 2. Déclarer les sources — quatre natures

Onglet **Sources**. Collez une adresse… ou **tapez simplement ce que vous
cherchez**.

| Ce que vous collez | Reconnu comme |
|---|---|
| `facebook.com/groups/tourisme.mada` | **Groupe** (il faut en être membre) |
| `facebook.com/SakamangaHotel` | **Page** |
| `facebook.com` ou `facebook.com/?sk=h_chr` | **Fil d'actualité** de votre compte |
| `menu restaurant Nosy Be` | **Recherche** Facebook |
| `www.campcatta.com` | **Site web** de l'établissement |
| `facebook.com/share/g/AbCdEf/` | refusé : ouvrez-le, puis copiez la vraie adresse |
| `booking.com/…`, `tripadvisor.…` | refusé : voir « Le web ouvert » plus bas |

- Les **groupes** sont ouverts en tri **chronologique** ; sans ça Facebook sert
  « les plus pertinents », c'est-à-dire souvent des publications vues il y a
  trois semaines.
- Sur une **page**, l'auteur de la publication *est* l'établissement : c'est le
  nom le plus sûr dont dispose le rapprochement.
- Le **fil d'actualité** évite de déclarer une à une les dizaines de pages que
  vous suivez déjà — et l'algorithme de Facebook y met en avant ce qui vous
  intéresse. C'est la source la **moins chère en pages chargées par
  trouvaille**, donc celle qu'on déroule le plus loin : **45 défilements**
  contre 25 ailleurs, et **quatre** tours stériles tolérés au lieu de deux (le
  fil alterne des blocs utiles et des blocs sans intérêt — souvenirs,
  suggestions, publicités — et s'arrêter au premier creux le couperait au
  mauvais endroit). Un bouton dédié l'active en haut de l'onglet Sources.
- La **recherche** est le seul moyen d'atteindre ce que vous ne suivez pas
  encore. C'est là que sont les niches : un restaurant qui vient d'ouvrir, une
  carte photographiée par un client, un festival de province.
- Le **site web** est le seul endroit où l'on trouve une *grille de tarifs* :
  types de chambre, saisons, carte complète. Une source « site » **sait de
  quelle fiche elle parle**, donc ses prix ne sont jamais rattachés au jugé. Et
  elle ne passe pas par Facebook : elle continue de fonctionner le jour où la
  session a expiré.

L'ordre de passage est **la source la plus anciennement visitée d'abord**. Sans
ça, un tour interrompu ne toucherait jamais la fin de la liste — c'est ce qui
est arrivé au bot immobilier, où les pages, ajoutées après les groupes,
n'étaient jamais visitées.

### 3. Lancer la collecte

Le bot parcourt chaque source active, déplie les « Voir plus » **sur place**
(une page chargée en moins par publication), télécharge les photos depuis le
CDN, prend une capture d'écran, lit le texte, **rapproche de l'annuaire**, note,
et range le tout dans `data/trouvailles/<date>/<id>/`.

#### Quatre natures de trouvaille

Le classement décide de la table d'arrivée sur Diako. L'ordre des tests n'est
pas cosmétique : une carte est d'abord une carte, même si elle nomme
l'établissement ; un événement est d'abord un événement, même s'il se tient
dans un hôtel.

| Genre | Reconnu à | Va dans |
|---|---|---|
| **carte** | au moins 3 plats chiffrés | `menu_sections` + `menu_items` (+ `menu_photos`) |
| **evenement** | une **date** + un mot d'événement | `events` |
| **etablissement** | une catégorie + un moyen de joindre + de quoi le situer | `pages` (créée ou complétée) |
| **recit** | tout le reste | `posts`, sur le compte Diako |

Un genre décoché dans les réglages n'est pas collecté du tout : inutile de faire
trier des publications qu'on ne publiera jamais.

### 3 bis. L'onglet Automatisation

Tout ce qui peut tourner seul est regroupé là, une règle par carte, avec un
interrupteur et la phrase qui dit ce qu'elle fait. Le tableau de bord en affiche
le résumé — **« ce qui se passera sans vous »** — pour qu'on n'ait jamais à
deviner l'état des réglages.

| Règle | Ce qu'elle fait | Par défaut |
|---|---|---|
| **Collecter aux heures dites** | passe sur toutes les sources actives ; le dernier passage creuse plus loin si l'objectif n'est pas atteint | **actif** — 11 h et 18 h, objectif 40 |
| **Chercher les sites web** | annuaire + OpenStreetMap + liens des publications → nouvelles sources | **actif** — tous les 7 jours |
| **Faire relire par l'IA** | texte libre, grilles de tarifs, cartes photographiées | **actif** |
| **Valider seule** | passe en « validée » au-dessus d'un score, si rien ne manque | éteint — 80/100 |
| **Écarter seule** | passe en « rejetée » sous un score ; rien n'est supprimé | éteint — 20/100 |
| **Publier seule** | met les validées en ligne, avec un plafond quotidien | **éteint** — voir ci-dessous |
| **Faire le ménage** | efface rejetées et doublons passé un âge, photos comprises | **actif** — 30 jours |
| **Rattacher seule** | au-dessus du seuil *et* sur un lieu concordant | toujours — 0,78 |

Le bouton **Essayer maintenant** applique le tri tout de suite sur la vraie
file : on voit ce que les seuils donnent avant de les laisser tourner une
semaine. Mesuré sur une file réelle de 11 trouvailles, avec les seuils 55 et
25 : 8 validées, 3 écartées, 3 laissées au milieu.

> 🔴 **La publication automatique est la seule règle qui ne se rattrape pas.**
> Valider ou rejeter tout seul se défait d'un clic — rien n'est parti en ligne.
> Publier écrit la fiche sur diako.fonenako.mg, où les visiteurs la voient ;
> revenir en arrière est un retrait à la main. Le plafond quotidien existe pour
> qu'une lecture qui part de travers se voie sur dix fiches, pas sur deux cents.

**Ce que l'automatisation ne fait jamais :**

- elle ne touche pas **au milieu** — entre les deux seuils, rien ne bouge ;
- elle ne **défait pas** vos décisions : une trouvaille validée ou publiée n'est
  jamais rejetée automatiquement, même si son score baisse ensuite ;
- elle ne publie **rien d'incomplet** : les mêmes contrôles qu'au clic
  s'appliquent ;
- elle **ne tourne que si le bot tourne**.

### 3 ter. Collectes automatiques

Deux passages par jour par défaut : **11 h** et **18 h**, objectif **40
trouvailles/jour**. Si l'objectif n'est pas atteint à l'heure du dernier
passage, celui-ci **déroule plus loin dans les mêmes fils** — deux fois plus de
défilements. Les pauses, elles, ne changent pas : c'est la profondeur qui
augmente, pas le rythme. Le bot ne devient donc pas plus agressif un jour creux.

Un créneau raté reste rattrapable pendant 30 minutes. Deux collectes ne se
chevauchent jamais.

> ⚠️ **Les collectes n'ont lieu que si le bot tourne.** L'horloge est dans le
> bot, pas dans Windows.
>
> ```powershell
> powershell -ExecutionPolicy Bypass -File outils\installer-tache-planifiee.ps1
> ```
> (à lancer une fois ; retour arrière :
> `Unregister-ScheduledTask -TaskName "Bot de collecte Diako" -Confirm:$false`)

### 4. Trier et publier

Onglet **Trouvailles**. Chaque carte montre la photo de couverture, le genre, le
lieu et ce qui manque. Le panneau de détail donne, dans l'ordre :

1. **le score et son détail** — pourquoi cette note, poste par poste ;
2. **le rapprochement** — la fiche visée, les candidats, et de quoi trancher ;
3. **les photos** — clic pour la couverture, ✓ pour garder/écarter, 🍽 pour
   marquer une **photo de carte** (elle ira dans `menu_photos`, pas en galerie) ;
4. **les champs du genre** — tous corrigeables ;
5. **la carte**, quand il y en a une — chaque plat, son prix, son rattachement ;
6. **ce qui sera publié**, puis le texte d'origine.

**Valider** (touche `V`), **Rejeter** (`R`), `Échap` pour fermer. Puis *Publier
sur Diako*, ou *Publier les trouvailles validées* pour tout le lot.

---

## Le web ouvert — où sont les tarifs

Bouton **Trouver les sites web** sur le tableau de bord. Il cherche les adresses,
les inscrit comme sources, et les rattache à leur fiche quand c'est sûr.

### D'où viennent les adresses, et pourquoi pas d'ailleurs

Le dépôt a déjà tranché la question (`scripts/moisson_osm.py`) : **OSM Overpass
et Nominatim, jamais Google Maps.** La licence ODbL autorise la réutilisation
avec attribution ; Google Maps, TripAdvisor et Booking l'interdisent
explicitement. Le bot ne scrute donc **aucun moteur de recherche** et **aucun
agrégateur de réservation** — coller une adresse Booking est refusé avec un
message qui le dit. Trois canaux :

| Canal | Ce qu'il rend |
|---|---|
| **L'annuaire Diako** | 193 fiches portent déjà un `website` — rattachement déjà connu, zéro risque d'erreur |
| **OpenStreetMap** | 142 hébergements malgaches y déclarent leur site, plus les restaurants (mesuré le 23/08/2026 via Overpass) |
| **Les publications Facebook** déjà collectées | les liens que les établissements y ont mis eux-mêmes |

Ce qu'on lit ensuite, c'est le site **de l'établissement lui-même**, qui y
publie ses propres prix. C'est la différence entre reprendre une information que
quelqu'un diffuse sur lui-même, et piller la base d'un concurrent.

### Comment le bot lit un site

- `robots.txt` respecté, **2 secondes** entre deux pages du même hôte, **8 pages
  au maximum**, 2 Mo par page.
- Les pages sont classées par intérêt : *tarifs* et *chambres* d'abord, puis
  *carte* et *restaurant*, puis le reste. Une page « tarifs » qui en ouvre une
  plus précise est suivie.
- **Un site en JavaScript est relu avec le navigateur.** Quand le HTML arrive
  mais qu'il n'en sort aucun texte, c'est un site construit côté client (Wix,
  Squarespace…) : il est mis de côté et relu en fin de tournée dans un
  **navigateur neuf**, jamais celui qui porte votre session Facebook.
- Les **PDF** de carte ou de tarifs ne sont pas lus — le bot n'embarque pas de
  lecteur PDF — mais ils sont **signalés** sur la trouvaille, avec leur adresse.

### Deux pièges rencontrés en vrai, et corrigés

- **« menu » ne veut pas dire carte.** Sur `campcatta.com`, le robot dépensait
  quatre pages de son budget sur `sitemenu.htm`, `sitemenu-ita.htm`,
  `sitemenu-eng.htm` et `sitemenu-all.htm` — le même menu de *navigation* en
  quatre langues — sans lire une seule carte. Les cadres de navigation et les
  versions étrangères d'une même page sont maintenant écartés ; le bot y lit
  désormais `restaurant.html` et `hebergement.html`.
- **Une grille de tarifs n'est pas une carte de restaurant.** Les deux lectures
  tournent sur le même texte, et « Bungalow vue mer 180 000 Ar » satisfait aussi
  bien le motif d'un plat que celui d'une chambre. Sans filtre, la page « nos
  tarifs » d'un hôtel entrait dans `menu_items` — la table qu'on essaie
  justement de remplir proprement. Au passage : « Nos tarifs **2026** » n'est
  pas un plat à 2 026 Ar.

### Ce que ça écrit

`room_types`, et `season_rates` quand le site distingue les saisons. Deux lignes
portant le même nom de chambre ne sont **pas** un doublon : ce sont deux
saisons, et elles deviennent **un** type de chambre avec ses tarifs — les fondre
en deux chambres ferait apparaître « Bungalow vue mer » deux fois sur la fiche.

⚠ `room_types.base_price_ar` est `NOT NULL` : **une chambre sans prix ne
s'insère pas**, elle est écartée plutôt que dotée d'un tarif inventé.

⚠ Republier un site six mois plus tard **remplace** les types de chambre de même
nom au lieu de les empiler — sinon la fiche accumulerait les grilles.

⚠ Relire un site **inchangé** ne produit rien : l'empreinte porte sur le
contenu, pas sur l'adresse. Le bot le dit au journal et passe au suivant.

---

## Le rapprochement — le point où une erreur ne se rattrape pas

Poser une photo, un numéro ou une carte sur la **mauvaise fiche** est pire que
ne rien poser : personne ne vient corriger. Trois garde-fous, tous payés cher
ailleurs dans ce projet.

### ① On ne compare que les mots distinctifs

Comparer « Restaurant Sakamanga » à l'annuaire, en similarité brute, rend une
fiche nommée **« restaurant »** tout court à 0,52 — plus haut que le vrai
Sakamanga. Les mots de catégorie (restaurant, hôtel, lodge, chez…) ne peuvent
donc jamais, à eux seuls, rapprocher deux fiches.

Même chose pour les génériques géographiques. « Nosy » est commun à Nosy Be,
Nosy Komba, Nosy Iranja, Nosy Mitsio, Nosy Sakatia, Nosy Tanikely et Nosy
Boraha : c'est exactement le mot qui avait rangé **six îles distinctes** sous
Nosy Be lors de l'import des photos d'archive (`scripts/photos_archives.py`).

Mesuré sur l'annuaire réel :

| Comparaison | Note | Effet |
|---|---|---|
| Restaurant Sakamanga ~ « restaurant » | **0,00** | écarté |
| Restaurant Sakamanga ~ Sakamanga | 0,87 | rattaché |
| Restaurant Sakamanga ~ Restaurant Sak'Malao | **0,00** | écarté |
| Chez Mariette ~ La Table de Mariette | 0,53 | **proposé, pas rattaché** |
| Nosy Be ~ Nosy Boraha | **0,00** | écarté |
| Mad'Zebu ~ Mad Zébu | 1,00 | rattaché |

### ② La liste des mots « génériques » est volontairement courte

Elle a l'air anodine, elle ne l'est pas — **dans les deux sens**. Avec « table »
déclaré générique, « Chez Mariette » et « La Table de Mariette » ne partageaient
plus que *Mariette* et montaient à **0,86** : assez pour un rattachement
automatique sur le mauvais établissement. N'y mettre que des mots de catégorie.

### ③ En dessous du seuil, le bot ne choisit pas

Rattachement automatique seulement **au-dessus de 0,78 ET sur un lieu
concordant**. En dessous, les candidats sont rangés sans être choisis, et le
panneau affiche pour chacun : la note, le lieu, et **son état** (a une photo ?
un numéro ? une carte ?). C'est vous qui tranchez, en connaissance de cause.

Les deux seuils sont réglables. Monter le seuil automatique au-dessus de 0,85
rend le bot plus prudent — et vous donne plus à trancher.

### Le référentiel local

Le rapprochement se fait **hors ligne**, sur un cache rechargé toutes les
12 heures (3 356 fiches, 18 334 lieux, 255 orthographes de plats — 10 secondes
de chargement). Il est lu **par tranches de 4 000 lignes** : un cache tronqué ne
rate pas bruyamment, il fait croire qu'une fiche n'existe pas et le bot en crée
un doublon.

---

## Ce que le bot écrit sur Diako, et comment

**Pas par le formulaire du site.** Le bot n'ouvre jamais `/publier` et ne se
connecte pas au compte Diako dans un navigateur. Il écrit directement :

```
  Photos ─► 1600 px q86 (Pillow, EXIF redressé)
          ─► POST diako.fonenako.mg/api/o2upload.php   (en-tête X-API-Key)
             pacing 3 s · journal de reprise · le serveur fabrique 480/960/1600
          ─► renvoie une URL publique par photo

  Fiche  ─► SQL sur public.pages / menu_items / events / posts
          ─► API Management Supabase (Authorization: Bearer <jeton>)
```

### La règle qui gouverne tout : on n'écrase pas

Les 3 356 fiches viennent d'imports (OSM, office du tourisme du Lac Itasy,
Wikivoyage) ; certaines portent déjà un téléphone ou une description soignée.
Une écriture de bot qui remplace une donnée humaine est une perte silencieuse.
Toutes les colonnes passent donc par `coalesce(existant, nouveau)` :

| Colonne | Règle |
|---|---|
| `phone`, `whatsapp`, `email`, `website`, `facebook`, `address`, `landmark` | remplie **seulement si vide** |
| `short_desc` | remplacée seulement si elle fait **moins de 20 caractères** (le seuil du barème de complétude, migration 0040) |
| `long_desc` | idem, en dessous de 80 caractères |
| `cover_url` | posée **seulement s'il n'y en a pas** |
| `gallery` | **s'allonge**, sans jamais reprendre une URL déjà présente |
| `categories` | **s'ajoutent** — un hôtel qui se révèle aussi restaurant doit sortir dans les deux recherches |
| `source` | s'**ajoute** à la provenance d'origine, elle ne la remplace pas |
| `price_min_ar`, `verification_status`, `rating_*` | **jamais touchées** — elles sont dérivées et gelées par déclencheur |

### Le prix ne voyage jamais seul

Montant **+ unité + date de relevé**, toujours ensemble. La date vient de l'âge
de la publication Facebook (`releve_le` sur `menu_items` et `room_types`,
`price_on` sur `posts`). Un tarif sans date ment dès qu'il vieillit.

La base l'impose d'ailleurs : `posts_prix_complet` refuse un montant sans unité.
Quand l'unité n'a pas pu être lue, **le prix n'est pas publié** — le montant
reste visible dans le bot, avec un avertissement au journal. On ne devine pas
« par personne ».

### L'attribution

- `pages.source` et `events.source` reçoivent
  `Facebook · <auteur> · <permalien> · relevé le JJ/MM/AAAA`, dans la même forme
  que les sources déjà en base (`Wikivoyage (CC BY-SA) · https://…`).
- Chaque **récit** publié porte en pied « Vu sur Facebook — *nom de l'auteur*,
  le *date* ».
- `events.poster_credit` / `poster_licence` / `poster_source` sont remplis :
  une affiche sans attribution n'est pas une image gratuite.
- `pages.facebook` reçoit l'adresse de la page source — c'est à la fois une
  donnée utile et l'attribution. Elle est **vide sur les 3 356 fiches**
  aujourd'hui.

### Les récits ne recopient pas

Republier tel quel le texte d'un membre d'un groupe sous le compte Diako, ce
serait se l'approprier. Le modèle **réécrit** en 3 à 6 phrases, à la première
personne du pluriel, à partir des seuls faits de la publication. Sans modèle, le
texte de secours cite entre guillemets et nomme l'auteur — jamais de prose
inventée.

---

## Le score — « est-ce que ça comble un trou ? »

Chaque trouvaille reçoit une note sur 100. Le barème **change selon le genre** :
ce qui compte pour un événement (sa date) n'a aucun sens pour une carte (ses
plats).

Le poste **apport** compte aussi les **tarifs de chambre** : apporter les
premiers prix d'un hôtel qui n'en a aucun vaut autant que sa première carte —
1 442 hôtels sont dans ce cas.

| Poste | établissement | carte | événement | récit |
|---|---|---|---|---|
| lieu du référentiel | 15 | 10 | 15 | 25 |
| fiche rattachée | 15 | 20 | — | — |
| photos | 20 | 10 | 20 | 30 |
| **apport** | **25** | **30** | **20** | **20** |
| prix / plats / date / texte | 10 | 25 | 25+15 | 20 |
| contact | 10 | — | — | — |
| fiabilité de lecture | 5 | 5 | 5 | 5 |

Le poste **apport** est le seul qui regarde l'**état réel de la fiche visée** :
apporter la **première photo** d'une fiche qui n'en a aucune, ou la **première
carte** d'un restaurant qui n'en a pas, vaut beaucoup plus qu'une photo de plus
sur une fiche déjà complète.

Malus : une carte sans fiche est plafonnée à 30 (elle n'a nulle part où aller) ;
un établissement sans lieu perd 10 points (il n'apparaîtrait dans aucune
recherche) ; un rapprochement sous 70 % est signalé en toutes lettres.

---

## La lecture par l'IA — optionnelle pour le texte, décisive pour les cartes

Le bot lit d'abord par **règles** (expressions régulières). C'est fiable sur le
mécanique : numéro malgache, montant avec devise, dates, mots-clés. Deux choses
lui échappent :

**① Le texte libre.** « On a fini la soirée chez Mariette, la crevette au coco
valait largement les 18 000 » — aucune expression régulière n'en sort un
établissement, un plat et un prix.

**② Les cartes photographiées, et c'est le trou le plus large.** À Madagascar,
une carte de restaurant se publie en **photo**, presque jamais tapée. Diako a
4 lignes de carte pour 1 862 restaurants. Sans lecture d'image, ce trou ne se
comblera pas. C'est le seul endroit où le modèle n'est pas un bonus mais la
condition de la récolte.

La lecture d'image ne part **pas** à chaque publication : seulement si le texte
parle de carte ou de menu, ou si l'établissement est un restaurant — et
seulement quand les règles n'ont pas déjà trouvé au moins trois plats chiffrés.
Deux images au maximum par appel : une carte tient presque toujours en un ou
deux clichés, les suivants sont des photos de plats.

Le bouton *Lire la carte sur les photos*, dans le panneau, permet de la
déclencher à la main sur une trouvaille déjà collectée.

### Les deux chemins

- **Passerelle locale** (`claude-abo` via le LiteLLM d'Hermes) : coût marginal
  nul, mais c'est un service maison qui tombe parfois.
- **API Claude, Sonnet 5** : payante mais stable, avec mise en cache du prompt
  système. Clé lue dans `~/.diako-secrets/anthropic_key.txt` (ou, à défaut,
  celle de Fonenako).

Si le modèle ne répond pas, la collecte continue sans lui : la trouvaille est
simplement marquée non relue.

---

## Ce qui a été éprouvé avant la première publication

**Rien n'a été publié pour tester.** Les deux moitiés ont été vérifiées
séparément, le 23/08/2026 :

- **Les cinq chemins d'écriture** (créer une fiche, compléter une fiche, poser
  une carte, créer un événement, publier un récit) ont été joués **contre la
  vraie base**, dans un bloc dont l'exception finale annule tout. Compte de
  `posts` avant et après : 29 et 29. `menu_items` : 4 et 4.

  Cet essai a trouvé un vrai défaut : `posts.price_unit` **refuse « plat »** (il
  veut « portion »), là où `pages.price_min_unit` l'accepte, et
  `menu_items.price_unit` refuse « personne ». Trois tables, trois vocabulaires.
  Sans cet essai, la première publication de récit aurait échoué en production.

- **L'envoi de photo** : une image envoyée sur o2switch, relue publiquement
  (`200 image/jpeg`), puis supprimée. Après suppression, l'URL rend
  `200 text/html` — le piège connu de cet hébergeur : un fichier absent ne rend
  pas 404, il faut **tester le type de contenu**, jamais le code.

- **Le rapprochement** a été mesuré contre les 3 356 fiches réelles (tableau
  ci-dessus), et le référentiel chargé en entier (10,5 s).

- **La lecture du web** a été essayée sur deux vrais sites d'hôtels malgaches
  (`campcatta.com`, `zomatel-madagascar.com`). C'est cet essai qui a trouvé le
  piège du `sitemenu.htm` et la détection des sites en JavaScript.

- **L'écriture des chambres** a été jouée contre la vraie base, transaction
  annulée : quatre lignes en entrée → 2 `room_types` (les deux saisons du même
  bungalow fondues) + 2 `season_rates`, la chambre sans prix écartée.
  `room_types` avant et après : 35 et 35.

Ce qui **n'a pas** été éprouvé : la publication réelle. Publiez **une seule
trouvaille** avant d'en lancer une série.

---

## Prudence volontaire

- **Les pauses sont lentes exprès** (2,5 à 5 s entre défilements, 25 à 60 s
  entre sources). Facebook n'aime pas les parcours automatiques : les raccourcir
  expose le compte à une limitation. Utilisez de préférence un compte dédié à la
  veille, pas votre compte principal.
- Le navigateur reste **visible** par défaut : le mode invisible est beaucoup
  plus facile à repérer.
- Ne collectez que dans des groupes dont vous êtes **membre**.
- La collecte lance un vrai navigateur : prévoyez **1 Go de RAM libre**.
- Ces contenus viennent de tiers. On les reprend **avec attribution** ; si un
  auteur demande le retrait, on retire.

## Ce qui casse un jour ou l'autre

Facebook change son HTML sans prévenir. Le jour où la collecte ne ramène plus
rien alors que la session est bonne, ce sont les sélecteurs de
`bot/collecteur.py` (`JS_EXTRAIRE_FIL`, `JS_DEPLIER`) qu'il faut reprendre.

**C'est déjà arrivé, le 22/08/2026**, sur le bot immobilier : `div[role="article"]`
ne désigne plus une publication — seulement les **commentaires**. Le marqueur
qui tient est `aria-posinset`, avec `role="feed" > div` puis `role="article"` en
replis. Ces trois sélecteurs sont repris ici tels quels.

Deux outils sont là pour ça, à lancer **avant** de toucher au code :

```bash
python outils/diagnostic_fb.py      # que voit-on dans le fil, étape par étape ?
python outils/sonde_structure.py    # quel conteneur DOM = une publication ?
```

---

## Organisation des fichiers

```
bot-diako/
├── DEMARRER.bat          double-clic
├── demarrer.py           point d'entrée
├── bot/
│   ├── config.py         réglages + chemins des secrets
│   ├── base.py           base SQLite locale (+ cache du référentiel)
│   ├── diako.py          Supabase : référentiel, rapprochement, « ce qui manque »
│   ├── toile.py          le web ouvert : trouver les sites, les lire, robots.txt
│   ├── extraction.py     texte d'une publication ou d'un site → champs
│   ├── analyse_llm.py    relecture du texte + lecture des cartes en photo
│   ├── redaction.py      textes publiés, fabriqués de façon déterministe
│   ├── score.py          note sur 100, barème par genre
│   ├── automate.py       ce qui se fait tout seul : tri, ménage, plafonds
│   ├── collecteur.py     pilotage du navigateur
│   ├── publication.py    o2switch + écritures SQL
│   ├── planificateur.py  collectes de 11 h et 18 h
│   └── serveur.py        API + interface
├── web/                  interface (HTML/CSS/JS, sans dépendance)
├── outils/               diagnostic Facebook, tâche planifiée
└── data/                 ignoré par git
    ├── bot.db            base + cache du référentiel
    ├── config.json       réglages
    ├── profil-fb/        session Facebook
    └── trouvailles/<date>/<id>/
        ├── capture.png       capture de la publication
        ├── photo01.jpg…      photos
        ├── publication.txt   texte d'origine
        └── trouvaille.json   champs extraits
```

## Secrets

**Le dépôt `parpaing25/diako` est public.** Rien n'est stocké dans l'arbre. Le
bot lit à l'exécution :

| Fichier | Sert à |
|---|---|
| `~/.diako-secrets/env_diako.txt` → `O2SWITCH_UPLOAD_API_KEY` | envoi des photos |
| `~/.diako-secrets/supabase_token.txt`, à défaut `~/.fonenako-secrets/supabase_token.txt` | écritures en base |
| `~/.diako-secrets/anthropic_key.txt`, à défaut celle de Fonenako | API Claude (optionnel) |

⚠ **La clé d'envoi de Diako n'est pas celle de Fonenako** : les deux sites
tournent chez le même hébergeur et exposent le même script, mais leurs clés
diffèrent. Se tromper rend `Unauthorized`, un message qui laisse croire à un
problème d'en-tête alors que la requête est parfaite.

En revanche, le **jeton Supabase est celui du compte**, pas du projet : celui
déjà posé pour Fonenako ouvre aussi Diako (vérifié le 23/08/2026). Un fichier
propre à Diako reste préférable, pour qu'une révocation d'un côté ne casse pas
l'autre.

Si un secret manque, la publication s'arrête avec un message clair ; la
collecte, elle, continue de fonctionner.
