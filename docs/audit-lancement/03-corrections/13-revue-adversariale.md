# 13 — La revue adversariale du 06/09/2026 : ce qu'elle a trouvé dans les corrections elles-mêmes

Les douze fiches précédentes corrigent ce que l'audit avait vu. Celle-ci corrige ce que **l'audit avait cassé ou manqué** — parce qu'une correction non relue est une supposition de plus.

## Comment elle a été conduite

| Étage | Ce qui a tourné |
|---|---|
| Recherche | 12 dimensions (concurrence, accessibilité réelle, cache, CORS, SQL, mobile 360 px, robots, RGPD, service worker, images, état React, aperçus de partage), plusieurs agents par dimension |
| Réfutation | **trois** réfuteurs par constat, chacun avec une consigne différente (correction, sécurité, reproduction), tous chargés de **démolir** le constat plutôt que de le confirmer |
| Verdict | un constat survit s'il résiste à la majorité |

138 agents, 13,9 millions de jetons, 72 minutes. **59 constats → 25 confirmés (6 bloquants), 17 écartés**, le reste sans verdict exploitable.

⚠ Le résultat JSON a été tronqué dans la notification et absent du fichier de sortie : le rapprochement « constat → trois verdicts » a été refait depuis les transcriptions des agents (`croiser_verdicts.py`), en repartant du prompt de chaque réfuteur, qui porte le titre du constat jugé.

## Les six bloquants

| # | Où | Ce qui se passait | Correctif |
|---|---|---|---|
| 1 | `0120…sql` | `noter_vue` plafonnait sur `p_sid`, **choisi par le client** : un identifiant neuf à chaque appel gonflait les vues d'une fiche sans limite. C'est exactement l'abus que 0120 disait fermer, et son contrôle n'appelait la fonction qu'**une** fois. | **0121→0124** : trois plafonds par minute, dont deux hors de portée de l'appelant — 120 par chemin, 600 par adresse lue dans `request.headers`, 60 par session. Le contrôle **essaie l'abus** (200 appels, même fiche, 200 sessions) et exige 120. |
| 2 | `Feed.tsx` | Le refus « un chargement est déjà en vol » était posé **avant** l'incrément de version : changer d'onglet pendant un chargement jetait le clic en silence et affichait les publications de l'onglet **précédent** sous le nouveau libellé. Le garde de concurrence écrit la veille était du code mort. | La version bouge d'abord, ce qui invalide la réponse en vol ; seule la **pagination** est refusée pendant un chargement. |
| 3 | `Evenements.tsx` | `useReveal` recevait la liste **chargée**, alors que le rendu affiche une **tranche**. Les 24 cartes ajoutées par « Voir plus » restaient à `opacity: 0` : **64 des 88 événements publiés étaient inatteignables**, sans la moindre erreur. Introduit la veille, par la correction « /evenements par 24 ». | `useReveal(rendus)` sur la tranche rendue. Vérifié en production : 48 cartes sur 48 visibles après le clic. |
| 4 | `.htaccess` | La CSP posée la veille déclarait `frame-src https://challenges.cloudflare.com` **sans `'self'`** : une directive nouvelle annule le repli sur `default-src`, donc l'aperçu « Ce que voit le voyageur » de la console pro était mort. | `frame-src 'self' https://challenges.cloudflare.com`. Vérifié en ligne. |
| 5 | `sw.js` | Le gestionnaire `activate` effaçait le cache `dk-partage` : un déploiement pendant un partage Android perdait texte et photos. | Déjà corrigé dans le lot précédent (constante `PARTAGE` exclue du nettoyage) — la revue l'a retrouvé, ce qui valide au passage sa capacité à voir ce genre de défaut. |
| 6 | `supprimer-mon-compte` | La liste d'en-têtes CORS était figée et omettait `x-client-info`, que `supabase-js` envoie à chaque appel : **le navigateur bloquait le bouton avant tout appel**. Le test de la veille passait parce qu'il était fait en `curl`, qui n'applique pas le CORS. | Les en-têtes demandés sont renvoyés tels quels, plus `Access-Control-Max-Age`. Préambule vérifié en ligne. |

## Les dix-huit autres, corrigés

