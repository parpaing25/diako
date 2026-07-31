# TDR — DIAKO
## Le réseau social malgache du voyage et du tourisme

**Version 1.0 — 31/07/2026**
Document de référence pour la construction de Diako v3.
Établi à partir d'un audit de 7 analyses parallèles portant sur l'intégralité du code de **fonenako.mg** (303 fichiers TS/TSX, 42 pages, ~45 tables Supabase, 12 edge functions) et du code de **diako.fonenako.mg** (4 643 lignes, dépôt `parpaing25/Diako-V2`), plus une modélisation métier du tourisme malgache.

---

## 0. Résumé pour décision

### 0.1 Ce qu'on construit

Diako est à Fonenako ce que le voyage est à l'immobilier : **le même socle social, un métier complètement différent**. Un Malgache qui veut passer le week-end à Ampefy, un touriste qui prépare un circuit RN7, un Tananarivien qui cherche où manger du ravitoto ce soir — tous ouvrent aujourd'hui Facebook et demandent à leurs amis. Diako remplace cette question par une réponse.

Trois promesses, dans cet ordre :

1. **Un fil infini type Facebook** — récits de voyage, photos, bons plans, promos d'établissements — qui fait revenir les gens entre deux voyages.
2. **Des pages professionnelles** pour hôtels, restaurants et agences de voyage, portant leurs **tarifs réels**, leurs **menus** et leurs **circuits**.
3. **Une recherche qui répond**, pas qui liste : « hôtel à Ampefy » → *12 hébergements, à partir de 45 000 Ar la nuit* ; « où manger du ravitoto » → *8 restaurants à Antananarivo, de 8 000 à 32 000 Ar, avec le prix chez chacun*.

### 0.2 Les 7 décisions structurantes de ce TDR

| # | Décision | Choix retenu | Pourquoi |
|---|---|---|---|
| 1 | Sur quelle base construire | **Fork du code Fonenako** (Vite + React + shadcn + Supabase) | ~70 % des briques sont transposables, dont 100 % du socle social, réseau et performance. Diako-V2 (Firebase + PHP + MySQL) n'a rien de récupérable au-delà de sa coque visuelle. |
| 2 | Base de données | **Nouveau projet Supabase, séparé de Fonenako** | Quota d'egress distinct : un fil infini d'images ne doit jamais pouvoir faire tomber fonenako.mg. |
| 3 | Modèle métier | **PAGE → OFFRE → TARIF** (3 niveaux) + référentiels `places` / `dishes` / `amenities` | Un hôtel n'a pas *un* prix : il a 5 types de chambres × 3 saisons. La table monolithe de Fonenako (90 colonnes) ne peut pas porter ça. |
| 4 | Recherche | **Résolution d'entités + tsvector `unaccent` + `pg_trgm` + un seul RPC** | « ravitoto » doit trouver « Ravitoto sy henakisoa », « ampefi » doit trouver Ampefy. Le `ilike '%x%'` de Fonenako en est structurellement incapable. |
| 5 | Fil | **Pagination par curseur (keyset) + classement serveur** | L'offset de Fonenako a produit 6 bugs documentés. Sur un fil infini, il est disqualifié. |
| 6 | Transaction | **Demande / devis d'abord. Pas de paiement en ligne au lancement.** | Le tissu professionnel malgache n'a pas de calendrier temps réel. La découverte prime sur la réservation. |
| 7 | Monétisation | **Gratuit au lancement**, puis abonnement Page Pro + mise en avant, payés en Mvola / Orange Money / Airtel Money. **Pas de monnaie interne.** | Le système FNK de Fonenako a été écrit puis désactivé par un drapeau : il ajoute de la friction sur un marché à construire. |

### 0.3 Le chiffre qui cadre tout

Le projet frère a produit deux documents d'audit d'egress. Le constat : **17 channels Realtime = ~6 Go/mois de heartbeats sur un quota gratuit de 2 Go**, avant la moindre donnée utile. Fonenako a dû supprimer 19 channels, sortir toutes les photos vers o2switch et réduire son fil de 90 à 43 colonnes pour tenir.

Diako sera **plus visuel et plus bavard** que Fonenako. Les règles ci-dessous ne sont donc pas des optimisations tardives, ce sont des **conditions d'existence** :

- Realtime **uniquement** sur le chat et les notifications. Partout ailleurs, rafraîchissement au focus.
- **Aucune image** ne transite par Supabase Storage. Tout sur o2switch, avec vignettes.
- **Jamais de `select('*')`**. Listes de colonnes explicites, dès le premier jour.
- Pagination par curseur, jamais par offset.

### 0.4 🔴 Urgence sécurité — à traiter avant toute chose

L'audit du Diako en ligne a relevé quatre problèmes actifs en production. Ils ne peuvent pas attendre le Lot 0 :

1. **`https://diako.fonenako.mg/backend/uploads/` liste publiquement son contenu**, scans de **cartes d'identité (CIN)** compris — vérifié en direct, 2 fichiers du 17/07/2026 téléchargeables sans authentification.
2. **`upload.php` accepte l'extension fournie par le client** et se fie à `$_FILES['type']` (contrôlé par l'attaquant). Déposer un `payload.php` en annonçant `image/jpeg` donne une **exécution de code sur le compte o2switch `anfa7857`** — celui qui héberge **aussi fonenako.mg**.
3. **Aucun endpoint PHP n'est authentifié.** `credits.php?action=add` accorde des crédits illimités à n'importe qui, et 1 crédit = 5 Ar théoriquement retirables.
4. Une ligne de test créée pendant l'audit reste en base : `users` où `firebase_uid = '__audit_probe__'` (id 3), à supprimer.

**Action recommandée : supprimer purement et simplement le dossier `backend/` du serveur.** Il est voué à disparaître de toute façon (décision n°1), il n'est plus alimenté par rien de vital, et sa seule présence expose fonenako.mg. Cela prend cinq minutes et supprime les quatre problèmes d'un coup.

### 0.5 Ce que coûte ce projet

| Poste | Montant | Commentaire |
|---|---|---|
| Hébergement web | **0 Ar de plus** | Sous-domaine sur le compte o2switch anfa7857 déjà payé |
| Supabase | **0 $/mois** jusqu'à ~25 000 visites/mois | Puis 25 $/mois (offre Pro) — chiffrage complet au §10.2 |
| Domaine | 0 Ar | `diako.fonenako.mg` existe. Un `.mg` dédié est une option ultérieure |
| Développement | **~16 semaines** | Une personne assistée par IA, du 04/08/2026 au 21/11/2026 |
| Saisie du contenu initial | **~12 jours-homme** | 150 à 300 fiches complètes — le vrai goulot d'étranglement |

Le coût réel de Diako n'est pas technique. **C'est la saisie du contenu.** Une page d'hôtel sans tarif et un restaurant sans carte ne répondent à aucune requête : le produit serait techniquement parfait et commercialement mort.

---

## 1. Contexte, vision, positionnement

### 1.1 Le problème

À Madagascar aujourd'hui, chercher où dormir ou où manger se fait de trois façons, toutes mauvaises :

- **Facebook** : on demande à ses amis, on tombe sur une page d'hôtel dont le dernier post date de 2023 et dont les tarifs sont dans un commentaire. Aucune recherche possible, aucune comparaison.
- **Le bouche-à-oreille** : fiable mais qui ne couvre que ce que connaissent vos proches.
- **TripAdvisor / Booking** : très peu fournis hors Nosy Be et Antananarivo, en anglais ou en français d'Europe, avec des prix en euros et une couverture quasi nulle des établissements malgaches moyens — c'est-à-dire l'immense majorité.

Et pour le professionnel, le symétrique : un hôtelier d'Ampefy n'a **aucun moyen d'exister en ligne** autre qu'une page Facebook qu'il n'alimente pas.

### 1.2 La promesse

> **Diako, c'est là où on trouve où dormir, où manger et avec qui partir à Madagascar — et où on raconte ses voyages.**

Deux moitiés indissociables : l'**annuaire vivant** (les pages, les tarifs, les menus, la recherche) et le **réseau social** (le fil, les récits, les avis). L'annuaire seul est un Pages Jaunes qui meurt de vieillesse. Le réseau seul est un groupe Facebook de plus. Ensemble, le fil garde les gens et alimente les fiches en contenu frais ; les fiches donnent au fil une raison d'être consulté.

### 1.3 Le lien avec Fonenako

Même propriétaire, même hébergeur, même philosophie technique, **et c'est un avantage considérable** : tout ce que Fonenako a appris dans la douleur (egress, LCP mobile, sécurité PII, verrous de boost, chaîne d'images) est déjà écrit et éprouvé en production. Diako n'a pas à réapprendre.

Mais ce sont **deux produits séparés** : deux projets Supabase, deux dépôts, deux marques, deux bases d'utilisateurs. Le seul pont envisageable — et il est optionnel, à décider plus tard — est une connexion croisée (« se connecter avec son compte Fonenako »).

### 1.4 État réel du Diako en ligne (audit du 31/07/2026)

Il faut être direct : **le site en ligne n'est pas une base de départ, c'est un décor.**

| Ce qui existe | Vérité mesurée |
|---|---|
| Fil d'actualité | **Mort.** Il lit Firestore ; l'API Cloud Firestore **n'a jamais été activée** sur le projet Firebase `diako-9f413` (réponse live : `SERVICE_DISABLED`). Le bucket Storage n'existe pas non plus (404). |
| Accueil | **Inaccessible.** `RequireCompleteProfile` verrouille toutes les routes sur deux booléens qui ne vivent qu'en mémoire React : après chaque rechargement, on est renvoyé sur `/settings` en boucle. |
| Barre de recherche | `useState` sans aucun handler. Pas de `onSubmit`, pas de route `/search`, pas de page de résultats. |
| Colonne de droite | 100 % codée en dur : « Nosy Be 1.2k posts », « Festival Donia 15 Déc **2024** », « Hôtel Sakamanga 4.8 (245 avis) ». |
| Messagerie | `conversationId = ${user.id}_general` — une conversation **avec soi-même**. Le commentaire du code l'avoue. |
| Boost / Retrait | Déduisent les crédits et affichent une `alert()`. **Aucun enregistrement nulle part.** L'utilisateur paie pour rien. |
| Paiement mobile money | `payment.php` écrit `status='success'` **en dur**, sans jamais appeler Mvola/Orange/Airtel. |
| Vérification CIN | Enregistrée en `pending` — **aucun outil d'approbation n'existe**, le statut ne changera jamais. |
| Vocabulaire voyage | 61 occurrences dans tout `src/`, essentiellement dans des libellés décoratifs. **Zéro table, zéro route, zéro composant** hôtel/restaurant/agence. |
| Images | 12 chemins `/placeholder-*.jpg` référencés, **aucun n'existe** dans le dépôt → rafale de 404 à chaque rendu. |
| Poids livré | 977 Ko brut, **dont 485 Ko de Firebase** préchargés pour des fonctionnalités qui ne marchent pas. |

**Ce qui est réellement bon et se garde :** la coque visuelle (`AppShell`, `Header`, `BottomNav` avec FAB central, `MobileSideMenu`, les 452 lignes de `index.css` avec jetons turquoise/corail, cibles tactiles 44 px, `font-size: 16px` anti-zoom iOS, safe-area) et la chaîne de déploiement o2switch (brotli confirmé, `base: './'`).

**Ce qui se jette :** Firebase en entier, les 9 endpoints PHP, MySQL, et toute la logique métier.

Note factuelle utile : le dépôt `parpaing25/diako-travel-connect` est l'**ancêtre** de `Diako-V2` et y est **entièrement contenu** (un seul fichier unique : `src/App.css`). Il n'y a rien à en récupérer — l'ancienne note qui prévoyait une fusion des deux est caduque.

### 1.5 Positionnement

Diako n'est ni Booking, ni TripAdvisor, ni Facebook. Positionnement en une ligne :

> **L'annuaire vivant du voyage malgache, alimenté par ceux qui voyagent.**

| Concurrent | Sa force | Notre angle |
|---|---|---|
| **Facebook** | Tout le monde y est | On ne se bat pas contre lui : on l'utilise comme canal d'acquisition (partage WhatsApp/Messenger avec aperçus riches). Notre avantage : **on est cherchable**. |
| **Booking / Airbnb** | Réservation ferme, paiement | Ils couvrent 5 % des établissements malgaches et ignorent 100 % des restaurants. Nous : **la couverture locale et le prix en ariary**. |
| **TripAdvisor** | Avis | Base quasi vide hors grands axes, aucune donnée de menu. Nous : **le plat, le prix, l'horaire**. |
| **Google Maps** | Ubiquité, itinéraires | Fiches pauvres, tarifs absents, pas de circuits, pas de communauté. Nous : **le catalogue et le récit**. |

**Notre vrai fossé défensif** n'est pas la technique — c'est le **référentiel** : ~150 plats malgaches avec leurs variantes orthographiques, ~150 destinations avec leurs alias, leurs saisons et leurs temps de trajet réels. Personne d'autre ne l'a et personne ne peut le copier en une semaine.

---

## 2. Objectifs, périmètre, non-objectifs

### 2.1 Objectifs mesurables

| Échéance | Objectif | Indicateur |
|---|---|---|
| **Fin du Lot 3** (≈ 10/10/2026) | La recherche répond aux 3 requêtes canoniques | « hôtel à Ampefy », « où manger du ravitoto », « circuit 5 jours sud » renvoient une réponse juste |
| **Lancement bêta** (≈ 27/10/2026) | Le produit n'est pas vide | **300 fiches complètes** (tarifs ou menu renseignés), 2 destinations couvertes à 80 % |
| **+3 mois** (fin janvier 2027) | Traction | 3 000 visiteurs uniques/mois · 50 pages pro **réclamées par leur gérant** · 300 posts publiés |
| **+6 mois** (fin avril 2027) | Le fil vit tout seul | 30 % des posts viennent d'utilisateurs non sollicités · 150 pages pro actives · 1 000 comptes |
| **+12 mois** (fin juillet 2027) | Le modèle est prouvé | 30 abonnements pro payants · 10 000 visiteurs/mois · Diako cité comme référence sur au moins une destination |

### 2.2 Périmètre du MVP (livré au lancement bêta)

**Inclus :**
- Compte voyageur (email + OTP, Google), profil, abonnements entre membres
- Fil infini : publier, réagir, commenter, partager, enregistrer
- Pages hôtel / restaurant / agence de voyage avec **tarifs, menu, circuits**
- Recherche unifiée avec **barre de réponse** + filtres + carte
- Pages destination (`/ampefy`, `/nosy-be`…) avec saisonnalité et accès
- Avis notés multi-critères + réponse du professionnel
- Demande de devis / de réservation (mise en relation, **sans paiement**)
- Messagerie voyageur ↔ établissement
- Notifications in-app + push web
- Espace gestionnaire pro (créer et tenir sa page, voir ses statistiques)
- Console d'administration et **modération** (signalement, blocage, masquage)

**Reporté après le lancement :**
- Calendrier de disponibilité temps réel
- Paiement en ligne et acomptes
- Carnet de voyage / wishlist partageable
- Vidéo dans le fil
- Interface complète en malgache (la **recherche**, elle, comprend le malgache dès le MVP)
- Circuits vendus à la place (départs garantis avec places)
- Covoiturage / recherche de compagnon de route

### 2.3 Non-objectifs assumés

| On ne fait PAS | Pourquoi |
|---|---|
| **Réservation avec paiement en ligne** | Impose la disponibilité temps réel, une politique de remboursement et une responsabilité juridique. Aucun de ces trois éléments n'existe chez la majorité des établissements malgaches. |
| **Commission sur transaction** | Découle du point précédent : sans transaction tracée, pas de commission. |
| **Billetterie aérienne** | Métier régulé, marges nulles, concurrence mondiale. |
| **Une monnaie interne** | Fonenako l'a écrite (FNK, 1 = 18 Ar) puis masquée par un drapeau. Elle ajoute une étape de conversion mentale sur un marché à convaincre. |
| **Couvrir Madagascar entier au lancement** | Deux destinations bien couvertes valent mieux que 40 fiches vides sur tout le pays. |
| **Une application native** | La PWA de Fonenako (installable, notifications push app fermée) suffit et coûte zéro store. |

---

## 3. Utilisateurs et parcours

### 3.1 Les cinq personas

**① Hery, 32 ans, Antananarivo — le voyageur malgache** *(cible n°1 au lancement)*
Cadre, part en week-end 4 à 6 fois par an à moins de 200 km de Tana. Android à 400 000 Ar, forfait data compté, 3G. Budget 150 000 à 400 000 Ar la nuit pour la famille. **Vient pour** : trouver où dormir à Ampefy ce week-end, et où manger ce soir à Tana. **Revient pour** : le fil, les bons plans, les photos des autres.
→ *Conséquences produit* : tout doit tenir en 3G, les prix sont en ariary, la recherche par destination et par plat est le cœur.

