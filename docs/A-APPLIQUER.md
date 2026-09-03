# État de Diako avant lancement

Mis à jour le 01/09/2026.

## ✅ Nettoyer le fil et le calendrier — FAIT le 03/09/2026 (179 récits masqués, 72 événements dépubliés, 35 sous-genres, 441 trouvailles requalifiées)

Décision d'Andry du 03/09/2026 : le fil porte le vécu des voyageurs, le
calendrier porte les événements malgaches qui ont un lieu, et ce qu'un
établissement dit de lui pour vendre (offres, menus de fête, vœux) nourrit sa
fiche — jamais le fil. Le bot classe désormais ainsi (`bot-diako/bot/extraction.py`,
`classer_avec_motif`, 17 tests dans `tests/test_classement.py`).

Rejoué à blanc sur la base du bot le 03/09 (`python outils/reclasser.py`) :
**253 publications en ligne** n'ont pas leur place —

| Ce qui est en ligne | Combien | Ce qui sera fait |
|---|---|---|
| publicités d'établissement réécrites en récits (« Vos cours de tennis au Carlton », « FLASH PROMO -30 % ») | 163 | récit masqué (`posts.status = 'hidden'`), trouvaille requalifiée en fiche à trier |
| voyages organisés d'agence publiés comme événements (« Voyage organisé Tana - Tuléar (8 jours) ») | 69 | événement dépublié (`is_published = false`), trouvaille requalifiée en fiche à trier |
| hors sujet (bijouterie, vente, offre sans information) | 15 | récit masqué, trouvaille rejetée |
| programmes d'excursion lus comme des cartes | 4 | événement dépublié |
| récits dont le sous-genre change (assiette, avis…) | 35 | `posts.kind` mis à jour |

**Rien n'est supprimé** : un récit masqué se remontre par un `UPDATE`, un
événement dépublié aussi.

Le classificateur de sécurité a refusé cette écriture depuis une session
Claude. À lancer à la main, depuis `Diako\bot-diako` :

```
python outils/reclasser.py               # à blanc : montre la liste
python outils/reclasser.py --ecrire --site
```

La commande écrit au nom du compte Diako (voir la section précédente), relit ce
qu'elle a écrit, et le journal du bot en garde la trace.

## ⏳ Second passage du nettoyage — 36 annonces en malgache et en anglais, UNE commande

Après le premier nettoyage (03/09/2026), 248 récits restaient en ligne. En les
relisant : 18 étaient encore des annonces, en malgache (« Manankery … ity
tolotra ity », « misokatra foana izahay », « zahay mandray vahiny ») ou en
anglais (« Escape to the paradise of Nosy Sakatia… book now »), plus des ventes
d'objets (matelas à louer, blender, tapis, vêtements d'enfants, sono). Le
vocabulaire d'`est_une_offre` était tout français, et « izahay » (nous)
comptait comme un vécu alors qu'un établissement dit « nous » autant qu'un
voyageur.

Corrigé dans `bot-diako/bot/extraction.py` (7 tests de plus, 137 au total),
rejoué à blanc : **36 publications en ligne** à masquer —

| Ce qui est en ligne | Combien | Ce qui sera fait |
|---|---|---|
| annonces d'établissement en malgache ou en anglais, réécrites en récits | 28 | récit masqué, trouvaille requalifiée en fiche à trier |
| ventes d'objets et services hors sujet (matelas, blender, tapis, vêtements, sono) | 8 | récit masqué, trouvaille rejetée |

Le classificateur a refusé cette écriture depuis la session (deux fois). Depuis
`Diakoot-diako` :

```
python outils/reclasser.py               # à blanc : la liste des 36
python outils/reclasser.py --ecrire --site
```

## ⏳ 333 fiches créées par le bot sont INVISIBLES — à trancher, puis SQL

Trouvé par l'audit du bot du 02/09/2026. Le déclencheur `pages_avant_ecriture`
force `is_published := false` à toute insertion faite hors d'un compte
administrateur ; sous l'API Management, `auth.uid()` est vide, donc
`is_admin()` est faux. **Les 333 fiches d'établissement créées par le bot
depuis le 23/08 ont toutes `is_published = false`** : le bot annonçait
« Publiée sur Diako », le site ne les montre pas. Les événements (118) et les
récits (418) ne sont pas concernés.