`Recherche.tsx` (même défaut de révélation qu'`/evenements`, au retour de « Toute la recherche ») · `ImageProgressive` (six appelants sans `largeurAffichee` → aucun `srcSet`, donc l'original téléchargé ; et la vignette floutée sans `loading="lazy"`) · `Carrousel` (le compteur « 2/5 » caché sous la barre de puces) · `Header` (les boîtes de 44 px écrasaient le champ de recherche) · `Publier` (limite d'une vidéo lue sur un état React figé ; partage Android partiel annoncé complet) · `.htaccess` (`app-init.js` servi *immutable* un an ; la règle d'aperçu robot ne protégeait pas les fichiers réels) · `Auth` (« mot de passe oublié » annonçait toujours le succès, sans jeton captcha) · `api.ts` (`mesFavoris` fabriquait `ma_reaction: null` — toucher sa réaction la supprimait) · `partage.php` (« 178 destinations » servi à Facebook et WhatsApp) · `app-init.js` (le thème du système par-dessus le choix explicite) · `Bienvenue` (drapeau jamais effacé, ville écrasée à NULL) · `sw.js` (nombre de photos écrit avant la boucle) · `chargerPage` (le CSS d'un morceau différé jamais redemandé).

## Le constat écarté à la mesure — et pourquoi c'est important

> « `PostCard.tsx:529` : l'ajout de `min-h-6` fait **rétrécir** la cible tactile de 44 px à 24 px. »

Confirmé par les trois réfuteurs. **Et faux.** `git log -S` montre le bouton « plus » **avant** la correction : `className="ml-1 text-muted-foreground hover:underline"` — un bouton en ligne dans un paragraphe, donc haut comme sa ligne de texte, environ 20 px. Il n'a jamais fait 44 px. La correction l'a **augmenté** à 24 px, ce que le critère 2.5.8 demande précisément pour une cible dans du texte.

Trois juges indépendants peuvent se tromper ensemble quand le constat est plausible. Le « 44 » venait de la règle du projet, pas de l'état d'avant — et personne n'est allé le vérifier. **Remonter à la source vaut aussi contre ses propres relecteurs.**

De la même façon, le constat de l'en-tête annonçait « 8 px de champ utile » : la mesure réelle donne **88 px** hors session et environ **52 px** pour un membre connecté. Le défaut est réel, son ampleur ne l'était pas. Après correctif : **96 px** hors session, mesurés à 360 px.

## Et ce que la revue n'avait PAS vu : le balayage des 23 appelants

Une revue reste un échantillon. Après application du lot 5, chaque appelant de `useReveal` a été relu **un par un**, par un script qui signale ceux qui ont une tranche, une pagination ou des onglets — 23 fichiers, 7 signalés.

Un huitième défaut de la même famille est sorti, et il n'était dans **aucun** des 25 constats : sur `/favoris`, la dépendance était écrite `adresses ?? enregistres ?? aimes`. Cette expression **se fige sur le premier terme non nul** — et `adresses` est l'onglet d'ouverture, qui répond toujours, même vide (`[]` n'est pas `null`). Passer à « Enregistrés » montait donc des `PostCard`, qui portent `.dk-reveal`, **sans relancer l'effet** : `opacity: 0`, écran vide, aucune erreur.

Le symptôme était pire qu'une panne franche : le filet `useRevealFilet` couvre les 6 premières secondes après l'arrivée sur la page, donc l'onglet **marchait quand on cliquait vite** et paraissait vide quand on prenait son temps.

Les six autres pages signalées sont justes : `Explorer`, `Sites` et `Villes` passent bien leur liste rendue (`Villes` porte même le commentaire qui décrit ce piège), `Gouts` passe un tableau littéral — l'effet se rejoue à chaque rendu, coûteux mais sûr — et `Projet` ne révèle rien.

**La leçon**, qui vaut plus que le défaut : après une revue, relire **exhaustivement** la famille de code qu'elle a mise en cause. 138 agents ont trouvé deux occurrences de ce piège ; un script de vingt lignes a trouvé la troisième.

## Ce que la revue a coûté et rapporté

- 4 défauts sur 6 bloquants avaient été **introduits par les corrections de l'audit lui-même**, entre 24 et 48 heures plus tôt.
- Deux d'entre eux étaient **invisibles** : pas d'erreur, pas de journal, un écran simplement vide ou une réponse simplement ignorée.
- Un troisième (le CORS) était **masqué par la façon dont il avait été testé**.

C'est l'argument le plus solide en faveur de la relecture adversariale : elle attrape exactement la classe de défauts qu'une vérification écrite par l'auteur ne peut pas voir, parce que l'auteur teste ce qu'il a voulu faire.

## Suites mesurées après application

| Mesure | Avant le lot 5 | Après |
|---|---|---|
| Poids de l'accueil | 870 Ko | **740 Ko** (images 461 Ko contre 592) |
| LCP accueil (médiane de 3) | 2 076 ms | **2 056 ms** (1 912 / 2 064 / 2 056) |
| Champ de recherche à 360 px | 88 px | **96 px** hors session (+24 px pour un membre connecté) |
| `/evenements`, après « Voir plus » | 24 cartes visibles sur 48 | **48 sur 48** |
| `robots.txt` vu par `facebookexternalhit` | `200 text/html` | **`200 text/plain`** |
| `Cache-Control` d'`app-init.js` | `max-age=31536000, immutable` | **`max-age=3600`** |
| Suite Playwright | 11/15, échecs changeants | **15/15** (un seul ouvrier) |
| Appelants de `useReveal` relus | 2 (ceux des constats) | **23 sur 23**, 1 défaut de plus corrigé |

⚠ La suite de bout en bout tournait avec trois ouvriers en parallèle : elle rendait 4 échecs sur 15, puis 2 **autres** au passage suivant, et 15/15 en séquentiel. Trois Chromium et le serveur de prévisualisation ne tiennent pas dans la mémoire de ce poste. Une suite qui échoue au hasard s'apprend à ignorer : `workers: 1`, pour 41 secondes au lieu d'1 min 20.