**② Claire, 47 ans, Lyon — la touriste étrangère**
Prépare 3 semaines à Madagascar six mois à l'avance, depuis une bonne connexion. Budget en euros. **Vient pour** : comprendre quand partir, comparer des circuits, choisir une agence en qui avoir confiance. **Repart** avec 3 demandes de devis.
→ *Conséquences produit* : contenu saisonnalité et accès, itinéraires jour par jour, avis, badges de vérification, affichage en EUR possible.

**③ Solofo, 55 ans, Ampefy — l'hôtelier**
12 bungalows, une page Facebook qu'il alimente une fois par trimestre. Smartphone, pas d'ordinateur. Sa vraie douleur : **le téléphone qui ne sonne pas en basse saison**. **Vient pour** : être trouvé. **Reste** si Diako lui amène des demandes.
→ *Conséquences produit* : création de page **depuis un téléphone, en moins de 15 minutes**, saisie de tarifs très permissive (« je remplis plus tard »), statistiques visibles (« 240 personnes ont vu votre page ce mois-ci »).

**④ Naina, 38 ans, Antananarivo — la restauratrice**
Gargote-restaurant, 40 couverts, carte de 45 plats qui bouge peu. **Vient pour** : que les gens sachent qu'elle fait le meilleur ravitoto du quartier. **Bloque sur** : saisir 45 plats.
→ *Conséquences produit* : **saisie assistée du menu** avec autocomplétion sur le référentiel des plats, et mode dégradé (photo de la carte papier) pour ne jamais bloquer.

**⑤ Tahiry, 41 ans, Antananarivo — l'agence de voyage**
Réceptif, 12 circuits au catalogue, 4 véhicules, vend surtout à l'étranger. **C'est le compte qui paiera.** **Vient pour** : des demandes qualifiées. **Attend** : de pouvoir répondre à un projet de voyage précis.
→ *Conséquences produit* : circuits avec itinéraire jour par jour, barème de prix par taille de groupe, et surtout le module **« Je prépare un voyage »** (le voyageur décrit, les pros répondent) — transposition directe du meilleur actif de Fonenako.

### 3.2 Parcours clés

#### (a) « Je cherche un hôtel à Ampefy pour ce week-end » — Hery, 2 minutes

1. Ouvre `diako.mg` (PWA installée). Le fil s'affiche en moins de 2,5 s en 3G.
2. Tape **« hotel ampefy »** dans la barre. Dès la 3ᵉ lettre, l'autocomplétion propose *Ampefy (Itasy) — destination*, *Hôtel — catégorie*.
3. Valide. **Barre de réponse** en haut de l'écran :
   > **12 hébergements à Ampefy — à partir de 45 000 Ar la nuit**
   > *[mini-carte] [Piscine] [Vue lac] [Bungalow] [Moins de 100 000 Ar]*
4. Les 12 fiches défilent dessous : photo, nom, note, prix « à partir de », distance du lac, badge *Vérifié*.
5. Ouvre une fiche : galerie, **types de chambres avec leur prix**, équipements (⚡ groupe électrogène, 🛏 moustiquaire, 🚿 eau chaude), horaires, avis, itinéraire.
6. **« Demander une dispo »** → formulaire pré-rempli (dates, 2 adultes + 1 enfant de 6 ans) → l'hôtelier reçoit une notification push.

> **Repli obligatoire** : si aucun hôtel n'est référencé à Ampefy même, on ne renvoie **jamais** une page vide → *« Aucun hébergement à Ampefy même. Voici 4 adresses à Analavory, à 8 km. »*

#### (b) « Je veux manger du ravitoto près de moi » — Hery, 40 secondes

1. Tape **« ravitoto »**. Le résolveur de plats reconnaît le terme canonique (via `dish_aliases` : *ravitoto*, *ravi-toto*, *ravitoto sy henakisoa*, *feuilles de manioc pilées*).
2. **Barre de réponse** :
   > **Ravitoto sy henakisoa — 8 restaurants à Antananarivo, de 8 000 à 32 000 Ar**
3. Liste triée par distance : nom du resto · **le prix du plat chez lui** · note · distance · badge *Ouvert maintenant* / *Ferme dans 40 min*.
4. Bouton **Itinéraire** et bouton **Appeler**.

> Si le GPS est refusé : on retombe sur la ville du profil, et **on l'écrit** (« autour d'Antananarivo »).

#### (c) « Je suis hôtelier, je crée ma page » — Solofo, 12 minutes sur son téléphone

1. Inscription (email + code à 6 chiffres) → **« Je suis un professionnel »**.
2. Assistant en 6 étapes, chacune sautable, **brouillon sauvegardé en continu** :
   1. Catégorie (Hôtel ✓, Restaurant ✓ si les deux — les catégories sont **multiples**, un écolodge est souvent les deux)
   2. Nom, lieu (choisi dans le référentiel), **repère en clair** (« en face de la station Jovenna, après le pont ») — l'adressage normalisé n'existe pas à Madagascar
   3. Photos (compressées dans le navigateur avant envoi)
   4. **Chambres** : nom, capacité, prix par nuit, unité (par chambre / par personne), équipements
   5. Équipements de l'établissement (cases à cocher, jamais du texte libre)
   6. Contact + horaires
3. Publication **immédiate**, badge *Non vérifié*.
4. Bandeau permanent : *« Complétez votre page pour être mieux trouvé — 60 % »*, avec les 3 champs qui rapportent le plus.
5. **Vérification** : dépôt NIF/STAT ou licence dans un bucket **privé**, file de modération → badge *Vérifié*.

#### (d) « Je publie un récit de voyage » — Hery, 90 secondes