Le bot est corrigé : chaque lot d'écriture commence désormais par
`set_config('request.jwt.claims', …)` avec le compte `contact.diako@gmail.com`
(`284aa922-…`), ce qui rend `is_admin()` vrai le temps de la transaction
(vérifié le 02/09 : `auth.uid()` = le compte, `is_admin()` = true). Et la
publication relit la ligne écrite et signale en erreur un `is_published` resté
à false.

**Avant de publier les 333 en bloc, une décision :** 76 d'entre elles
ressemblent (similarité ≥ 0,6 sur le nom normalisé) à une fiche déjà publiée
— le rapprochement était passé sous le seuil et la fiche a été créée à côté
(« Shain Lodge » / « SHAIN LODGE », par exemple). 38 n'ont aucun contact.
Publier tel quel mettrait des doublons dans l'annuaire.

```sql
-- 1. Voir les 333, doublons probables en tête
select n.id, n.name, n.slug, n.created_at::date,
       (select e.slug from pages e where e.is_published and e.id <> n.id
          and e.norm % n.norm and similarity(e.norm, n.norm) >= 0.6
          order by similarity(e.norm, n.norm) desc limit 1) as ressemble_a
  from pages n
 where n.source like 'Facebook ·%' and not n.is_published
 order by ressemble_a nulls last, n.name;

-- 2. Publier celles qui n'ont PAS de sosie (257), au nom du compte Diako
select set_config('request.jwt.claims',
  '{"sub":"284aa922-edf6-4773-bcee-c4f7cc074d67","role":"authenticated"}', true);
update pages n set is_published = true
 where n.source like 'Facebook ·%' and not n.is_published
   and not exists (select 1 from pages e where e.is_published and e.id <> n.id
                     and e.norm % n.norm and similarity(e.norm, n.norm) >= 0.6);

-- 3. Les 76 sosies : fusionner à la main (photos, contact) puis supprimer,
--    ou publier si ce sont bien deux établissements distincts.
```

Le `set_config` et l'`update` doivent être dans la **même** exécution (une
seule requête dans l'éditeur SQL) : la revendication est locale à la
transaction.

## ⏳ Nettoyage des sites web écrits par le bot — à exécuter dans l'éditeur SQL

Trouvé par l'audit du bot de collecte du 02/09/2026. Le classificateur a refusé
l'écriture depuis la session : **à passer par l'éditeur SQL Supabase** (ou par
le connecteur après accord, comme 0115 et 0117).

- **23 fiches portent `https://gmail.com` comme site web**, toutes écrites par
  le bot depuis une publication Facebook (« contact : xxx@gmail.com » lu comme
  une adresse de site). Le garde-fou n'existait que dans la moisson des sites
  (`toile.py`), pas dans l'extraction Facebook ni à la publication — corrigé
  dans le bot le 02/09, mais les 23 lignes déjà en ligne restent.
- **5 fiches portent un balisage Wikivoyage dans l'adresse** :
  `http://www.renala.mg {{dead link|December 2020}}`. Elles viennent de
  l'import, pas du bot ; le bot lisait ces adresses telles quelles.

```sql
-- Contrôle avant : 23 et 5 attendus
select count(*) from pages where website = 'https://gmail.com';
select count(*) from pages where website like '%{{dead link%';

update pages set website = null where website = 'https://gmail.com';
update pages
   set website = regexp_replace(website, '\s*\{\{[^}]*\}\}\s*$', '')
 where website like '%{{dead link%';

-- Contrôle après : 0 et 0
select count(*) from pages where website = 'https://gmail.com';
select count(*) from pages where website like '%{{%';
```

Les 23 identifiants concernés (pour retour arrière) : Étoile Blanche Hotel,
FRANCO MALGACHE TOURS, Frederico Walker, Hotel Mahamasina, Hotel Soalia
Antsirabe, ID Dream Tours, Izzy Car Rental, Jet Ski Nosy Be, L'Arôme Lodge,
Le Corto Maltèse, Lemuria Land Park, Léonard Tour, Madiro Hôtel, Madjid English
Guide, Nosy - Be Record Excursion, Nosy Be Tour, Nosy-Be SIDO TOURS, Shain
Lodge, SHAIN LODGE, SylKomba, Taj Hôtel, TL Rent Car, VITAIGNY CATAMARAN.

À noter, hors périmètre du bot : **19 fiches de l'import OSM/Wikivoyage ont une
adresse `facebook.com` dans `website`** au lieu de `facebook`. Rien de cassé,
mais la colonne ne dit pas ce qu'elle annonce.

## ✅ `0117_destinations_emblematiques.sql` — appliquée le 01/09/2026

Écrite avec la refonte de l'écran Destinations, refusée une première fois par
le classificateur, **appliquée par le connecteur après l'accord d'Andry**
(« applique 0117 ») — le même appel passe une fois l'accord donné, comme sur
0115. Les trois assertions ont validé, dont le chronométrage sous `role anon`
+ `statement_timeout 3s`. Vérifié de l'extérieur à la clé anon : la RPC rend
61 éléments sur les 5 familles, et `stats_diako.destinations` dit 61 (contre
508 avant, dont 430 villages, hameaux et quartiers).