Bouton **+** central de la barre du bas → texte libre → photos (compression client) → **je tague un lieu** (Ampefy) → **je tague un établissement** (l'hôtel où il a dormi) → **je tague un plat** (la photo de son assiette) → publier.
Ces trois tags sont le moteur du produit : le récit remonte sur la page de la destination, sur la fiche de l'hôtel (preuve sociale) et sur la fiche du plat.

#### (e) « Je prépare un voyage, que les pros me répondent » — Claire, 3 minutes

Formulaire : destination *(ou « je ne sais pas encore » + envie : plage / nature / trek / culture)*, dates fixes ou flexibles, durée, 2 adultes, budget, style, besoins cochés (hébergement, circuit, voiture, guide).
→ Les agences et hôtels correspondants sont notifiés. Chacun peut répondre avec **au maximum 5 propositions** (limite anti-spam reprise telle quelle de Fonenako). Claire compare, accepte ou décline.

C'est **l'inverse du modèle « annonce »**, et c'est ce qui convient à un marché où l'offre est peu structurée. C'est aussi le meilleur actif de Fonenako, transposé.

---
## 4. Architecture technique

### 4.1 La stack retenue et pourquoi

**Décision : Diako v3 est un fork du code de Fonenako, sur un projet Supabase neuf et séparé.**

| Option | Verdict | Motif |
|---|---|---|
| **A. Fork de Fonenako** (Vite + React 18 + TS + Tailwind/shadcn + Supabase) | ✅ **RETENUE** | ~70 % des briques transposables. Le socle social (profils, follows, réactions, commentaires, messagerie, notifications, push VAPID) se reprend **intégralement**. Toute la discipline anti-egress et anti-3G est déjà écrite et éprouvée. Une seule stack à maintenir pour une seule personne. |
| B. Enrichir Diako-V2 (Firebase + PHP + MySQL) | ❌ | Firestore jamais activé, backend PHP non authentifié avec une RCE, MySQL à 12 tables, 485 Ko de JS Firebase inutiles. On repartirait de zéro **avec** une dette. |
| C. Hybride : front Diako-V2 + Supabase | ❌ | Le front Diako-V2 ne contient aucun métier voyage (61 occurrences décoratives). On garderait la coque et on réécrirait tout dessous — autant partir du code qui a déjà les bons réflexes. |
| D. Repartir de zéro | ❌ | Jetterait 2 ans de leçons payées cher (LCP au pixel, verrous de boost, fermeture PII, chaîne d'images). |

**On reprend malgré tout de Diako-V2** : les jetons de couleur turquoise/corail de `src/index.css`, le logo et le favicon, le nom, le domaine.

### 4.2 Schéma d'architecture

```
┌──────────────────────────────────────────────────────────────┐
│  NAVIGATEUR (PWA installable — Android 3G, écran 390 px)     │
│  React 18 + Vite + shadcn/ui + react-query                   │
│  Service Worker : précache de la COQUILLE uniquement          │
│  Caches locaux : fn_seen (déjà vus), fn_prefs (affinités),    │
│                  fn_geo (ville), curseur du fil               │
└────────────┬──────────────────────────────┬──────────────────┘
             │ REST + RPC (colonnes         │ <img src=…>
             │ explicites, jamais *)        │
             ▼                              ▼
┌────────────────────────────┐   ┌───────────────────────────────┐
│  SUPABASE (projet DIAKO,   │   │  o2switch — anfa7857          │
│  distinct de Fonenako)     │   │  diako.fonenako.mg            │
│                            │   │                               │
│  · Postgres + RLS          │   │  · SPA statique (dist/)       │
│  · Auth (email OTP,Google) │   │  · /api/o2upload.php          │
│  · Edge Functions (~8)     │   │    (JWT + magic bytes + IDOR) │
│  · Realtime : chat +       │   │  · /uploads/ + .thumb.webp    │
│    notifications SEULEMENT │   │  · meta-proxy.php (aperçus)   │
│  · pg_cron (snapshots)     │   │  · .htaccess (CSP, cache,     │
│  · Extensions : unaccent,  │   │    -Indexes, rate limit .php) │
│    pg_trgm, earthdistance  │   │  · brotli actif               │
└────────────────────────────┘   └───────────────────────────────┘
```

**Pourquoi un projet Supabase séparé** (et non le partage avec Fonenako) :

1. **Isolation de l'egress** — argument décisif. Le quota gratuit est de 2 Go/mois **par projet**. Un fil infini d'images de plats et de chambres est le pire cas possible. Le mutualiser reviendrait à mettre en jeu fonenako.mg, qui est en production et gagne de l'argent.
2. **Isolation de panne** : une migration ratée sur Diako ne peut pas casser Fonenako.
3. **Schéma propre** : Fonenako porte 162 migrations + 30 fichiers `vagueN.sql` collés à la main. On ne greffe pas un métier neuf là-dessus.
4. **Coût** : deux projets gratuits coûtent zéro. On paie le jour où l'un des deux dépasse, et on ne paie que celui-là.

*Contrepartie assumée* : les comptes ne sont pas partagés. Un utilisateur de Fonenako recréera un compte sur Diako. C'est acceptable — les publics ne se recouvrent que partiellement. Un SSO croisé reste possible plus tard.

### 4.3 Dépôt, environnements, déploiement

**Dépôt** : nouveau dépôt `parpaing25/diako` (repartir proprement plutôt que forcer l'historique Firebase de `Diako-V2`, qui contient des identifiants et une RCE). Dossier local : `Desktop\Diako`.

**Branches** : `main` = ce qui est en ligne. Une branche par lot (`lot2-pages-pro`), fusionnée quand le lot passe ses critères d'acceptation.

**Environnements** :
- *Dev* : `npm run dev` + projet Supabase Diako (le même — pas de préprod séparée au démarrage, ce serait un troisième projet à maintenir)
- *Prod* : `diako.fonenako.mg`

**Chaîne de déploiement** — inchangée, elle marche :
```bash
bash ~/.deploy-sites/redeploy.sh diako   # npm build + upload FTP
```
`ftp_deploy.py` ne nettoie que `assets/` et **préserve** `uploads/`. Deux corrections à apporter dès le Lot 0 :
- **versionner un `.htaccess`** dans le dépôt (aujourd'hui il n'existe que sur le serveur, non sauvegardé) — copier celui de Fonenako en adaptant la CSP ;
- passer le script de build à **`tsc --noEmit && vite build`** (Diako-V2 buildait sans vérification de types, d'où un `item.badge` inexistant parti en production).

**Secrets** : jamais dans le dépôt. `~/.diako-secrets` sur le poste, secrets Supabase pour les edge functions. La leçon de Diako-V2 (`db.php` avec de vrais identifiants uniquement sur le FTP, non versionné, non sauvegardé) ne doit pas être rejouée.

**Règle de schéma — la plus importante de cette section** : **une seule source de vérité**. Toutes les évolutions de base passent par `supabase/migrations/` avec un numéro croissant, et rien d'autre. Le mélange « 162 migrations + 30 `vagueN.sql` à coller à la main dans le bon ordre » a produit un incident réel en production sur Fonenako (`relation public.pro_pages does not exist` : les tables existaient dans le code mais n'avaient jamais été créées en base). **Régénérer `types.ts` après chaque migration**, sans exception — les `(supabase as any)` de Fonenako sont tous des bugs futurs.

**Sauvegardes** : export quotidien du schéma + données (`pg_dump` via l'API) vers le Drive, comme les autres projets.

---

## 5. Modèle de données

C'est le cœur du document. Le principe directeur tient en une ligne :

> **PAGE → OFFRE → TARIF**, plus trois référentiels canoniques (`places`, `dishes`, `amenities`).

Fonenako a tout mis dans une table `listings` de 90 colonnes, avec des blocs commentés `-- Parking specific`, `-- Colocation specific` : chaque nouveau type de bien a ajouté des colonnes nulles pour tous les autres. En voyage, ce serait fatal : hôtel + restaurant + circuit + véhicule dans une table donneraient **250 colonnes dont 230 vides sur chaque ligne**.

### 5.1 Conventions

- `id uuid primary key default gen_random_uuid()`
- `created_at / updated_at timestamptz not null default now()`
- **`profiles.id = auth.uid()`** — filtrer par `id`, **jamais** par un `user_id` (piège récurrent du projet frère)
- **Aucun `CREATE TYPE`** : les catégories métier sont du `text` + table de référence + `CHECK`. Les catégories de Diako bougeront vite (écolodge, table d'hôte, spot de kite) et faire évoluer un enum en production est un chemin de croix.
- Montants en **`bigint` d'ariary entiers** (jamais de flottant), toujours accompagnés de leur **unité** et de leur **base**.
- Toute colonne à valeur commerciale (`featured_until`, `verification_status`, `rating_avg`, `is_published`) est **protégée par trigger** et n'est modifiable que par une RPC `SECURITY DEFINER`.

### 5.2 Référentiel des lieux — `places`

Le squelette de tout Diako. C'est lui qui rend possible « hôtel à Ampefy ». Fonenako a 23 villes en dur dans un fichier TS — et **Ampefy n'y figure même pas**, pas plus qu'Andasibe, Ifaty, Sainte-Marie ou Isalo.

```sql
create table places (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,              -- 'ampefy', 'nosy-be'
  name_fr      text not null,
  name_mg      text,
  kind         text not null check (kind in (
                 'pays','region','axe','district','ville','commune',
                 'zone_touristique','quartier','plage','ile','parc','site')),
  parent_id    uuid references places(id),        -- Madagascar > Itasy > Ampefy
  path         ltree,                             -- sous-arbre en une requête
  lat          double precision,
  lng          double precision,
  radius_km    numeric(5,1) default 5,            -- Ampefy est une ZONE, pas un point
  region       text,                              -- une des 23 régions
  axe          text,                              -- 'rn7-sud','nord','est','ouest-baobabs','sava','sud-est'
  is_touristique boolean not null default false,  -- pilote les pages SEO
  summary      text,                              -- éditorial
  why_go       text[],                            -- 3 raisons d'y aller
  nb_pages     integer not null default 0,        -- compteurs dénormalisés
  nb_posts     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index places_parent_idx on places(parent_id);
create index places_path_idx   on places using gist(path);
create index places_geo_idx    on places using gist (ll_to_earth(lat,lng));

-- Les alias font marcher la recherche. Sans eux, « Tuléar » ne trouve pas Toliara.
create table place_aliases (
  place_id uuid not null references places(id) on delete cascade,
  alias    text not null,
  primary key (place_id, alias)
);
```
> Alias obligatoires au démarrage : Tuléar/Toliara, Diego/Antsiranana, Tamatave/Toamasina, Majunga/Mahajanga, Fort-Dauphin/Taolagnaro, Hell-Ville/Andoany, Sainte-Marie/Nosy Boraha, Ampefy/Lac Itasy/Analavory.

```sql
-- Saisonnalité : 12 lignes par lieu. C'est ce qui répond « quand partir à Sainte-Marie ».
create table place_seasons (
  place_id uuid not null references places(id) on delete cascade,
  month    smallint not null check (month between 1 and 12),
  rating   text not null check (rating in ('ideale','correcte','deconseillee')),
  reason   text,                    -- 'saison des pluies', 'baleines', 'cyclones'
  primary key (place_id, month)
);

-- Accès : « comment aller à Morondava » est une des 3 questions les plus fréquentes.
create table place_access (
  id           uuid primary key default gen_random_uuid(),
  place_id     uuid not null references places(id) on delete cascade,
  from_place_id uuid not null references places(id),
  mode         text not null check (mode in (
                 'goudron','piste','4x4','avion','bateau','pirogue','train')),
  distance_km  integer,
  duration_h   numeric(4,1),        -- durée RÉELLE : 250 km = 6 h à Madagascar
  road_state   text,
  all_year     boolean default true,-- Bemaraha fermé en saison des pluies
  departure_point text,             -- 'Fasan'ny Karana', 'Ampasapito'
  operators    text[],              -- Cotisse, Soatrans, Kofmad, Tsaradia
  price_ar     bigint
);
```

### 5.3 Référentiel des plats — `dishes` ⭐

**La pièce maîtresse du produit.** Sans ce dictionnaire, « où manger du ravitoto » est impossible : personne n'écrit un plat de la même façon. ~150 entrées suffisent à couvrir 95 % des cartes malgaches. C'est un travail éditorial de quelques jours, **non délégable à un algorithme**.

```sql
create table dishes (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,             -- 'ravitoto'
  name_fr       text not null,
  name_mg       text,
  family        text check (family in (
                  'laoka','grillade','soupe','riz','mofo','dessert',
                  'boisson','street-food','fruit-de-mer')),
  description   text,
  ingredients   text[],
  has_pork      boolean default false,            -- dérive halal / végétarien
  has_beef      boolean default false,
  has_seafood   boolean default false,
  has_peanut    boolean default false,
  is_vegetarian boolean default false,
  typical_place_id uuid references places(id),
  price_min_ar  bigint,                           -- fourchette indicative
  price_max_ar  bigint,
  photo_url     text,
  spice_level   smallint check (spice_level between 0 and 3),
  nb_restaurants integer not null default 0       -- « 8 restaurants le servent »
);

create table dish_aliases (
  dish_id uuid not null references dishes(id) on delete cascade,
  alias   text not null,
  primary key (dish_id, alias)
);
```
> Exemple `ravitoto` → alias : *ravitoto*, *ravi-toto*, *ravitoto sy henakisoa*, *ravitoto sy hena-kisoa*, *ravitoto au porc*, *feuilles de manioc pilées*.
>
> **Liste de départ** (à valider) : romazava · ravitoto sy henakisoa · henakisoa sy amalona · vary amin'anana · akoho sy voanio · hen'omby ritra · kitoza · varanga · tsaramaso · lasary · sambos · nem · masikita · zébu grillé · poisson grillé · poulpe · calamars · camaron · langouste · crabe · crevettes · composé · mi-sao · soupe chinoise · riz cantonais · mofo gasy · mofo baolina · koba ravina · godro-godro · bonbon coco · gâteau patate · foie gras de Behenjy · saucisse d'Antsirabe · ranon'ampango · THB · rhum arrangé · punch coco.

### 5.4 Référentiel des équipements — `amenities`

« Piscine » doit être une **case cochée**, jamais un mot noyé dans une description. Remplace à la fois la liste `AMENITIES` codée en dur de Fonenako et ses dizaines de colonnes booléennes.

```sql
create table amenities (
  code       text primary key,                    -- 'piscine','moustiquaire'
  label_fr   text not null,
  label_mg   text,
  icon       text,
  category   text check (category in (
               'confort','securite','connectivite','services',
               'restauration','loisirs','accessibilite','paiement')),
  applies_to text[] not null,                     -- {'hotel','chambre','restaurant','vehicule'}
  filterable boolean not null default true,
  sort_order integer default 0
);
create table page_amenities (
  page_id uuid not null references pages(id) on delete cascade,
  code    text not null references amenities(code),
  primary key (page_id, code)
);
```
> ⭐ **Entrées spécifiquement malgaches, qu'aucun modèle importé ne contient** et qui font toute la différence : moustiquaire · groupe électrogène (délestages JIRAMA) · panneaux solaires · **eau chaude** · eau potable fournie · gardien de nuit · accepte Mvola / Orange Money / Airtel Money · wifi **par qualité** (aucun / lent / correct / fibre) et non par oui-non · parking clos · accès 4×4 nécessaire.

### 5.5 La PAGE — `pages`

Transposition directe de `pro_pages` de Fonenako, qui est **déjà à 80 % le bon objet** (slug SEO, logo, couverture repositionnable, à-propos, services, galerie, FAQ, avis, leads, statistiques, badge). Trois manques à combler : catégories **multiples**, horaires **structurés**, rattachement à un `place_id`.

```sql
create table pages (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  owner_id      uuid references profiles(id),     -- NULL = fiche éditoriale Diako
  name          text not null,
  legal_name    text,

  -- MULTIPLES : un écolodge est hôtel ET restaurant ET organise des excursions.
  categories    text[] not null default '{}',     -- hotel|restaurant|agence_voyage|
                                                  -- guide|transporteur|location_vehicule|
                                                  -- site_attraction|organisateur_evenement
  subcategory   text,                             -- bungalow, écolodge, hotely gasy, gargote…

  short_desc    text,
  long_desc     text,
  long_desc_mg  text,

  place_id      uuid references places(id),
  address       text,
  landmark      text,                             -- ⭐ « en face de la station Jovenna »
  lat           double precision,
  lng           double precision,

  phone         text,
  phone2        text,
  whatsapp      text,
  show_whatsapp boolean default true,
  email         text,
  website       text,
  facebook      text,
  instagram     text,
  messenger     text,

  logo_url      text,
  cover_url     text,
  cover_offset_y smallint default 50,             -- repositionnement façon Facebook
  gallery       jsonb default '[]'::jsonb,
  video_url     text,
  faq           jsonb default '[]'::jsonb,

  languages     text[],                           -- {fr,mg,en,it,de}
  payment_methods text[],                         -- {especes,mvola,orange_money,airtel_money,virement,cb}
  currencies    text[] default '{MGA}',
  price_level   smallint check (price_level between 1 and 4),

  official_rating text,                           -- étoiles / ravinala (décision D13, §16)
  licence_no    text,                             -- agrément Ministère du Tourisme / ONTM

  verification_status text not null default 'none'
                 check (verification_status in ('none','phone','place','documents','partner')),
  is_published  boolean not null default true,

  rating_avg    numeric(2,1) default 0,           -- maintenu par trigger
  rating_count  integer default 0,
  views_count   integer default 0,
  leads_count   integer default 0,

  price_min_ar  bigint,                           -- ⭐ dénormalisé : sans lui, aucun filtre budget
  price_min_unit text,                            -- 'nuit' | 'plat' | 'jour' | 'personne'
  rates_checked_at timestamptz,                   -- ⭐ fraîcheur : le nerf de la guerre
  completeness  smallint default 0,               -- 0-100, pilote le classement

  featured_until timestamptz,                     -- ⚠ protégé par trigger
  search_vector tsvector,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index pages_place_idx   on pages(place_id) where is_published;
create index pages_cat_idx     on pages using gin(categories);
create index pages_geo_idx     on pages using gist (ll_to_earth(lat,lng));
create index pages_search_idx  on pages using gin(search_vector);
create index pages_name_trgm   on pages using gin (name gin_trgm_ops);
create index pages_price_idx   on pages(price_min_ar) where is_published;
```

**Horaires structurés** — le champ `hours` de Fonenako est un `jsonb` de texte libre (« 08h – 17h ») : impossible de répondre « ouvert maintenant », impossible de gérer un service coupé midi/soir. Rédhibitoire pour un annuaire de restaurants.

```sql
create table page_hours (
  id        uuid primary key default gen_random_uuid(),
  page_id   uuid not null references pages(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  opens_at  time not null,
  closes_at time not null,                        -- 2 lignes/jour pour un service coupé
  service   text check (service in ('midi','soir','continu')),
  unique (page_id, weekday, opens_at)
);
create table page_closures (                      -- fermetures exceptionnelles/annuelles
  page_id uuid not null references pages(id) on delete cascade,
  from_date date not null,
  to_date   date not null,
  reason    text
);
```

**Profils spécialisés** (1-1 avec `pages`, un seul par catégorie détenue) :

```sql
create table stay_profiles (          -- hôtel / bungalow / écolodge / chambre d'hôte
  page_id           uuid primary key references pages(id) on delete cascade,
  nb_rooms          integer,
  total_capacity    integer,
  comfort_level     text check (comfort_level in ('routard','standard','confort','charme','luxe')),
  check_in          time,
  check_out         time,
  late_arrival      boolean default true,
  min_nights        smallint default 1,
  children_policy   text,
  free_under_age    smallint,
  pets_policy       text check (pets_policy in ('non','oui','oui_supplement')),
  cancellation      text,
  deposit_pct       smallint,
  breakfast_included boolean default false,
  breakfast_price_ar bigint,
  tourist_tax_ar    bigint,                       -- ⭐ taxe de séjour à part (Nosy Be…)
  transfer_airport  boolean default false,
  transfer_price_ar bigint,
  dist_beach_m      integer,
  dist_center_km    numeric(4,1),
  dist_airport_km   numeric(5,1),
  access_type       text check (access_type in ('voiture','4x4','bateau','pied'))
);

create table dining_profiles (        -- restaurant / gargote / snack / salon de thé
  page_id          uuid primary key references pages(id) on delete cascade,
  cuisines         text[],                        -- malgache, française, fruits de mer…
  avg_ticket_ar    bigint,
  dish_min_ar      bigint,                        -- « manger pour moins de 10 000 Ar »
  dish_max_ar      bigint,
  seats            integer,
  takeaway         boolean default false,
  delivery         boolean default false,
  delivery_zones   text[],
  delivery_fee_ar  bigint,
  delivery_delay_min smallint,
  reservation      text check (reservation in ('non','conseillee','obligatoire')),
  alcohol          boolean default false,
  ambiance         text[],
  kids_friendly    boolean default false,
  vegetarian       boolean default false,
  halal            boolean default false,
  signature_dish_id uuid references dishes(id),
  menu_updated_at  timestamptz                    -- ⭐ un menu de 2024 détruit la confiance
);

create table operator_profiles (      -- agence de voyage / tour-opérateur
  page_id        uuid primary key references pages(id) on delete cascade,
  nif            text,
  stat           text,
  licence_no     text,
  licence_valid_until date,
  operator_type  text[],                          -- receptif, emetteur, dmc
  specialties    text[],                          -- parcs, balnéaire, trek, plongée, baleines…
  destinations   uuid[],                          -- places couvertes
  fleet          jsonb,                           -- [{type:'4x4', model:'Land Cruiser', qty:3}]
  guides_langs   text[],
  insurance      boolean default false,
  deposit_pct    smallint,
  cancellation   text,
  response_delay_h smallint,
  years_exp      smallint
);

create table guide_profiles (         -- guide indépendant
  page_id        uuid primary key references pages(id) on delete cascade,
  card_no        text,                            -- carte professionnelle
  mnp_parks      text[],                          -- parcs où il est agréé
  association    text,
  langs          text[],
  specialties    text[],
  areas          uuid[],
  rate_halfday_ar bigint,
  rate_day_ar    bigint,
  rate_basis     text check (rate_basis in ('groupe','personne')),
  max_group      smallint,
  has_vehicle    boolean default false
);
```

### 5.6 Les OFFRES — ce qu'on vend réellement

C'est le niveau qui n'existe nulle part chez Fonenako, et c'est **la rupture principale**.

```sql
-- ① Types de chambre
create table room_types (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references pages(id) on delete cascade,
  name          text not null,                    -- « Bungalow vue mer »
  description   text,
  photos        text[],
  units_count   smallint default 1,               -- 5 bungalows identiques
  max_adults    smallint,
  max_children  smallint,
  beds          jsonb,                            -- [{type:'double',qty:1}]
  surface_m2    smallint,
  private_bath  boolean default true,
  hot_water     boolean default false,            -- ⭐ critère décisif à Madagascar
  view          text,                             -- mer, lagon, jardin, rizières
  base_price_ar bigint not null,
  price_unit    text not null check (price_unit in ('chambre','personne')),
  extra_person_ar bigint,
  single_supplement_ar bigint,
  status        text default 'actif' check (status in ('actif','ferme','travaux')),
  sort_order    smallint default 0
);
create table room_amenities (
  room_type_id uuid not null references room_types(id) on delete cascade,
  code         text not null references amenities(code),
  primary key (room_type_id, code)
);

-- ② Tarifs saisonniers : un hôtel affiche sinon un prix faux 8 mois sur 12
create table season_rates (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references room_types(id) on delete cascade,
  season_label  text not null,                    -- 'basse','haute','fêtes','toute l'année'
  from_date     date,                             -- NULL,NULL = toute l'année
  to_date       date,
  price_ar      bigint not null,
  price_unit    text not null check (price_unit in ('chambre','personne')),
  currency      text not null default 'MGA',
  board         text check (board in ('chambre_seule','petit_dej','demi_pension',
                                      'pension_complete','all_in')),
  min_nights    smallint default 1,
  resident_price_ar bigint,                       -- ⭐ double grille résident/non-résident
  promo_price_ar bigint,
  promo_until   date,
  checked_at    timestamptz not null default now()
);
```
> **Règle de saisie** : le modèle doit accepter **UNE seule ligne « toute l'année »** sans forcer la saisie de 4 saisons. Beaucoup d'établissements malgaches pratiquent un tarif ferme — si on impose 4 saisons, personne ne remplit.

```sql
-- ③ Le MENU : sections puis plats. C'est ce qui tient la promesse d'Andry.
create table menu_sections (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references pages(id) on delete cascade,
  name       text not null,                       -- Entrées, Laoka, Grillades, Desserts
  service    text check (service in ('midi','soir','tous')),
  sort_order smallint default 0
);

create table menu_items (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references pages(id) on delete cascade,
  section_id  uuid references menu_sections(id) on delete set null,
  name        text not null,                      -- tel que le restaurateur l'écrit
  dish_id     uuid references dishes(id),         -- ⭐⭐ LE lien qui fait tout marcher
  description text,
  price_ar    bigint,
  price_unit  text default 'portion'
                check (price_unit in ('portion','2_personnes','kg','part','verre')),
  photo_url   text,
  availability text default 'permanent'
                check (availability in ('permanent','plat_du_jour','saisonnier','sur_commande')),
  tags        text[],                             -- vegetarien, epice, halal
  allergens   text[],
  side_dish   text,                               -- riz, frites, lasary
  is_signature boolean default false,
  in_stock    boolean default true,
  sort_order  smallint default 0,
  search_vector tsvector
);
create index menu_items_dish_idx  on menu_items(dish_id, page_id, price_ar);  -- ⭐ LA requête
create index menu_items_page_idx  on menu_items(page_id);
create index menu_items_trgm      on menu_items using gin (name gin_trgm_ops);
create index menu_items_fts       on menu_items using gin (search_vector);

-- Mode dégradé indispensable : sinon aucun restaurateur ne saisira 60 lignes
alter table dining_profiles add column menu_photos text[];
```

```sql
-- ④ Circuits (agences) + itinéraire jour par jour
create table tours (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references pages(id) on delete cascade,
  slug          text unique not null,
  title         text not null,
  summary       text,
  description   text,
  duration_days smallint not null,                -- ⭐ entier filtrable, jamais du texte
  duration_nights smallint,
  difficulty    text check (difficulty in ('facile','modere','sportif','expedition')),
  format        text check (format in ('privatif','groupe','depart_garanti')),
  group_min     smallint,
  group_max     smallint,
  start_place_id uuid references places(id),
  end_place_id   uuid references places(id),
  steps          uuid[],                          -- places ordonnées
  axe            text,                            -- ⭐ ce qui donne un sens au mot « sud »
  transports     text[],
  lodging_level  text,
  guide_langs    text[],
  parks_included boolean default false,           -- droits MNP inclus ou non
  deposit_pct    smallint,
  cancellation   text,
  months_open    smallint[],                      -- Bemaraha fermé en saison des pluies
  photos         text[],
  search_vector  tsvector
);

-- ⭐ Le prix par personne BAISSE avec la taille du groupe : c'est LA règle du métier.
create table tour_prices (
  tour_id     uuid not null references tours(id) on delete cascade,
  pax_min     smallint not null,                  -- 2, 4, 6, 8
  pax_max     smallint,
  price_pp_ar bigint not null,                    -- prix PAR PERSONNE
  currency    text not null default 'MGA',
  primary key (tour_id, pax_min)
);

create table tour_days (
  tour_id      uuid not null references tours(id) on delete cascade,
  day_no       smallint not null,
  title        text,
  story        text,
  from_place_id uuid references places(id),
  to_place_id   uuid references places(id),
  distance_km  integer,
  drive_h      numeric(3,1),                      -- ⭐ temps de route RÉEL
  activities   text[],
  meals        text[],                            -- {'petit_dej','dejeuner','diner'}
  lodging      text,
  primary key (tour_id, day_no)
);

create table tour_inclusions (
  tour_id uuid not null references tours(id) on delete cascade,
  kind    text not null check (kind in ('inclus','non_inclus')),
  label   text not null,
  sort_order smallint default 0
);

create table tour_departures (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references tours(id) on delete cascade,
  start_date  date not null,
  end_date    date,
  status      text check (status in ('garanti','a_confirmer','complet','annule')),
  seats_left  smallint,
  seats_total smallint,
  price_pp_ar bigint,
  guide_lang  text
);

-- ⑤ Location de véhicule : trois vérités à dire, sinon les prix sont mensongers
create table rental_offers (
  id             uuid primary key default gen_random_uuid(),
  page_id        uuid not null references pages(id) on delete cascade,
  vehicle_type   text not null,                   -- 4x4, berline, minibus, moto, pirogue
  model          text,
  with_driver    boolean not null default true,   -- ⭐ presque toujours vrai à Madagascar
  pax            smallint,
  air_con        boolean default false,
  price_day_ar   bigint not null,
  km_included    integer,
  extra_km_ar    bigint,
  fuel_included  boolean not null default false,  -- ⭐ le plus souvent NON
  driver_costs_on_client boolean not null default true, -- ⭐ logement+repas du chauffeur
  deposit_ar     bigint,
  zones_allowed  text,
  one_way        boolean default false,
  return_fee_ar  bigint
);
```

### 5.7 Les sites, événements et transports

```sql
create table attractions (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid not null references places(id),
  name          text not null,
  slug          text unique not null,
  kind          text,                             -- parc_national, plage, tsingy, rova…
  manager       text,                             -- MNP / privé / communautaire
  fee_adult_ar  bigint,
  fee_child_ar  bigint,
  fee_nonresident_ar bigint,                      -- ⭐ double grille officielle
  fee_validity_days smallint,
  guide_required boolean default false,
  guide_fee_ar  bigint,                           -- ⭐ par CIRCUIT et par GROUPE, pas par personne
  circuits      jsonb,                            -- [{name:'Namaza',hours:4,level:'modere'}]
  best_months   smallint[],
  species       text[],
  visit_hours   text,
  access        text,
  gear_needed   text[],
  fady          text[]                            -- ⭐ tabous locaux : respect et info utile
);

create table events (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid references places(id),
  page_id     uuid references pages(id),          -- organisateur éventuel
  title       text not null,
  kind        text,                               -- festival, concert, fête, phénomène naturel
  start_date  date not null,
  end_date    date,
  yearly      boolean default false,
  price_ar    bigint,
  program     text,
  poster_url  text,
  status      text default 'confirme'
);

create table transport_services (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid references pages(id),        -- NULL = fiche éditoriale
  kind          text not null,                    -- taxi-brousse, vol, bateau, train
  operator      text,
  from_place_id uuid not null references places(id),
  to_place_id   uuid not null references places(id),
  departure_point text,
  schedule      text,
  duration_announced_h numeric(4,1),
  duration_real_h      numeric(4,1),              -- ⭐ la vraie information
  price_ar      bigint,
  comfort       text,
  booking_mode  text,
  seasonal_note text
);
```

### 5.8 Le fil — `posts`

Objet **léger et générique**, publiable en dix secondes depuis un téléphone. C'est l'exact opposé de la table `listings` à 90 colonnes.

```sql
create table posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references profiles(id),
  page_id       uuid references pages(id),        -- publié « en tant que » l'établissement
  kind          text not null default 'photo' check (kind in (
                  'recit','photo','bon_plan','question','promo','avis',
                  'alerte','evenement','check_in')),
  body          text,
  lang          text default 'fr',
  media         jsonb default '[]'::jsonb,        -- [{url,w,h,alt}] — ratio connu = anti-CLS
  media_count   smallint default 0,
  place_id      uuid references places(id),
  visibility    text default 'public' check (visibility in ('public','abonnes')),

  -- champs par type
  promo_price_ar    bigint,
  promo_old_price_ar bigint,
  promo_until       date,
  question_resolved boolean,
  alert_severity    text,
  alert_expires_at  timestamptz,                  -- ⭐ une route coupée n'est plus vraie 3 mois après

  reactions_count integer not null default 0,     -- dénormalisés par trigger
  comments_count  integer not null default 0,
  shares_count    integer not null default 0,
  saves_count     integer not null default 0,
  views_count     integer not null default 0,

  quality_score  real not null default 0,         -- ⭐ classement SERVEUR (§7.3)
  featured_until timestamptz,                     -- ⚠ protégé par trigger
  status        text not null default 'published'
                 check (status in ('published','hidden','removed')),
  created_at    timestamptz not null default now()
);
-- ⭐ L'index qui porte la pagination par curseur du fil
create index posts_feed_idx on posts (quality_score desc, id desc)
  where status = 'published';
create index posts_recent_idx on posts (created_at desc, id desc)
  where status = 'published';
create index posts_place_idx on posts (place_id, created_at desc)
  where status = 'published';

-- Les 3 tags qui font le moteur du produit
create table post_places (post_id uuid references posts(id) on delete cascade,
                          place_id uuid references places(id), primary key (post_id, place_id));
create table post_pages  (post_id uuid references posts(id) on delete cascade,
                          page_id  uuid references pages(id),  primary key (post_id, page_id));
create table post_dishes (post_id uuid references posts(id) on delete cascade,
                          dish_id  uuid references dishes(id), primary key (post_id, dish_id));
```

### 5.9 Socle social — repris tel quel de Fonenako

Ces tables se copient presque à l'identique. Elles tournent en production depuis un an.

| Table | Adaptation |
|---|---|
| `profiles` | `account_type` devient `voyageur` \| `pro`. Ajouter `home_place_id`. **`profiles.id = auth.uid()`**. |
| `reactions` | Cible polymorphe (`post` \| `page`). Passer de 3 à 6 réactions. `UNIQUE(user_id, target_type, target_id)`. |
| `comments` | + `parent_id`, images, épinglage. **À paginer** (10 puis « voir plus ») : un post viral aura 300 commentaires. |
| `comment_reactions` | ⚠ **À refaire en batché.** Chez Fonenako, 30 commentaires = 60 requêtes. |
| `follows` | Étendre : on suit une **personne OU une page**. C'est le cœur d'un réseau où l'on suit des hôtels. |
| `conversations` / `messages` | `(visiteur_id, page_id)`. Garder `delivered`/`read`, le suffixe aléatoire de nom de channel (anti-crash StrictMode) et les `GRANT` au niveau colonne. |
| `notifications` | Tel quel. **Sans contrainte `CHECK` sur `type`** — chez Fonenako elle a dû être supprimée deux fois. |
| `push_subscriptions` | Tel quel + edge function `send-push` (VAPID). Brique la plus rentable du projet frère. |
| `saved_searches` | Alertes voyage : « préviens-moi si un bungalow à Ifaty passe sous 100 000 Ar ». + critères de **dates**. |
| `page_views` | Tel quel : module autonome, `fetch keepalive`, aucune lecture, zéro poids. |

**Nouvelles tables obligatoires avant toute ouverture au public** — Fonenako n'a **aucune** modération de contenu (les boutons « Signaler / Bloquer » sont de simples entrées de menu branchées sur rien). C'est inacceptable pour un réseau grand public :

```sql
create table reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post','comment','page','review','message','profile')),
  target_id   uuid not null,
  reporter_id uuid not null references profiles(id),
  reason      text not null,
  details     text,
  status      text not null default 'nouveau'
                check (status in ('nouveau','vu','traite','rejete')),
  handled_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);
create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
```
> Règle : au-delà de **3 signalements** distincts, le contenu passe automatiquement en `hidden` et remonte en tête de la file admin. `blocks` filtre le fil **et** la messagerie.

### 5.10 Avis, demandes, projets de voyage

```sql
create table reviews (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('page','tour','dish','attraction')),
  target_id    uuid not null,
  author_id    uuid not null references profiles(id),
  rating       smallint not null check (rating between 1 and 5),
  criteria     jsonb,        -- {proprete:4, eau_chaude:5, accueil:5, rapport_qualite_prix:4}
  title        text,
  body         text,
  photos       text[],
  stay_date    date,         -- ⭐ un avis de 2023 ne vaut pas un avis d'hier
  trip_type    text,         -- couple, famille, solo, amis, affaires
  owner_reply  text,         -- ⭐ réponse du professionnel
  owner_reply_at timestamptz,
  verified     boolean default false,  -- passé par une demande Diako
  helpful_count integer default 0,
  status       text not null default 'approved'
                 check (status in ('approved','hidden','removed')),
  created_at   timestamptz not null default now(),
  unique (target_type, target_id, author_id)
);
```
> Décision reprise de Fonenako (vague15) : **publication immédiate + modération a posteriori**. Le choix inverse a produit un bug réel où toutes les notes restaient bloquées à 0. Le trigger de recalcul de moyenne doit s'exécuter sur `INSERT`, `UPDATE` **et `DELETE`**.

**Critères par catégorie** : hôtel → propreté, confort du lit, salle de bain et eau chaude, accueil, emplacement, petit-déjeuner, rapport qualité/prix, wifi, calme. Restaurant → goût, service, cadre, prix, rapidité, hygiène. Agence → organisation, qualité du guide, véhicule et chauffeur, respect du programme, communication, rapport qualité/prix.

```sql
create table bookings (                            -- « demande », pas « réservation ferme »
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in (
                 'info','devis','sejour','table','depart','vehicule','guide')),
  page_id      uuid not null references pages(id),
  room_type_id uuid references room_types(id),
  tour_id      uuid references tours(id),
  departure_id uuid references tour_departures(id),
  user_id      uuid references profiles(id),      -- NULL = visiteur non connecté
  date_from    date,
  date_to      date,
  time_at      time,                              -- réservation de table
  adults       smallint,
  children_ages smallint[],                       -- ⭐ les politiques enfants dépendent de l'âge
  rooms        smallint,
  seats        smallint,
  special_needs text,
  budget_ar    bigint,
  message      text,
  contact_name text not null,
  contact_phone text not null,
  contact_email text,
  preferred_channel text,                         -- repris de Fonenako
  status       text not null default 'nouvelle' check (status in (
                 'nouvelle','vue','repondue','devis_envoye','confirmee','annulee','honoree','absence')),
  quoted_ar    bigint,
  first_reply_at timestamptz,                     -- ⭐ alimente « répond en moins de 2 h »
  source       text,                              -- fil, page, recherche, seo
  created_at   timestamptz not null default now()
);

create table trip_requests (                       -- « je prépare un voyage »
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id),
  place_id     uuid references places(id),         -- NULL = « je ne sais pas encore »
  envie        text[],                             -- plage, nature, trek, culture, farniente
  date_from    date,
  date_to      date,
  flexible_days smallint,
  duration_days smallint,
  adults       smallint,
  children_ages smallint[],
  budget_ar    bigint,
  budget_currency text default 'MGA',
  style        text check (style in ('routard','confort','charme','luxe')),
  needs        text[],                             -- hebergement, circuit, voiture, guide
  constraints  text,
  status       text not null default 'active' check (status in ('active','close')),
  created_at   timestamptz not null default now()
);
create unique index one_active_trip_request on trip_requests(user_id) where status = 'active';

create table trip_offers (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references trip_requests(id) on delete cascade,
  page_id     uuid not null references pages(id),
  tour_id     uuid references tours(id),
  room_type_id uuid references room_types(id),
  message     text,
  price_ar    bigint,
  status      text not null default 'pending'
                check (status in ('pending','saved','accepted','declined')),
  created_at  timestamptz not null default now(),
  unique (request_id, page_id, tour_id, room_type_id)
);
```
> **Limite anti-spam de 5 propositions par pro et par demande**, reprise telle quelle du trigger `check_offer_limit` de Fonenako.

### 5.11 Le prix — règle transverse ⭐

C'est là que Fonenako a le plus souffert (`prix_vente` + `loyer_mensuel` + `rent_period` bricolé après coup, filtre budget faux sur l'onglet « Tout »). Sur Diako, **tout prix porte obligatoirement trois attributs** :

| Attribut | Valeurs | Exemple |
|---|---|---|
| **Montant** | `bigint` ariary | 150 000 |
| **Unité** | nuit · personne · personne/nuit · chambre · plat · jour · véhicule · groupe · circuit · kg | par chambre et par nuit |
| **Base** | résident · non-résident · enfant · groupe | résident |

Plus : taxes incluses ou non, taxe de séjour **à part**, période de validité, `checked_at`, nature (ferme / « à partir de » / négociable / sur devis).

> **Règle absolue** : tout écran qui compare des prix ne compare que des prix **de même unité et de même base**, et **l'écrit à l'écran**. Sinon un hôtel en pension complète par personne paraît trois fois plus cher qu'il ne l'est, et l'utilisateur perd confiance en une seule visite.
>
> **Interdit** : la sentinelle magique. Chez Fonenako, `priceMax === 5000000` signifie « pas de plafond » — un utilisateur qui a réellement 5 000 000 Ar de budget voit son filtre ignoré silencieusement. On utilise `NULL`.

---
## 6. Le moteur de recherche — la fonction signature

C'est **la** fonctionnalité qui distingue Diako de tout ce qui existe à Madagascar. Elle doit être conçue avant d'écrire le premier écran.

### 6.1 Pourquoi on ne peut pas copier Fonenako

Toute la recherche de Fonenako repose sur `ilike '%…%'` : `.or('title.ilike.%q%,city.ilike.%q%,area.ilike.%q%,description.ilike.%q%')`. Un motif qui commence par `%` **interdit tout index btree** → scan séquentiel de la table à chaque frappe. Vérifié : aucun `tsvector`, aucun `pg_trgm`, aucun index GIN dans le dépôt.

Conséquences directes en voyage :
- « ravitoto » ne trouvera **jamais** « Ravitoto sy henakisoa »
- « ampefi » (faute) ne trouvera **rien**
- « Tuléar » ne trouvera **pas** Toliara
- « hotely tsara any Ampefy » ne trouvera **rien**

### 6.2 Extensions et normalisation

```sql
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists cube;
create extension if not exists earthdistance;   -- géo sans PostGIS (suffisant ici)

-- Configuration de recherche : 'simple' + unaccent.
-- On n'utilise PAS 'french' : le stemming français massacre le malgache
-- (romazava, ravitoto, akoho ne sont pas des mots français).
create text search configuration diako (copy = simple);
alter text search configuration diako
  alter mapping for hword, hword_part, word with unaccent, simple;

create or replace function diako_norm(t text) returns text
language sql immutable parallel safe as $$
  select lower(unaccent(coalesce(t,'')))
$$;
```

### 6.3 Indexation

```sql
-- Pages
create or replace function pages_search_refresh() returns trigger
language plpgsql as $$
begin
  new.search_vector :=
      setweight(to_tsvector('diako', coalesce(new.name,'')), 'A')
    || setweight(to_tsvector('diako', array_to_string(new.categories,' ')), 'B')
    || setweight(to_tsvector('diako', coalesce(new.subcategory,'')), 'B')
    || setweight(to_tsvector('diako', coalesce(new.short_desc,'')), 'C')
    || setweight(to_tsvector('diako', coalesce(new.long_desc,'')), 'D');
  return new;
end $$;
create trigger trg_pages_search before insert or update on pages
  for each row execute function pages_search_refresh();

-- Plats du menu : le nom du plat ET son nom canonique ET ses alias
create or replace function menu_items_search_refresh() returns trigger
language plpgsql as $$
declare canon text := '';
begin
  if new.dish_id is not null then
    select coalesce(d.name_fr,'') || ' ' || coalesce(d.name_mg,'') || ' ' ||
           coalesce(string_agg(a.alias,' '),'')
      into canon
      from dishes d left join dish_aliases a on a.dish_id = d.id
     where d.id = new.dish_id group by d.id;
  end if;
  new.search_vector :=
      setweight(to_tsvector('diako', coalesce(new.name,'')), 'A')
    || setweight(to_tsvector('diako', canon), 'A')
    || setweight(to_tsvector('diako', coalesce(new.description,'')), 'C');
  return new;
end $$;
create trigger trg_menu_search before insert or update on menu_items
  for each row execute function menu_items_search_refresh();
```
Index déjà déclarés au §5 : `gin(search_vector)` sur `pages`, `menu_items`, `tours` ; `gin(name gin_trgm_ops)` pour la tolérance aux fautes ; `gist(ll_to_earth(lat,lng))` pour la proximité.

### 6.4 Résolution d'intention — l'étape que tout le monde saute

Avant de chercher, on **comprend**. La requête est découpée en quatre dimensions, chacune résolue contre un référentiel :

| Dimension | Résolue contre | Exemple |
|---|---|---|
| **Catégorie** | `category_aliases` | « resto », « hotely », « où dormir » |
| **Lieu** | `places` + `place_aliases` + trigram | « ampefi » → Ampefy |
| **Plat** | `dishes` + `dish_aliases` + trigram | « ravitoto » → *ravitoto* |
| **Contrainte** | analyse lexicale | « moins de 150 000 », « piscine », « ouvert maintenant » |

```sql
create table category_aliases (
  alias     text primary key,
  category  text not null,
  ambiguous boolean not null default false
);
```

> ⚠️⚠️ **PIÈGE SÉMANTIQUE MAJEUR, à trancher avant d'écrire une ligne de code.**
> En malgache courant, **« hotely » désigne le plus souvent un petit RESTAURANT** (*hotely gasy* = gargote), pas un hôtel. Une requête « hotely » ne doit donc **pas** ne renvoyer que des hébergements. D'où le drapeau `ambiguous` : quand il est levé et que la confiance est faible, on **pose une question courte** — *« Vous cherchez où dormir ou où manger ? »* — plutôt que d'afficher une liste fausse.

```sql
create or replace function resolve_place(q text)
returns table (place_id uuid, score real)
language sql stable as $$
  with n as (select diako_norm(q) as q)
  select p.id,
         greatest(
           case when diako_norm(p.name_fr) = n.q then 1.0 else 0 end,
           coalesce(max(case when diako_norm(a.alias) = n.q then 0.98 end), 0),
           similarity(diako_norm(p.name_fr), n.q),
           coalesce(max(similarity(diako_norm(a.alias), n.q)), 0)
         )::real as score
    from places p
    left join place_aliases a on a.place_id = p.id, n
   group by p.id, p.name_fr, n.q
  having greatest(
           similarity(diako_norm(p.name_fr), n.q),
           coalesce(max(similarity(diako_norm(a.alias), n.q)), 0)
         ) > 0.34
   order by score desc
   limit 5;
$$;
```
`resolve_dish(q)` suit exactement le même patron sur `dishes` / `dish_aliases`.

### 6.5 Le RPC unique de recherche

**Une seule porte d'entrée**, assainie une seule fois, côté serveur. Fonenako a trois constructeurs de requêtes concurrents (`FeedSection`, `SearchResults`, `buildCountQuery`) qui doivent rester synchronisés à la main — la dérive est certaine, et l'assainissement n'est appliqué que dans l'un des trois.

```sql
create or replace function search_all(
  p_q          text,
  p_category   text    default null,
  p_place_id   uuid    default null,
  p_price_max  bigint  default null,     -- NULL = pas de plafond (JAMAIS de sentinelle)
  p_amenities  text[]  default null,
  p_open_now   boolean default false,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_radius_km  numeric default null,
  p_cursor     text    default null,     -- keyset : 'score|id'
  p_limit      int     default 20
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_place uuid; v_dish uuid; v_cat text;
  v_answer jsonb; v_results jsonb;
begin
  -- 1. Résolution d'intention
  v_place := coalesce(p_place_id, (select place_id from resolve_place(p_q) limit 1));
  v_dish  := (select dish_id  from resolve_dish(p_q)  limit 1);
  v_cat   := coalesce(p_category, (select category from category_aliases
                                    where alias = diako_norm(p_q) and not ambiguous));

  -- 2. BARRE DE RÉPONSE — cas « un plat »
  if v_dish is not null then
    select jsonb_build_object(
      'type','dish',
      'dish', (select to_jsonb(d) from dishes d where d.id = v_dish),
      'count', count(*),
      'price_min', min(mi.price_ar),
      'price_max', max(mi.price_ar),
      'items', jsonb_agg(jsonb_build_object(
                 'page_id', p.id, 'page_name', p.name, 'slug', p.slug,
                 'price_ar', mi.price_ar, 'unit', mi.price_unit,
                 'photo', coalesce(mi.photo_url, p.cover_url),
                 'rating', p.rating_avg, 'place', pl.name_fr,
                 'km', case when p_lat is null then null
                            else round((earth_distance(ll_to_earth(p_lat,p_lng),
                                        ll_to_earth(p.lat,p.lng))/1000)::numeric,1) end)
               order by (case when p_lat is null then 0
                              else earth_distance(ll_to_earth(p_lat,p_lng),
                                                  ll_to_earth(p.lat,p.lng)) end),
                        p.rating_avg desc)
    ) into v_answer
    from menu_items mi
    join pages p  on p.id = mi.page_id and p.is_published
    left join places pl on pl.id = p.place_id
    where mi.dish_id = v_dish and mi.in_stock
      and (v_place is null or p.place_id in (select id from descendants(v_place)));

  -- 3. BARRE DE RÉPONSE — cas « une catégorie dans un lieu »
  elsif v_cat is not null and v_place is not null then
    select jsonb_build_object(
      'type','category_place',
      'category', v_cat,
      'place', (select to_jsonb(pl) from places pl where pl.id = v_place),
      'count', count(*),
      'price_from', min(p.price_min_ar),
      'price_unit', min(p.price_min_unit),
      'facets', jsonb_build_object(
        'amenities', (select jsonb_agg(distinct pa.code) from page_amenities pa
                       where pa.page_id = any(array_agg(p.id))))
    ) into v_answer
    from pages p
    where v_cat = any(p.categories) and p.is_published
      and p.place_id in (select id from descendants(v_place));
  end if;

  -- 4. RÉSULTATS (keyset, jamais d'offset)
  select jsonb_agg(r order by r->>'rank' desc) into v_results from (
    select jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name,
      'categories', p.categories, 'cover', p.cover_url,
      'place', pl.name_fr, 'rating', p.rating_avg, 'rating_count', p.rating_count,
      'price_from', p.price_min_ar, 'price_unit', p.price_min_unit,
      'verified', p.verification_status,
      'rank', (
          ts_rank(p.search_vector, websearch_to_tsquery('diako', p_q)) * 3
        + (case when p.verification_status in ('documents','partner') then 1.2 else 0 end)
        + (p.rating_avg / 5.0) * 1.5
        + (p.completeness / 100.0)
        + (case when p.featured_until > now() then 2.0 else 0 end)
        - (case when p_lat is null then 0
                else least(earth_distance(ll_to_earth(p_lat,p_lng),
                                          ll_to_earth(p.lat,p.lng))/50000.0, 1.5) end)
      )
    ) as r
    from pages p
    left join places pl on pl.id = p.place_id
    where p.is_published
      and (p_q is null or p.search_vector @@ websearch_to_tsquery('diako', p_q)
                       or p.name % p_q)                       -- filet trigram
      and (v_cat is null or v_cat = any(p.categories))
      and (v_place is null or p.place_id in (select id from descendants(v_place)))
      and (p_price_max is null or p.price_min_ar <= p_price_max)
      and (p_amenities is null or not exists (
            select 1 from unnest(p_amenities) a
             where not exists (select 1 from page_amenities pa
                                where pa.page_id = p.id and pa.code = a)))
      and (not p_open_now or is_open_now(p.id))
      and (p_radius_km is null or p_lat is null or
           earth_box(ll_to_earth(p_lat,p_lng), p_radius_km*1000) @> ll_to_earth(p.lat,p.lng))
    order by 1 desc
    limit p_limit
  ) s;

  return jsonb_build_object('answer', v_answer, 'results', coalesce(v_results,'[]'::jsonb));
end $$;

grant execute on function search_all to anon, authenticated;
```
`descendants(place_id)` remonte le sous-arbre `ltree` (Ampefy inclut Analavory, le lac Itasy, la chute de la Lily). `is_open_now(page_id)` interroge `page_hours` / `page_closures` à l'heure de Madagascar (UTC+3).

### 6.6 La « barre de réponse » — ce qu'Andry a demandé

Bloc de réponse directe **au-dessus** des résultats, jamais une liste brute.

```
┌────────────────────────────────────────────────────────┐
│  🍲  Ravitoto sy henakisoa                             │
│      8 restaurants à Antananarivo · de 8 000 à 32 000 Ar│
├────────────────────────────────────────────────────────┤
│  [photo] Chez Mariette      12 000 Ar  ★4,6  1,2 km  ▸ │
│  [photo] Hotely Fanantenana  8 000 Ar  ★4,2  2,8 km  ▸ │
│  [photo] La Varangue        32 000 Ar  ★4,8  3,1 km  ▸ │
│                                    Voir les 8 →        │
└────────────────────────────────────────────────────────┘
```

```
┌────────────────────────────────────────────────────────┐
│  🏨  12 hébergements à Ampefy                          │
│      à partir de 45 000 Ar la nuit (par chambre)       │
│      [mini-carte]                                       │
│  Filtres : [Piscine] [Vue lac] [Bungalow] [< 100 000]  │
└────────────────────────────────────────────────────────┘
```

**Règles de conduite**, non négociables :
1. **Toujours dire l'unité et la base du prix** (« la nuit, par chambre, petit-déjeuner non inclus »).
2. **Toujours dire le périmètre** (« autour d'Antananarivo » quand le GPS a été refusé).
3. **Jamais de résultat vide** : replis en cascade — même lieu → lieu parent → 30 km → « personne n'a encore référencé d'hôtel à Ampefy, [ajoutez-en un] ».
4. **Quand la confiance est faible, poser une question** plutôt qu'afficher une liste fausse.

### 6.7 Autocomplétion, historique, alertes

On reprend la coquille UI de `SearchResults.tsx` (elle est bonne : plein écran sur mobile, historique supprimable, squelettes de chargement, debounce 280 ms) et on remplace son contenu :

- Suggestions **typées** (destination · établissement · plat · circuit · site) servies par un RPC unique `suggest(q)` (`limit 8`), au lieu de deux requêtes `ilike` parallèles.
- **Assainissement obligatoire** : la virgule et les parenthèses cassent les filtres PostgREST (`« Villa, Ivandry »` → 400 → 0 résultat chez Fonenako). Le piège est identique en voyage (« Hôtel Ampefy (bord du lac) »). Ici il disparaît structurellement puisqu'on passe par un RPC paramétré — mais toute requête PostgREST résiduelle doit passer par `sanitizeSearch()`.
- Historique local (`dk_search_history`, 6 entrées), **vraies tendances** agrégées depuis `search_trends` (et non le tableau statique en dur de Fonenako).
- **Alertes** : `saved_searches` + trigger de notification, transposé directement. Très forte valeur perçue en voyage.

### 6.8 Coût

| Élément | Mesure |
|---|---|
| Requêtes par recherche | **1** (le RPC renvoie réponse + résultats + facettes en un seul JSON) |
| Autocomplétion | 1 requête / 280 ms de debounce, `limit 8`, ~2 Ko |
| Cache client | react-query, `staleTime` 5 min sur `(q, filtres)` |
| Résultat complet | ~15 Ko pour 20 fiches (colonnes explicites, jamais `*`) |

---

## 7. Le fil infini

### 7.1 Ce qui change par rapport à Fonenako

| Fonenako | Diako |
|---|---|
| Grille de cartes 1/2/3/4 colonnes | **Un seul flux, pleine largeur**, `max-width` ~600 px centré |
| Pagination par **offset** `.range(from,to)` | **Curseur (keyset)** |
| `count:'exact'` en page 1 (scan complet) | **Supprimé** — un fil Facebook n'affiche jamais « 1 243 résultats » |
| Classement **client**, re-trié à chaque append | **Classement serveur**, figé par curseur |
| 43 colonnes par carte | **~12 colonnes**, cible < 1 Ko de JSON par post |

**Pourquoi le curseur, sans discussion** : avec l'offset, dès qu'un post est publié pendant le scroll, tout se décale d'un cran → doublons et sauts. Fonenako a colmaté avec un tiebreaker sur `id`, une déduplication par `Set`, un verrou d'append, un compteur `resetSeq` et un rollback silencieux — **~150 lignes de garde-fous, chacune écrite après un bug réel** (« 12 annonces disparaissaient définitivement du fil », « scroll infini figé avec le spinner qui tournait pour toujours »). La moitié de ce chapitre disparaît avec un curseur.

**Pourquoi le classement serveur** : chez Fonenako, le score est appliqué **après** le `.order()` serveur et **après** la pagination — on ne trie donc que les 12 lignes déjà reçues. Un post parfaitement pertinent publié il y a trois semaines ne remontera jamais. Et à chaque append, le `useMemo` re-trie tout le tableau → **les cartes sautent de place sous les doigts pendant le scroll**. Sur un fil infini, c'est insupportable.

### 7.2 Requête du fil

```sql
create or replace function get_feed(
  p_cursor text default null,          -- 'score|uuid'
  p_limit  int  default 8,
  p_tab    text default 'decouvrir'    -- decouvrir | abonnements | pres_de_moi
) returns setof jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  cur as (
    select split_part(p_cursor,'|',1)::real as s,
           nullif(split_part(p_cursor,'|',2),'')::uuid as i
  )
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind,
    'author', jsonb_build_object('id', pr.id, 'name', pr.display_name,
                                 'avatar', pr.avatar_url, 'badge', pr.badges),
    'page', case when p.page_id is null then null else
              jsonb_build_object('id', pg.id,'name', pg.name,'slug', pg.slug,
                                 'logo', pg.logo_url,'verified', pg.verification_status) end,
    'body', left(p.body, 400),
    'body_more', length(p.body) > 400,
    'media', p.media,                 -- {url,w,h} → ratio connu = zéro CLS
    'place', case when pl.id is null then null else
              jsonb_build_object('slug', pl.slug,'name', pl.name_fr) end,
    'promo', case when p.kind='promo' then
              jsonb_build_object('price', p.promo_price_ar,'old', p.promo_old_price_ar,
                                 'until', p.promo_until) end,
    'counts', jsonb_build_object('r', p.reactions_count,'c', p.comments_count),
    'featured', p.featured_until > now(),
    'created_at', p.created_at,
    'cursor', p.quality_score || '|' || p.id
  )
  from posts p
  join profiles pr on pr.id = p.author_id
  left join pages  pg on pg.id = p.page_id
  left join places pl on pl.id = p.place_id, cur, me
  where p.status = 'published'
    and (cur.s is null or (p.quality_score, p.id) < (cur.s, cur.i))
    and not exists (select 1 from blocks b
                     where b.blocker_id = me.uid and b.blocked_id = p.author_id)
    and (p_tab <> 'abonnements' or exists (
          select 1 from follows f where f.follower_id = me.uid
             and (f.target_id = p.author_id or f.target_id = p.page_id)))
  order by p.quality_score desc, p.id desc
  limit least(p_limit, 20);
$$;
```

### 7.3 Classement — la formule

On **garde les poids de Fonenako** (éprouvés, gratuits) mais on les déplace en base, dans une colonne `quality_score` recalculée par trigger à l'écriture et par `pg_cron` toutes les heures pour la décroissance de fraîcheur.

```
quality_score = PERTINENCE × (mis_en_avant ? 1,5 : 1)
              + QUALITÉ
              + (mis_en_avant ? 80 : 0)
```

**PERTINENCE** (plafond ~230), calculée par rapport au visiteur :
- Projet de voyage actif (`trip_requests`) : destination +40 · type d'établissement +40 · dates +30 · budget +30 → **plafond 160**
- **Destination recherchée +60** *(⚠ inversion par rapport à Fonenako : en voyage, on cherche là où on **n'est pas**. Le « +60 ville du visiteur » n'est conservé que pour les **restaurants** et les sorties.)*
- Affinités apprises en `localStorage` : destinations ×8, catégories ×7, gamme de prix ×4
- Recherches récentes : +20

**QUALITÉ** (plafond ~32) : fraîcheur `max(0, 12 − âge_en_jours)` + réactions `min(12, r)` + vues `min(8, ⌊v/20⌋)`

**Anti-répétition** — à reprendre **tel quel**, c'est la brique qui empêche un fil infini de tourner en rond, et elle coûte **zéro requête** : `localStorage dk_seen`, TTL 7 jours, plafond porté à **3 000 entrées** (un fil infini consomme plus qu'une grille), `IntersectionObserver` **partagé** (un seul pour toute la page), écriture groupée par debounce 1,2 s + flush sur `pagehide`. **Le snapshot est figé au chargement** → le fil ne se réordonne jamais sous les doigts. Les posts mis en avant ne redescendent jamais.

**Ajout que Fonenako n'a pas** : une **décroissance temporelle** des affinités (×0,9 par semaine). Sans elle, un vieux profil reste verrouillé sur ses habitudes de la première semaine.

**Diversité** : jamais plus de 2 posts consécutifs de la même page. Un post sponsorisé toutes les 8 positions au maximum, jamais en position 1.

### 7.4 Les médias — le vrai poste de dépense

| Règle | Valeur |
|---|---|
| Hébergement | **o2switch uniquement**, jamais Supabase Storage |
| Compression client | avant envoi : 0,6 Mo max, 1600 px max, WebWorker (`browser-image-compression` en `import()` dynamique) |
| Vignettes générées | **3 tailles** : 480 px (miniature), **720 px (fil pleine largeur)**, 1080 px (plein écran) — Fonenako n'en a qu'une, insuffisant pour un fil pleine largeur |
| Format | WebP, qualité 62-72 |
| Balises | `width`/`height` **obligatoires** (ratio stocké dans `media`), `loading="lazy"` sauf le **premier post** |
| Premier post | `fetchpriority="high"` — c'est lui le LCP dans un fil pleine largeur |
| Nombre de photos | 10 maximum par post, carrousel au-delà de 1 |
| **Vidéo** | **Reportée après le MVP.** Quand elle arrivera : 720p max, poster WebP, `preload="none"`, **lecture manuelle, jamais d'autoplay**, un seul `<video>` monté à la fois |

### 7.5 Pagination, cache et retour arrière

- `p_limit = 8` sur mobile (≈ 8 × 25 Ko d'images = 200 Ko par palier), 12 sur desktop
- `IntersectionObserver` sur une sentinelle, **ré-armé sur `posts.length`** (sinon, sur grand écran, la sentinelle reste visible et le fil se fige)
- **Retour arrière** : on sauvegarde le **curseur** + l'offset en pixels dans `sessionStorage`, et non pas N pages à recharger. C'est le gros gain du curseur : Fonenako devait re-télécharger toutes les pages déjà vues (`loadListingsBulk`).
- Realtime sur le fil : **aucun**. `useRefreshOnFocus` (intervalle minimum 60 s) et un bandeau « 3 nouveaux posts » non intrusif.

---

## 8. Les pages professionnelles et l'espace gestionnaire

### 8.1 La page publique `/p/:slug`

Reprise structurelle de `ProPage.tsx` + `get_pro_page_by_slug` : **toute la page en un seul RPC** (page + propriétaire + offres + avis), qui incrémente les vues au passage. Excellent pour la 3G, à garder absolument.

**Bloc commun à toutes les catégories** : couverture repositionnable + logo · nom, catégories, badge de vérification, note · lieu + repère en clair + bouton *Itinéraire* · horaires avec état **Ouvert / Ferme dans 40 min / Fermé** · boutons *Appeler* · *WhatsApp* · *Message* · *Demander* · galerie · à-propos · équipements en icônes · avis · posts qui citent l'établissement · établissements similaires.

**Onglet spécifique selon la catégorie :**

| Hôtel | Restaurant | Agence de voyage |
|---|---|---|
| **Chambres** : carte par type avec photo, capacité, lits, équipements, **prix + unité** | **Carte** : sections repliables → plats avec photo, prix, tags (végétarien, épicé), badge *Plat signature* | **Circuits** : durée, axe, difficulté, **prix par personne (base 2 pers.)**, aperçu de l'itinéraire |
| Bandeau saison en cours + « à partir de » | Ticket moyen, services (sur place / à emporter / livraison) | Inclus / non-inclus, prochains départs |
| Check-in/out, politique enfants, animaux, annulation, arrhes | Horaires par service, capacité, ambiance | Licence, flotte, langues des guides, assurance |
| Taxe de séjour **affichée à part** | Date de mise à jour de la carte | Acompte, conditions d'annulation |

### 8.2 Fraîcheur de l'information — spécificité du voyage

En immobilier, une annonce périmée disparaît. En voyage, **une page d'hôtel reste en ligne des années avec des tarifs de 2024** — et c'est ce qui détruit le plus vite la confiance. Trois mécanismes, dès le MVP :

1. `rates_checked_at` / `menu_updated_at` sur chaque page.
2. **Relance automatique** du professionnel (notification + email) à 90 jours : *« Vos tarifs sont-ils toujours à jour ? [Oui, confirmer] [Modifier] »* — un clic suffit.
3. **Badge de fraîcheur** visible : *Tarifs confirmés le 12/09/2026*. Au-delà de **6 mois** sans confirmation, le prix passe en « nous consulter » et la page **perd du classement**.

### 8.3 Espace gestionnaire

Cockpit privé, transposé de l'espace agence de Fonenako (vague26), dont la structure RLS par `fn_my_agencies()` se reprend quasiment à l'identique.

- **Tableau de bord** : vues 7/30 jours, demandes reçues, **délai de réponse moyen**, note, complétude de la page
- **Ma page** : éditeur par onglets, prévisualisation mobile
- **Mon catalogue** : chambres / menu / circuits — l'écran le plus important, à optimiser pour le pouce
- **Demandes** : file avec statut, réponse en un clic, modèles de réponse pré-écrits
- **Avis** : lire, répondre, signaler
- **Équipe** : plusieurs gérants par établissement, plusieurs établissements par compte *(un groupe qui possède 3 hôtels — Fonenako limitait à une vitrine par compte, on lève cette contrainte)*
- **Statistiques** : `get_page_timeseries` (garde d'accès stricte, `p_days` borné 7-90, `generate_series` pour inclure les jours à zéro, chaque sous-requête isolée par `EXCEPTION` → la page ne casse jamais)

### 8.4 Saisie du menu — le point de friction n°1

Naina ne saisira pas 45 plats dans un formulaire. Trois modes, du plus riche au plus permissif :

1. **Assisté** (recommandé) : elle tape « ravi… », l'autocomplétion propose *Ravitoto sy henakisoa* depuis le référentiel, elle confirme et met le prix. **3 secondes par plat** → 45 plats en ~3 minutes.
2. **Libre** : nom + prix, sans rattachement canonique. Le plat reste trouvable par le filet trigram, mais pas par le référentiel.
3. **Dégradé** : photo de la carte papier (`dining_profiles.menu_photos`). Non requêtable, mais **on ne bloque jamais**. Conversion assistée plus tard.

> Décision : **les trois modes sont acceptés dès le MVP.** Un menu photographié vaut mieux qu'une page vide, et la page affiche alors *« Carte non détaillée — [Aidez-nous à la saisir] »*.

---
## 9. Sécurité, droits d'accès et conformité

Fonenako a traversé trois audits successifs et porte des cicatrices utiles. **On reprend les remèdes dès le jour 1 plutôt que de rejouer les blessures.**

### 9.1 Les cinq règles non négociables

**① La fermeture des données personnelles se fait au niveau TABLE, puis colonne par colonne.**
La leçon technique majeure du projet frère : `REVOKE SELECT (colonne)` **ne ferme rien**, parce que Supabase pose un `GRANT` au niveau table que le revoke colonne n'annule pas. La seule méthode qui marche :

```sql
do $$
declare c record;
begin
  revoke select on public.profiles from anon;
  for c in select column_name from information_schema.columns
            where table_schema='public' and table_name='profiles'
              and column_name not in ('phone','email','last_ip','last_ip_at')
  loop
    execute format('grant select (%I) on public.profiles to anon', c.column_name);
  end loop;
end $$;
```
**Conséquence directe et permanente** : tout `select('*')` anonyme renvoie **401**. Il faut donc des listes de colonnes explicites **partout**, y compris dans les scripts de partage et les pages pré-rendues. Chez Fonenako, l'oubli a cassé silencieusement l'aperçu Open Graph (le partage affichait le logo au lieu de la photo). **Et chaque nouvelle colonne exige un `GRANT` explicite** — le cas `delivered` de vague17 l'a reprouvé.

**② Toute colonne à valeur commerciale est protégée par trigger.**
`featured_until`, `verification_status`, `rating_avg`, `is_published`, `price_min_ar`. Fonenako a dû verrouiller le boost **deux fois** : un particulier pouvait se booster soit par un `INSERT` direct sur une table oubliée, soit par un simple `PATCH` PostgREST sur `listings.boosted_until`.

```sql
create or replace function guard_featured() returns trigger
language plpgsql as $$
begin
  if new.featured_until is distinct from old.featured_until
     and coalesce(current_setting('dk.allow_featured', true),'') <> '1' then
    new.featured_until := old.featured_until;   -- restauration silencieuse
  end if;
  return new;
end $$;
create trigger trg_guard_featured before update on pages
  for each row execute function guard_featured();
```
Le drapeau `dk.allow_featured` n'est posé que par la RPC `SECURITY DEFINER` légitime, via `set_config(..., true)` (portée transaction).

**③ Aucun identifiant utilisateur ne vient du client.**
Diako-V2 fait exactement l'inverse : **tous** ses endpoints PHP acceptent un `user_id` envoyé par le navigateur. `curl -d '{"user_id":1,"amount":999999999}'` donne des crédits illimités. Avec Supabase : `auth.uid()` et RLS, jamais un identifiant du corps de la requête.

**④ Aucun document d'identité dans un dossier servi par le web.**
Bucket Supabase **privé** + URL signées de courte durée. Diako-V2 dépose les scans de CIN dans `backend/uploads/`, dont l'index Apache est **publiquement listable**.

**⑤ Aucune valeur accordée sans confirmation serveur.**
Pas de « statut vérifié » décidé dans le navigateur (`setVerified(true)` de Diako-V2), pas de paiement validé sans preuve, pas de solde modifié côté client.

### 9.2 RLS table par table

| Table | anon | authenticated | propriétaire | admin |
|---|---|---|---|---|
| `places`, `dishes`, `amenities`, `attractions`, `events` | SELECT | SELECT | — | ALL |
| `pages` | SELECT (colonnes publiques, **sans** `phone`/`email`/`whatsapp`) | SELECT idem | ALL sur les siennes via `fn_my_pages()` | ALL |
| `room_types`, `season_rates`, `menu_items`, `tours`, `tour_*`, `rental_offers` | SELECT si page publiée | idem | ALL sur celles de ses pages | ALL |
| `posts` | SELECT si `status='published'` et `visibility='public'` | + posts « abonnés » des comptes suivis | ALL sur les siens | ALL |
| `reactions`, `comments`, `follows` | SELECT | INSERT/DELETE sur les siens | — | ALL |
| `reviews` | SELECT si `approved` | INSERT (1 par cible), UPDATE sur le sien | `owner_reply` sur ses pages | ALL |
| `bookings` | **INSERT seul** (visiteur non connecté peut demander) | INSERT + SELECT sur les siennes | SELECT/UPDATE sur celles de ses pages | ALL |
| `trip_requests` | SELECT si `active` (permet aux pros de voir) | ALL sur la sienne | — | ALL |
| `trip_offers` | — | SELECT sur celles reçues | ALL sur celles émises | ALL |
| `conversations`, `messages` | — | **participants uniquement** | — | — |
| `notifications`, `push_subscriptions`, `saved_searches` | — | **les siennes uniquement** | — | — |
| `reports` | — | INSERT | — | SELECT/UPDATE |
| `blocks` | — | ALL sur les siens | — | — |
| `verifications` (documents) | — | INSERT + SELECT sur les siens | — | ALL |

Deux règles de performance héritées :
- `auth.uid()` **toujours enveloppé dans un sous-`SELECT`** (`(select auth.uid())`) dans les policies — sinon l'authentification est réévaluée **ligne par ligne**.
- `search_path` **fixé** sur toutes les fonctions `SECURITY DEFINER`, et `REVOKE EXECUTE` sur toutes les fonctions retournant `trigger`.

### 9.3 Contacts des établissements : publics ou non ?

**Décision : publics.** Contrairement à Fonenako (où le téléphone du vendeur est une donnée personnelle monnayable, protégée par le paywall à 1111 FNK), le numéro d'un hôtel est **une information commerciale que l'établissement veut voir diffusée**. Le cacher derrière une connexion tuerait l'usage.

En revanche :
- **Les coordonnées du voyageur sont privées** : seul le pro destinataire d'une `booking` les voit.
- Les clics sur *Appeler* / *WhatsApp* sont **comptés** (`track_lead`) — c'est l'argument de vente auprès du pro : *« 47 personnes vous ont appelé depuis Diako ce mois-ci. »*
- Un `revoke`/`grant` colonne par colonne reste en place sur `pages` pour empêcher l'**aspiration en masse** de tous les contacts en une requête.

### 9.4 Authentification et rôles

- **Email + code OTP à 6 chiffres** via SMTP o2switch (flux maison de Fonenako, avec compteur de tentatives : au-delà de 5, le code est invalidé). Les emails natifs Supabase sont désactivés.
- **Google** en un clic. **Facebook** prêt mais derrière un drapeau `app_flags` (une ligne SQL l'active sans redéployer — excellent motif, à reprendre).
- **Rôles** : `voyageur` · `pro` · `moderateur` · `admin`. ⚠️ **Ne pas rejouer l'erreur de Fonenako** où `profiles.role` sert à la fois de plan d'abonnement **et** de rôle admin, en concurrence avec `user_roles`. Sur Diako : `user_roles` est la **seule** source de vérité des droits ; le plan d'abonnement est une colonne distincte.
- **Trigger anti-escalade** sur `profiles` : un membre ne peut ni se donner un rôle admin, ni s'auto-valider sa vérification.
- **Jamais de garde d'accès sur un état gardé en mémoire React.** Diako-V2 verrouille tout son routeur sur deux booléens non persistés → l'accueil est structurellement inatteignable. Un garde lit toujours son état depuis la base et **ne bloque jamais la route racine** ; au pire, une bannière non bloquante.

### 9.5 Vérification des établissements

Niveaux **cumulatifs**, et le badge doit dire **ce qui** est vérifié (« identité vérifiée » ≠ « licence vérifiée ») pour ne pas engager la responsabilité de Diako sur la qualité du service :

`non vérifié` → `téléphone vérifié` (OTP) → `lieu vérifié` (GPS confirmé ou visite) → `documents vérifiés` (NIF, STAT, licence d'agence, carte de guide, agrément MNP, assurance) → `partenaire Diako`

Qui peut créer une page ? **Auto-déclaratif** (comme Fonenako), sinon rien ne démarrera. Contrepartie : de fausses pages créées par des rabatteurs. Parades : signalement en un clic depuis chaque page · **le badge fait la différence dans le classement** · réclamation de page (« Je suis le gérant de cet établissement ») avec vérification par appel sur le numéro public.

### 9.6 Modération

Trois niveaux : **automatique** (masquage au-delà de 3 signalements distincts, limitation de débit sur les écritures sociales — Fonenako n'en a **aucune**, rien n'empêche un script d'insérer des milliers de commentaires via l'API REST) · **communautaire** (signaler, bloquer, masquer un auteur ou une page dans son fil) · **humaine** (file admin priorisée).

**Photos volées à Booking ou à un concurrent** : classique du secteur. Politique explicite dans les CGU, retrait sur signalement, suspension au deuxième manquement.

**Faux avis et règlements de comptes entre voisins** : un avis par personne et par cible, historique du compte visible, badge *Avis vérifié* quand l'avis fait suite à une `booking` passée par Diako, réponse du professionnel toujours possible.

### 9.7 Conformité

Bannière de consentement (reprise de Fonenako), politique de confidentialité et CGU **avant l'ouverture au public**, suppression de compte effective (`delete_user_completely`), et une mention claire : **Diako est un annuaire et un réseau social, pas un vendeur de voyages** — il ne garantit ni les prix affichés ni la prestation.

---

## 10. Performance, coûts et exploitation

### 10.1 Budget de performance (référence : Android à 400 000 Ar, 3G, écran 390 px)

| Indicateur | Cible | Comment on y arrive |
|---|---|---|
| **LCP** | < 2,5 s | Squelette statique hors de `#root` dans `index.html`, CSS **non bloquant** (transformé en `preload` au build puis appliqué par JS — mesuré : −1 s de FCP chez Fonenako), première image du fil préchargée |
| Bundle initial | < 200 Ko brotli | `manualChunks` : react-vendor, supabase-vendor, radix-vendor, maps-vendor (Leaflet, page carte uniquement) |
| Premier écran | < 150 Ko d'images | 1 post visible, vignette 720 px WebP |
| CLS | < 0,05 | `width`/`height` sur **toutes** les images (ratio stocké dans `media`), hauteurs réservées |
| Requêtes au chargement | ≤ 3 | fil + profil + compteur de non-lus |

> ⚠️ **Deux régressions vécues, à traiter comme des interdits absolus :**
> 1. **Ne jamais supprimer le `manualChunk` radix-vendor** : cela change l'ordre d'initialisation des modules → *« can't access lexical declaration before initialization »* → **page blanche sous Firefox** (Chrome tolère).
> 2. **Le service worker doit avoir `skipWaiting()` + `clientsClaim()`** : sans eux, l'ancien SW sert un cache pointant vers des fichiers JS supprimés → **page blanche pour tous les visiteurs après chaque déploiement**.
>
> Et une leçon de dosage : le précache PWA de Fonenako tirait **154 fichiers / 3,7 Mo** derrière le dos du visiteur juste après `load` — l'accueil passait à 9,6 s alors que la page était interactive à 4,3 s. **Ne précacher que la coquille** (~9 globs).

### 10.2 Egress — le chiffrage

Hypothèses : 1 visite = 3 pages, 25 posts vus, 1 recherche.

| Poste | Par visite | Où il est servi |
|---|---|---|
| JSON du fil (25 posts × ~0,9 Ko) | ~23 Ko | **Supabase** |
| Recherche (1 RPC) | ~15 Ko | **Supabase** |
| Fiche de page (1 RPC complet) | ~25 Ko | **Supabase** |
| Profil, compteurs, notifications | ~7 Ko | **Supabase** |
| **Total Supabase** | **~70 Ko** | |
| Images (25 vignettes 720 px ≈ 45 Ko) | ~1,1 Mo | **o2switch** (hors quota Supabase) |

| Trafic mensuel | Egress Supabase | Verdict |
|---|---|---|
| 1 000 visites | 70 Mo | ✅ largement sous les 2 Go gratuits |
| 10 000 visites | 700 Mo | ✅ confortable |
| **~28 000 visites** | **~2 Go** | ⚠️ **seuil de bascule** |
| 100 000 visites | ~7 Go | 💰 Supabase Pro : **25 $/mois** + 0,09 $/Go au-delà de 250 Go → ~25 $/mois |

**Conclusion** : l'offre gratuite tient jusqu'à ~25 000 visites/mois **à condition absolue que les images ne passent jamais par Supabase**. C'est ce seul point qui fait la différence entre 70 Ko et 1,2 Mo par visite — un facteur **17**.

Côté o2switch (mutualisé) : 100 000 visites ≈ 110 Go/mois d'images. Le RTT mesuré est de 185 ms avec un débit de 180-240 Ko/s. Si ça devient le facteur limitant, la parade est un **CDN gratuit devant les images** (Cloudflare) — décision à prendre vers 50 000 visites/mois, pas avant.

### 10.3 Supervision

- `page_views` : module autonome, `fetch keepalive`, aucune lecture, zéro poids sur le bundle
- Compteurs d'egress Supabase relevés **chaque semaine** (Fonenako a découvert son dépassement trop tard, à un mois d'une suspension)
- **Sentry ou équivalent** : Fonenako n'a **rien** (`ErrorBoundary` se contente d'un `console.error`), et un bug de recherche en production y passerait inaperçu. Sur Diako, on le met dès le Lot 0 — c'est gratuit jusqu'à 5 000 erreurs/mois
- Veille santé du site déjà en place sur le VPS : y ajouter `diako.fonenako.mg`

### 10.4 Référencement

C'est **le canal d'acquisition n°1**, et il colle exactement aux requêtes citées par Andry.

- **Silos** : `/hotels/ampefy`, `/restaurants/antananarivo`, `/agences-voyage/nosy-be`, `/ou-manger/ravitoto`, `/quand-partir/sainte-marie`. Texte éditorial **unique** par combinaison (anti-contenu dupliqué).
  ⚠️ **Ne pas reproduire la double copie TS/PHP de Fonenako** — le contenu y existe en **trois** exemplaires à maintenir à la main, avec un avertissement en commentaire *« toute modification ici doit y être reportée »*. Sur Diako : une **seule source** (table `silos` en base), le PHP est généré.
- **Données structurées riches** : `Hotel`, `Restaurant` **avec `hasMenu` / `Menu` / `MenuSection` / `MenuItem`** (c'est exactement ce qui fera ressortir un plat dans Google), `TravelAgency`, `TouristAttraction`, `openingHoursSpecification`, `aggregateRating`, `priceRange`.
  ⚠️ Vérifier que le JSON-LD de page **n'écrase pas** celui du site : chez Fonenako, `document.querySelector('script[type="application/ld+json"]')` écrase le **premier** trouvé — ouvrir une fiche détruit le balisage de marque. *(Et un `RentalCarListing` pour une location immobilière traîne en production depuis un copier-coller jamais relu.)*
- **Aperçus de partage** : `meta-proxy.php` déclenché par User-Agent. À Madagascar, le partage WhatsApp/Messenger est le **premier** canal d'acquisition — un aperçu cassé coûte cher.
- **`robots.txt` ouvert aux agents IA** (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) + `llms.txt` enrichi de la liste des destinations. C'est encore plus rentable en voyage : les gens demandent aux IA « où dormir à Ampefy ».
- **Sitemap** : pages, destinations, plats populaires, avec `<image:image>` — décisif pour la nourriture et les hôtels.

---

## 11. Identité, design et expérience mobile

### 11.1 Palette

Distincte de Fonenako (bleu `#2994C0` / `#1E6B8C`), en repartant des jetons turquoise/corail déjà présents dans `index.css` de Diako-V2 :

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `--dk-primary` | `#0E7C86` | `#2DD4BF` | Actions principales, liens, états actifs |
| `--dk-primary-soft` | `#16A9B5` | `#0E7C86` | Survols, fonds d'accent |
| `--dk-accent` | `#F4633A` | `#FF7A52` | CTA secondaires, badges promo, cœur |
| `--dk-sand` | `#F7EFE3` | `#1C1A17` | Fonds chauds, séparateurs de sections |
| `--dk-ink` | `#10262B` | `#EAF2F3` | Texte |
| `--dk-muted` | `#5B6E72` | `#93A6AA` | Texte secondaire |

> Le teal foncé `#0E7C86` est **la** couleur des états actifs et du texte sur blanc (contraste AA). Le turquoise clair reste décoratif. C'est la leçon de Fonenako, où `#2994C0` sur blanc ne fait que 3,43:1 et où il a fallu basculer les états actifs sur le ton foncé. **Vérifier chaque paire au contrastomètre avant de figer.**

**Typographie** : Inter variable **auto-hébergée** (sous-ensemble latin, 47 Ko) — aucun appel à Google Fonts, c'est un aller-retour DNS + TLS de moins sur 3G.

### 11.2 Ce qu'on reprend de Fonenako sans discuter

- **La couche CSS de densité mobile < 640 px** qui resserre d'un coup le rythme vertical de **toutes** les pages. ⚠️ Nuance : un fil pleine largeur a moins d'habillage et plus de contenu — ne garder que les titres, les onglets et le filet anti-débordement, sinon les surcharges `!important` deviennent gênantes.
- Le **filet de sécurité global** : `#root { overflow-x: clip }`, `overflow-wrap: break-word` sur titres et paragraphes, `[role=tablist]` défilant, `max-width: 100%` sur les images et les boutons.
- **Cibles tactiles 44 × 44 px** (classe `.dk-tap` qui étend la zone de frappe sans changer le visuel) et **`font-size: 16px` sur les champs** (empêche le zoom automatique iOS).
- **`BottomNav` à 5 items avec FAB central** : Accueil · Explorer · **+ Publier** · Je cherche · Messages. Cliquer le logo alors qu'on est déjà à l'accueil = retour en haut + rechargement de la première page.
- **`ErrorBoundary` remonté à chaque navigation** (`key={pathname}`), `InstallPrompt` (PWA, y compris les instructions manuelles iOS), bannière cookies qui attend son tour.
- **`safe-area`** iOS partout.

### 11.3 Langues

| Élément | Au MVP | Plus tard |
|---|---|---|
| Interface | Français | Malgache complet |
| **Recherche** | **Comprend le malgache** (alias, `unaccent`, trigram, désambiguïsation « hotely ») | — |
| Contenu pro | Le pro saisit dans sa langue, champs `_mg` prévus | Traduction assistée |
| Guide pratique | Français | Bilingue (comme le guide juridique de Fonenako) |

La structure i18n est posée dès le Lot 0 (clés externalisées) même si une seule langue est livrée : Fonenako a tout écrit en dur dans le JSX et le rattrapage y est aujourd'hui un chantier à part entière.

### 11.4 Réseau dégradé

Bandeau *« Connexion perdue — les nouvelles publications s'afficheront au retour »*, cache `stale-while-revalidate` sur le fil, **`Background Sync` volontairement désactivé** (rejouer une connexion ou un paiement crée des doubles écritures), et jamais d'écran blanc : squelettes partout.

---

## 12. Monétisation

### 12.1 Principe

**Gratuit pour tout le monde au lancement**, exactement comme la stratégie agences de Fonenako. On ne facture rien tant qu'on n'a pas prouvé qu'on apporte des demandes. Le compteur de la page pro (*« 240 vues · 12 demandes ce mois-ci »*) fait la démonstration à notre place.

### 12.2 Grille cible (à activer vers le 6ᵉ mois)

| Offre | Prix | Contenu |
|---|---|---|
| **Page Découverte** | **Gratuit** | Page complète, catalogue, avis, demandes, statistiques de base. **Sans limite de durée.** |
| **Page Pro** | **35 000 Ar/mois** (350 000 Ar/an, 2 mois offerts) | Badge *Partenaire* · statistiques détaillées · réponse aux avis mise en avant · plusieurs gérants · priorité de classement à qualité égale · réponse aux projets de voyage |
| **Mise en avant** | **20 000 Ar / 7 jours** sur une destination ou une catégorie | Le post ou la page remonte, avec la mention *Sponsorisé* |
| **Pack lancement destination** | 150 000 Ar | Saisie complète de la fiche par nos soins + 20 photos + 1 mois de mise en avant |

Repères de cohérence : Fonenako positionne Premium à 29 000 Ar et Pro à 249 000 Ar/mois. 35 000 Ar/mois pour un hôtel qui reçoit ne serait-ce que **deux** demandes par mois est un rapport évident à défendre.

### 12.3 Paiement

**Mvola · Orange Money · Airtel Money · virement.** Validation **manuelle** au démarrage : le pro envoie, dépose sa capture + la référence de transaction, un admin valide dans la console. C'est exactement le circuit de Fonenako (`payments` + `payment_approvals` + bucket privé `payment-proofs`), il fonctionne, et il évite toute intégration d'API opérateur.

> ⚠️ **Ne jamais reproduire le `payment.php` de Diako-V2**, qui écrit `status='success'` **en dur** sans appeler aucun opérateur, et dont le front demande une capture et une référence… qu'il n'envoie même pas au serveur. Le contrôle anti-fraude y est purement cosmétique.

**Pas de monnaie interne.** Le système FNK de Fonenako (1 FNK = 18 Ar, portefeuille, grand livre, recharges) a été entièrement écrit puis **masqué par un drapeau**. Sur un marché à convaincre, une monnaie intermédiaire est une friction pure.

### 12.4 Ce qui restera gratuit pour toujours

Créer une page · publier son catalogue · recevoir des demandes · répondre aux avis. **Le jour où être présent sur Diako coûte de l'argent, Diako se vide** — et un annuaire vide ne vaut rien.

---

## 13. Contenu initial et amorçage

**C'est le vrai risque du projet.** Un réseau vide n'attire personne, et Diako sera jugé sur sa première recherche.

### 13.1 Règle d'or

> **Aucune communication publique avant 300 fiches complètes.**
> « Complète » = photo de couverture + lieu + contact + **au moins un prix** (une chambre tarifée ou cinq plats).

### 13.2 Périmètre pilote

| Priorité | Zone | Cible | Pourquoi |
|---|---|---|---|
| **1** | **Antananarivo — restaurants** | **150 fiches** avec menu | La requête « où manger » est quotidienne, la cible est urbaine et connectée, et c'est le terrain d'Andry |
| **2** | **Ampefy + Antsirabe** | **80 fiches** (hébergements + restaurants) | Destinations week-end n°1 depuis Tana, faciles à couvrir en 2 déplacements, et c'est **l'exemple donné par Andry** |
| **3** | **Nosy Be** | **50 fiches** | Vitrine touristique, attire le trafic étranger et les agences |
| **4** | **Agences de voyage** | **20 fiches** avec circuits | Ce sont elles qui paieront ; les référencer tôt crée la relation |

**Total : ~300 fiches**, plus les référentiels : ~150 lieux, ~150 plats, ~60 équipements, ~40 sites et parcs.

### 13.3 D'où vient la donnée

1. **Le référentiel des plats** : travail éditorial de 2 à 3 jours. Non délégable. **À faire en premier, avant même le Lot 0** — c'est un travail hors code qui peut avancer en parallèle du développement.
2. **Le référentiel des lieux** : les 23 villes de Fonenako servent d'amorce, on y ajoute ~130 destinations touristiques avec centroïdes, alias, saisons et accès.
3. **Les fiches** : collecte terrain + pages Facebook existantes + import assisté. **Le processus d'import en masse déjà rodé sur Fonenako** (compression 1280 px q75, upload o2switch par `X-API-Key`, pacing 3 s) se réutilise tel quel.
4. **Les photos** : les siennes, ou celles du pro avec son accord écrit. **Jamais celles de Booking** — c'est le premier motif de litige du secteur.

### 13.4 Recruter les 50 premiers pros

Séquence en 4 temps, calquée sur le kit de lancement agences de Fonenako :

1. **On crée la fiche d'abord** (données publiques : nom, lieu, téléphone, photos publiques de leur page Facebook, avec mention de la source).
2. **On appelle** : *« Votre établissement est déjà sur Diako, 40 personnes l'ont vu cette semaine. Voulez-vous en prendre le contrôle et corriger vos tarifs ? »* — c'est **beaucoup** plus fort que « inscrivez-vous ».
3. **Réclamation de page** en 3 minutes, vérification par appel sur le numéro public.
4. **Rappel à J+30** avec les statistiques réelles.

### 13.5 Contenus de lancement

10 récits de voyage écrits par nous (Ampefy, Antsirabe, RN7) · 5 guides pratiques (*Quand partir où* · *Aller à Morondava* · *Manger malgache pour moins de 10 000 Ar* · *Ampefy en un week-end* · *Choisir son agence*) · les fiches des 40 sites majeurs avec droits d'entrée et fady · le calendrier des événements 2026-2027 (Donia, Madajazzcar, baleines, fête du litchi).

Les **pages Facebook existantes** sont le canal de lancement, comme pour hourdis et Tsena Imprimante.

---

## 14. Lotissement, planning et livrables

Base : une personne assistée par IA, à partir du **04/08/2026**. Les durées sont en semaines calendaires.

| Lot | Période | Contenu | Livrable vérifiable |
|---|---|---|---|
| **🔴 Lot 0-bis** | **immédiat** | **Purge sécurité** : supprimer `backend/` du serveur, purger les CIN exposés, supprimer la ligne `__audit_probe__` | `https://diako.fonenako.mg/backend/` renvoie 404 |
| **Lot 0 — Socle** | 04/08 → 15/08 (2 sem) | Nouveau dépôt + projet Supabase · fork du socle Fonenako (auth OTP+Google, profils, chaîne d'images o2switch, PWA, densité mobile, `.htaccess` versionné, `tsc` au build, Sentry) · charte Diako · CI | On se connecte, on modifie son profil, on téléverse une photo compressée avec vignette. Build < 200 Ko. |
| **Lot 1 — Référentiels** | 18/08 → 29/08 (2 sem) | `places` + alias + saisons + accès · `dishes` + alias · `amenities` · extensions `unaccent`/`pg_trgm`/`earthdistance` · console de saisie admin · **import des 150 lieux et 150 plats** | `resolve_place('ampefi')` → Ampefy · `resolve_dish('ravi-toto')` → ravitoto |
| **Lot 2 — Pages pro** | 01/09 → 19/09 (3 sem) | `pages` + profils spécialisés + horaires structurés · `room_types` + `season_rates` · `menu_sections` + `menu_items` (saisie assistée) · `tours` + jours + prix par groupe · assistant de création par catégorie · page publique `/p/:slug` en 1 RPC · espace gestionnaire | Un hôtelier crée sa page et saisit 3 chambres en < 15 min **depuis un téléphone**. Une restauratrice saisit 45 plats en < 5 min. |
| **Lot 3 — Recherche** | 22/09 → 10/10 (3 sem) | `tsvector` + index · résolution d'intention · désambiguïsation « hotely » · RPC `search_all` · **barre de réponse** · filtres + facettes · autocomplétion · carte par viewport · pages destination + silos SEO | **Les 3 requêtes canoniques répondent juste** (Ampefy · ravitoto · circuit 5 jours sud), en moins de 400 ms |
| **Lot 4 — Fil** | 13/10 → 24/10 (2 sem) | `posts` + tags lieu/page/plat · fil par curseur · `quality_score` serveur · anti-répétition · composer · réactions, commentaires paginés, partage, enregistrement · **modération (`reports`, `blocks`)** | On scrolle 100 posts sans doublon ni saut. Un post signalé 3 fois se masque. |
| **Lot 5 — Relation** | 27/10 → 07/11 (2 sem) | `bookings` · `trip_requests` + `trip_offers` · messagerie (Realtime) · notifications + push VAPID · avis multi-critères + réponse du pro · alertes de recherche | Une demande envoyée déclenche un push chez le pro et une réponse revient dans la messagerie |
| **🚀 Bêta fermée** | **27/10/2026** | Ouverture à ~30 pros et 50 voyageurs, sur les fiches déjà saisies | |
| **Lot 6 — Contenu** | **en continu, dès le 04/08** | Référentiels · 300 fiches · 10 récits · 5 guides · 40 sites · calendrier événements | 300 fiches **complètes** en base |
| **Lot 7 — Exploitation** | 10/11 → 21/11 (2 sem) | Console admin + modération · vérification des pros · statistiques pro détaillées · mise en avant (verrouillée par trigger) · paiements manuels · CGU + confidentialité | Un admin valide une vérification, active une mise en avant, traite un signalement |
| **🚀 Ouverture publique** | **24/11/2026** | Communication sur les pages Facebook | |

**Chemin critique** : Lot 1 → Lot 2 → Lot 3. Sans référentiels, pas de pages exploitables ; sans catalogue, pas de recherche ; sans recherche, pas de produit. **Le Lot 6 est le vrai risque de glissement** — il ne dépend pas du code.

**Critères de « fini » applicables à chaque lot** : les critères d'acceptation passent sur un vrai téléphone Android en 3G · aucun `select('*')` · aucune nouvelle souscription Realtime hors chat/notifications · `types.ts` régénéré · migration unique et rejouable · déployé en ligne.

---

## 15. Risques et parades

| # | Risque | P | Impact | Parade |
|---|---|---|---|---|
| R1 | **Le contenu ne suit pas** — 300 fiches non atteintes, produit vide au lancement | **Élevée** | **Fatal** | Lot 6 démarré **avant** le code · périmètre réduit à 2 zones · reporter le lancement plutôt que d'ouvrir à vide · budgéter une aide à la saisie |
| R2 | **Les pros ne mettent pas à jour leurs tarifs** | Élevée | Élevé | `rates_checked_at` · relance automatique à 90 j en un clic · badge de fraîcheur · déclassement à 6 mois |
| R3 | **Deux produits en parallèle, un seul porteur** — Diako avance, Fonenako recule | **Élevée** | Élevé | Lots courts et livrables · règle explicite : aucune évolution Fonenako pendant un lot Diako, hors correctif bloquant · Fonenako est en production et **prioritaire en cas d'incident** |
| R4 | **Projet non terminé** *(le blocage le plus documenté)* | **Élevée** | **Fatal** | Chaque lot est déployable et utile seul · démonstration à un vrai pro à la fin de chaque lot · point d'avancement hebdomadaire |
| R5 | Dépassement d'egress Supabase | Moyenne | Élevé | Images **jamais** sur Supabase · Realtime limité au chat · relevé hebdomadaire · Pro à 25 $/mois si besoin |
| R6 | Faux établissements, photos volées | Moyenne | Moyen | Réclamation de page vérifiée par appel · badge dans le classement · retrait sur signalement |
| R7 | Faux avis, règlements de comptes | Moyenne | Moyen | 1 avis par personne et par cible · badge *Avis vérifié* · réponse du pro · modération |
| R8 | Facebook lance un annuaire local | Faible | Élevé | Notre fossé est le **référentiel** (plats, alias, saisons, temps de trajet), pas la technologie |
| R9 | Litige juridique (avis diffamatoire, prix erroné) | Faible | Moyen | CGU claires · Diako n'est ni vendeur ni garant · droit de réponse · retrait sous 48 h |
| R10 | Ambiguïté « hotely » mal gérée → recherche perçue comme cassée | Moyenne | Moyen | Traitée dès le Lot 3 : drapeau `ambiguous` + question courte |
| R11 | La sécurité de Diako-V2 reste en ligne pendant les travaux | **Certaine si rien n'est fait** | **Élevé** | Lot 0-bis, aujourd'hui |

---

## 16. Décisions à trancher

Chacune bloque ou oriente un lot. Recommandation donnée pour chacune.

| # | Question | Options | **Recommandation** | Conséquence |
|---|---|---|---|---|
| **D1** | Cible principale au lancement | (a) Malgache urbain (b) Touriste étranger (c) Diaspora | **(a)**, avec le contenu (b) préparé | Tout est en ariary, priorité aux restaurants de Tana et aux week-ends |
| **D2** | Réservation ou demande de devis | (a) Demande seule (b) Réservation ferme | **(a)** | Pas de calendrier temps réel, pas de paiement, pas de responsabilité au MVP |
| **D3** | Destination pilote | (a) Ampefy (b) Antsirabe (c) Nosy Be | **Tana (restos) + Ampefy** | Cadre le Lot 6 |
| **D4** | Qui peut créer une page | (a) Auto-déclaratif (b) Vérification préalable | **(a)** + réclamation vérifiée | Sinon rien ne démarre |
| **D5** | Avis ouverts à tous | (a) Ouverts (b) Réservés à ceux passés par Diako | **(a)** + badge *Vérifié* | Du volume tout de suite, modération a posteriori |
| **D6** | Guides indépendants référencés en direct | (a) Oui (b) Non, via les agences | **(a)**, mais après le MVP | Court-circuite les agences, qui sont les payeurs |
| **D7** | Devise | (a) Ariary seul (b) Ariary + EUR | **(a)** au MVP, (b) pour les circuits ensuite | Un taux figé dans le code sera faux en 3 mois |
| **D8** | Tarif résident / non-résident | (a) Afficher les deux (b) Résident seul | **(a)**, ouvertement | C'est la pratique réelle et légale ; le cacher créerait de la défiance |
| **D9** | Badge « Bon prix » sur les nuitées | (a) Oui (b) Non | **(b) au lancement** | Excellent pour l'utilisateur, mal vécu par les pros — or ce sont eux qui paieront |
| **D10** | Comptes partagés avec Fonenako | (a) Séparés (b) SSO croisé | **(a)** | Simplicité ; le SSO reste possible plus tard |
| **D11** | Que fait-on des comptes du Diako actuel | (a) Base vide (b) Migrer | **(a)** | 2 comptes concernés, dont un de test |
| **D12** | Nom de domaine | (a) `diako.fonenako.mg` (b) `diako.mg` dédié | **(a)** pour développer, **(b) avant l'ouverture publique** | Un sous-domaine de Fonenako brouille la marque à long terme |
| **D13** | Classification officielle des hôtels | étoiles / ravinala / les deux | **Vérifier auprès du Ministère du Tourisme avant de figer le champ** | Bloque une colonne de `pages` |
| **D14** | Portée du fil | (a) National (b) Par destination | **(a)** avec pondération de proximité + onglet *Près de moi* | Évite d'enfermer l'utilisateur dans sa ville |

---

## Annexe A — Correspondance Fonenako → Diako

| Brique Fonenako | Équivalent Diako | Verdict | Effort |
|---|---|---|---|
| Chaîne d'images (`o2upload.php`, JWT + magic bytes + anti-IDOR, vignette WebP, compression client) | Idem, **3 tailles** au lieu d'1 | réutiliser | S |
| Politique anti-egress (colonnes nommées, Realtime chat seul, refresh au focus) | Identique, **encore plus critique** | réutiliser | S |
| Optimisation LCP (squelette hors `#root`, CSS non bloquant, hauteur au pixel) | Idem, appliquée au **premier post** du fil | adapter | M |
| `manualChunks` Vite + précache SW réduit à la coquille | Tel quel, y compris `maps-vendor` isolé | réutiliser | S |
| Couche CSS densité mobile < 640 px + Inter auto-hébergée + `.fnk-tap` | Tel quel, allégée pour un fil pleine largeur | adapter | S |
| `.htaccess` (HTTPS, CSP, cache différencié, `-Indexes`, rate limit sur `.php` seulement) | Copier, ajuster les domaines CSP | réutiliser | S |
| PWA, `InstallPrompt`, `CookieConsent`, `ErrorBoundary` par pathname | Tel quel | réutiliser | S |
| `BottomNav` 5 items + FAB central + `fnk:home-refresh` | Tel quel, items voyage | réutiliser | S |
| **`pro_pages`** (slug, cover+offset, services, galerie, FAQ, avis, leads, stats, badge) | **`pages`** + catégories multiples + horaires structurés + `place_id` | adapter | M |
| `get_pro_page_by_slug` (toute la page en 1 RPC) | `get_page_by_slug` | réutiliser | S |
| `pro_reviews` + `submit_pro_review` + trigger de moyenne (correctif vague15) | `reviews` **multi-critères** + réponse du pro + date de séjour | adapter | M |
| `pro_leads` + `create_pro_lead` + `track_pro_lead` | `bookings` + dates + âges des enfants + délai de réponse | adapter | M |
| `pro_page_view_events` + `get_pro_page_timeseries` | Idem (garde stricte, `EXCEPTION` par sous-requête) | réutiliser | S |
| **`prospects` + `prospect_offers`** + limite de 5 + triggers de matching | **`trip_requests` + `trip_offers`** | adapter | M |
| `saved_searches` + RPC `save_search` + trigger d'alerte | Idem + critères de **dates** | adapter | S |
| Socle social : `reactions`, `comments`, `follows`, `conversations`, `messages`, `notifications`, `push_subscriptions` | Intégral, + follow de **page**, + réactions batchées sur commentaires | réutiliser | S |
| Chaîne push VAPID (webhook → `send-push` → sw.js) | Tel quel, nouvelles clés | réutiliser | S |
| `useRefreshOnFocus` | Tel quel | réutiliser | S |
| Verrou de boost (`use_free_boost` + trigger `guard`) | `featured_until` + `guard_featured` | réutiliser | S |
| Fermeture PII (revoke table + grant colonne par colonne) | Méthode identique | réutiliser | S |
| Anti-escalade sur `profiles` | Tel quel | réutiliser | S |
| Flux OTP maison + `app_flags` | Tel quel | réutiliser | S |
| KYC (`kyc_verifications`, bucket privé, NIF/STAT) | `verifications` + licence agence, carte de guide, agrément MNP | adapter | M |
| Espace agence vague26 (`fn_my_agencies`, équipe, RLS par agence) | Espace gestionnaire multi-établissements | adapter | L |
| Portails « lien magique » (`rental_portal`, `owner_portal`) | Partage lecture seule d'un devis / carnet de voyage | adapter | M |
| Silos SEO + `SiloLanding` + maillage croisé | `/hotels/ampefy`, `/ou-manger/ravitoto`… **source unique** | adapter | L |
| `meta-proxy.php` (aperçus sociaux) + `sitemap.php` + `robots.txt` IA | Tel quel, vocabulaire schema.org voyage | adapter | S |
| `useSEO` + JSON-LD | `Hotel`, `Restaurant` + **`hasMenu`**, `TravelAgency` | adapter | M |
| `MapView` (Leaflet + OSM, gratuit) | Carte par **viewport** + vrai clustering | adapter | L |
| `AdvancedFilters` (`parsePriceInput`, select natif mobile, compteur live) | Filtres voyage. ⚠️ **pas** de `buildCountQuery` dupliqué, **pas** de sentinelle | adapter | M |
| `AgentFonenako` + edge function (widget mince, cerveau serveur, bilingue) | Concierge voyage qui alimente la barre de réponse et désambiguïse | adapter | L |
| Géolocalisation locale (haversine, 0 API, respecte le consentement) | Mécanisme identique, **jeu de données remplacé** | adapter | M |
| `madagascar-locations.ts` + `madagascar-coords.ts` (2 fichiers couplés par convention) | **Une seule table `places`** | refaire | L |
| `vague18_geo_backfill` (3 passes idempotentes, n'écrase jamais une saisie humaine) | Patron de migration à reprendre | adapter | S |
| `price_history` + badge « Bon prix » | Repères de prix par destination — **désactivé au lancement** (D9) | adapter | M |
| `Estimation` | « À quel prix positionner ma chambre » — produit d'appel pour recruter | adapter | M |
| `Diaspora` | Page diaspora (retour au pays, famadihana) — cible solvable | adapter | S |
| Guide juridique (contenant bilingue + SEO) | Guide pratique du voyage (visa, MNP, taxe de séjour, santé, fady) | refaire | L |
| **`listings`** (table monolithe, 90 colonnes) | **`pages` → offres → tarifs** | refaire | XL |
| Fil en grille + offset + `count:'exact'` | Fil pleine largeur + **curseur**, sans count | refaire | L |
| `scoreListing` **client** | Même formule, **en base** (`quality_score`) | adapter | L |
| `fn_seen` / `fn_prefs` (localStorage) | Tel quel, plafond 3 000 + décroissance | réutiliser | S |
| Recherche `ilike '%x%'` | `tsvector` + `pg_trgm` + résolution d'entités + RPC unique | refaire | XL |
| Enums Postgres `property_type` | `text` + table de référence + `CHECK` | refaire | S |
| Système FNK (monnaie interne) | Abandonné | abandonner | S |
| Paywall contact 1111 FNK | Contacts pro publics, leads comptés | abandonner | S |
| Code mort (`DynamicFilters`, `applyFilters`, `sampleProperties`, `dynamic-meta`, `SocialShell`) | Ne rien porter | abandonner | S |
| Modération de contenu | **`reports` + `blocks` + file admin** — inexistants chez Fonenako | refaire | L |
| Disponibilité / réservation | Déclaratif au MVP, calendrier plus tard | refaire | XL |
| Vidéo dans le fil | Après le MVP, cadrée sévèrement | refaire | L |
| **Diako-V2** : coque visuelle (`AppShell`, `BottomNav`, `index.css` turquoise) | Jetons de couleur + logo + favicon | réutiliser | S |
| **Diako-V2** : Firebase, `backend/*.php`, MySQL, crédits, retraits, CIN | **Supprimer du serveur** | abandonner | S |

---

## Annexe B — Les 20 pièges à ne jamais reproduire

Tous vécus en production sur l'un des deux projets.

1. **`.single()` en écriture** → *« Cannot coerce the result to a single JSON object »* et un brouillon recréé à chaque sauvegarde automatique. Toujours `.select('id').maybeSingle()`, relire l'id en base, purger **après** création.
2. **`select('*')` sous un modèle de sécurité par colonne** → 401 silencieux pour les visiteurs anonymes. Colonnes explicites partout, et un `GRANT` explicite pour chaque nouvelle colonne.
3. **`revoke select (colonne)` seul** → ne ferme rien. Revoke sur la **table** puis grant colonne par colonne.
4. **Virgule ou parenthèse dans un filtre PostgREST `.or()`** → 400 → 0 résultat (« Villa, Ivandry »). Assainir, ou passer par un RPC paramétré.
5. **Recherche floue recopiée dans un filtre strict** → les deux conditions se contredisent, 0 résultat.
6. **Tri par prix sur la mauvaise colonne** selon l'onglet actif.
7. **Pagination par offset sans départage déterministe** → lignes sautées ou dupliquées. Curseur.
8. **`count:'exact'` à chaque page** → scan complet de la table.
9. **`IntersectionObserver` non ré-armé après un append** → fil figé sur grand écran.
10. **Realtime non maîtrisé** → 17 channels = ~6 Go/mois de heartbeats sur 2 Go de quota.
11. **Channel de présence global** → trafic en O(n²). Deux composants créant un channel du même nom → **page blanche**.
12. **N+1 sur les réactions** → 3 requêtes par carte (corrigé pour les annonces, **jamais** pour les commentaires).
13. **Précache PWA trop large** → 154 fichiers / 3,7 Mo tirés derrière le dos du visiteur.
14. **`lazy()` monté immédiatement** → le chunk part quand même. Montage différé par `requestIdleCallback`.
15. **Suppression du `manualChunk` radix-vendor** → page blanche sous Firefox.
16. **Service worker sans `skipWaiting`/`clientsClaim`** → page blanche après chaque déploiement.
17. **Coordonnées par défaut codées en dur** → toutes les fiches empilées sur le même point de la carte.
18. **Sentinelle magique** (`5 000 000` = « pas de plafond ») → filtre ignoré silencieusement. Utiliser `NULL`.
19. **Build sans `tsc`** → `item.badge` sur des objets qui n'ont pas ce champ, parti en production.
20. **Schéma éclaté** (162 migrations + 30 fichiers à coller à la main) → `relation public.pro_pages does not exist` en production, alors que le code s'en servait déjà.

**Et trois de Diako-V2, pour mémoire :** un `user_id` de confiance venant du client · un endpoint de paiement qui accorde de la valeur sans confirmation opérateur · des documents d'identité dans un dossier servi par le web.

---

*Fin du TDR — v1.0 du 31/07/2026.*
*Établi à partir de 7 audits parallèles (1,5 M de tokens d'analyse) portant sur l'intégralité des dépôts `Fonenako FinAL GITHUB` et `Diako-V2`, avec sondages en direct de `fonenako.mg` et `diako.fonenako.mg`.*