Le repli client de `src/lib/destinations.ts` (lecture directe de `places`
pendant que la fonction n'existait pas) s'est débranché tout seul — il reste
en place comme filet. `types.ts` régénéré dans la foulée : la régénération a
produit, comme leurs commentaires l'annonçaient, les entrées écrites à la main
pour 0114/0115, plus `destinations_emblematiques`, `fil_cats_du_theme` et
`post_du_theme`.

## ✅ Les dix-huit migrations sont appliquées

`0096` → `0113`, chacune vérifiée par son assertion finale. Le connecteur
Supabase est rebranché ; la CLI reste inutilisable
(`permission denied to alter role cli_login_postgres`), donc **les migrations
passent par le connecteur, jamais par `supabase db push`**.

**Quatre ont refusé de passer, et avaient raison.** C'est le meilleur argument
pour cette discipline d'assertions :

- **0098** — `authenticated` gardait `insert` et `update` sur
  `photo_propositions` par privilèges par défaut. Un membre connecté aurait pu
  insérer une photo **déjà marquée « approuvée »** sur n'importe quelle fiche du
  référentiel, sans passer par la modération, en une seule requête.
- **0103** — écrite pour un symptôme minuscule (« la photo du compte ne change
  pas »), elle a mis au jour que **le profil ne se chargeait plus du tout pour
  aucun membre connecté** : une colonne sans droit de lecture faisait refuser la
  requête entière.
- **0106** — `unaccent` n'est pas dans `public` sur Supabase mais dans
  `extensions` ; sans le `search_path` élargi, la recherche par nom n'aurait
  jamais démarré.
- **0113** — la sonde d'écriture a échoué et avait raison de le faire :
  `pages_avant_ecriture()` **gèle** `is_published` pour toute écriture directe.
  La sonde ne mesurait pas ce qu'elle croyait.

## Trois gestes qui ne passent pas par une migration

1. **Le tableau de bord Supabase** — les cinq gabarits d'e-mail en français, la
   protection contre les mots de passe divulgués, la mise à jour de Postgres.

2. **Le récit de test en tête du fil.** Il porte une photo de **Bora Bora**
   (Polynésie française) sous l'étiquette « Nosy Be », avec le texte « Bora Bora,
   l'île paradisiaque par excellence », publié le 17/08. C'est le seul contenu
   hors sujet du fil — vérifié, les 28 autres récits sont bien malgaches. Sur un
   site dont la promesse est « Madagascar raconté par ceux qui y vont », c'est la
   première chose que voit un visiteur. À retirer depuis `/admin` →
   Publications. C'est ton contenu, donc ta décision.

3. **Le limiteur d'o2switch.** Tiger Protect répond **429 sur la totalité des
   assets** après une rafale depuis une seule adresse IP — page entièrement
   blanche, sans message. Sur les réseaux mobiles malgaches, des milliers
   d'abonnés partagent une poignée d'adresses publiques : vu du limiteur, un
   lancement réussi ressemble à une attaque. À relever depuis cPanel **avant**
   d'annoncer le site.

## La liste de lancement

| Item | État |
|---|---|
| 1. La carte ne sort pas | ✅ morceau différé + cache empoisonné, avec rattrapage |
| 2. Photos du fil lentes | ✅ 147 régénérées + `srcset` réel |
| 3. Recherche hors du rail | ✅ |
| 4. Paramètres hors du rail | ✅ |
| 5. Destinations empilées | ✅ cinq bandes repliées, 1 image au lieu de 23 |
| 6. Photos des plats | ✅ 33 sur 95 — les 62 autres gardent une case vide, faute de photo sûre |
| 7. Espace pro | ✅ suggestions à la frappe (anti-doublon) + aperçu public |
| 8. Circuits modernisés | ✅ traité autrement : il n'y a **aucun circuit ni agence** en base, et la pastille « Circuits » de l'accueil promettait le contraire — elle a été retirée, avec Agences, Guides et Bons plans |
| 9. Photos cliquables + propositions | ✅ visionneuse plein écran + bouton sur destinations et plats |
| 10. Page admin | ✅ `/admin`, entrée visible pour l'administrateur seul |
| 11. Événements | ✅ 14 affiches, cartes dépliables, lieu cliquable — et les 28 sans photo disent pourquoi |
| 12. Y aller — planificateur | ✅ 1 642 paires sur 1 806 |

**Un ajout qui débloquerait 82 paires du planificateur** : une ligne dans
`place_access` pour Antananarivo → Ankify.

## Ce que le site sait, en chiffres vérifiés

508 destinations · 2 451 sites et parcs · 95 plats (254 orthographes) ·
3 254 établissements · 42 événements dont 18 rattachés à une destination ·
42 tronçons de route relevés.

## Trois scripts de contrôle, à lancer avant d'annoncer

```
python scripts/verifier_contrat_client_base.py   # le client demande-t-il ce qui existe ?
bash ~/.deploy-sites/redeploy.sh diako
python scripts/verifier_deploiement.py           # le déploiement a-t-il vraiment abouti ?
```

Le premier a trouvé un compteur qui affichait 0 au lieu de 254. Le second existe
parce que `redeploy.sh` a déjà annoncé « terminé » après un envoi FTP expiré, en
laissant la production sur le build précédent — invisible, puisque le site
continuait de fonctionner avec l'ancien.

## ✅ Le chantier reporté est fait

`src/integrations/supabase/types.ts` est désormais **généré** par le connecteur.
Les 35 erreurs de compilation qu'entraînait la régénération sont corrigées : le
générateur déclare les arguments à défaut optionnels et non nullables, là où le
code passait `null` explicitement. Corrigé en omettant l'argument — après avoir
vérifié, un par un, que les **53** arguments concernés ont bien `DEFAULT NULL` en
base. Aucun comportement ne change.

La redéclaration locale du schéma dans `src/lib/admin.ts` a disparu avec, comme
son auteur l'avait annoncé. Il ne reste **qu'un** resserrement de type dans tout
le code, et il est documenté : `photo_propositions.cible_type` est contraint à
quatre valeurs par un `check` que le générateur ne peut pas lire.

**À refaire après toute migration** qui touche une table, une vue ou une
fonction : connecteur → `generate_typescript_types`, puis `npm run build`.

## Deux constats qui ne sont pas des bugs

- **« Où manger du ravitoto »** — que le code décrit comme la promesse centrale
  du produit — ne peut rien rendre aujourd'hui : il n'y a que **4 plats sur des
  cartes de restaurant**, et aucun n'est rattaché au référentiel des plats.
- **Aucune agence, aucun circuit, aucun guide** n'est publié. Les pastilles qui
  les annonçaient ont été retirées de l'accueil.
