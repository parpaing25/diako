# Audit accessibilité — Diako, 16/08/2026

> État : (terminé)

Périmètre : dépôt `Desktop/Diako` (Vite + React 18 + TS strict + Tailwind), site https://diako.fonenako.mg.
Méthode : grep systématique sur `src/`, lecture des composants incriminés, calcul de contrastes WCAG, mesures curl. Aucune modification du code.

## ✅ Ce qui marche

### Images : 25/25 `<img>` du code source ont un attribut `alt` — zéro image muette
Preuve : `grep '<img' src/` → 25 occurrences, 19 fichiers, toutes avec `alt` (vérifiées une à une).
- Images porteuses de sens avec un vrai texte : `src/pages/Destination.tsx:177` (`alt={`${f.lieu.name_fr} — ${f.lieu.region ?? "Madagascar"}`}`), `src/components/FicheCard.tsx:39` (`alt={fiche.name}`), `src/pages/Plats.tsx:404`, `src/pages/Plat.tsx:150`, `src/pages/Gouts.tsx:351`, `src/pages/PagePro.tsx:424`, `src/pages/Site.tsx:163`, `src/pages/Evenements.tsx:90` (`alt={e.title}`).
- `alt=""` légitimes : avatars toujours flanqués du nom en texte (`src/components/PostCard.tsx:206` + nom ligne 212, `src/components/Commentaires.tsx:80` + nom ligne 86, `src/pages/Messages.tsx:143`, `src/components/MenuMobile.tsx:96` + `display_name` ligne 102) ; fonds décoratifs marqués en plus `aria-hidden="true"` (`src/pages/Explorer.tsx:500-501, 682-683, 912-913`, `src/components/ChoixEnvie.tsx:199-200`, `src/components/ImageProgressive.tsx:52-53` pour la vignette floue de préchargement).
- Logo d'en-tête : `alt=""` (`src/components/Header.tsx:87`) mais le lien parent porte `aria-label="Diako, accueil"` (`src/components/Header.tsx:82`) — conforme.
Conséquence : un lecteur d'écran ne tombe sur aucune image anonyme (« image », « IMG_2034 ») et n'entend pas deux fois le nom à côté des avatars.

### Formulaires publics : tous les champs du parcours voyageur sont étiquetés
Preuve (balayage automatisé de 100 `<input|textarea|select>` dans 22 fichiers, avec extraction complète des balises multi-lignes, puis vérification manuelle des cas ambigus) :
- **Auth** : `label htmlFor="email"` (`src/pages/Auth.tsx:140`), `htmlFor="password"` (`:154`), avec `autoComplete` correct (`:146,160`).
- **Publier** : `htmlFor="texte"` (`src/pages/Publier.tsx:342`), `htmlFor="lieu"` (`:461`), `htmlFor="plat"` (`:491`), `aria-label="Unité du prix"` (`:541`), `htmlFor="releve"` (`:552`), `aria-label="Retirer cette photo"` sur la croix de suppression (`:400`).
- **Projet** : `aria-label` sur chacun des 7 champs, y compris les deux dates que le commentaire du code documente explicitement (`src/pages/Projet.tsx:318-321, 325, 332, 344, 361, 371, 381, 408`).
- **Revendication** : 5 champs avec `label htmlFor` (`src/components/Revendication.tsx:209, 226, 248, 265, 330`).
- **Compte** : nom/ville/bio/métier étiquetés (`src/pages/Compte.tsx:507, 520, 534, 668`). **Bienvenue** : idem (ids `nom`, `ville`, `metier` tous appariés à un `htmlFor`).
- **Recherche** : label `sr-only` + `role="search"` + combobox complet (`aria-expanded`, `aria-controls`, `role="listbox"/"option"`) (`src/components/SearchBar.tsx:81-131`). **ChampLieu** : combobox avec `aria-activedescendant` et navigation flèches/Entrée/Échap (`src/components/ChampLieu.tsx:176-199`).
- **ChoixEnvie, Sites, Plats** : champs filtres enveloppés dans un `<label>` avec `<span className="sr-only">` (`src/pages/Sites.tsx:276-277, 291-292`).
- **Commentaires** (`id={`cm-${postId}`}` apparié), **Messages** (`id="msg"`), **Cogestion** (`id="cogestion-id"`), **AssistantEtablissement** (8 champs enveloppés de `<label>`, ex. `src/components/AssistantEtablissement.tsx:239-249`) : tous nommés.
- Les `input type="file"` masqués (`className="hidden"`/`sr-only`) sont pilotés par des boutons ou labels textuels visibles (`src/pages/Compte.tsx:495-503`, `src/pages/ProConsole.tsx:429`) — hors arbre d'accessibilité, conforme.
Conséquence : un utilisateur de lecteur d'écran peut s'inscrire, chercher, publier, revendiquer un établissement et gérer son compte sans champ anonyme.

### Boutons d'en-tête : aria-label + aria-expanded systématiques
Preuve : `src/components/Header.tsx:109` (bascule thème avec libellé dynamique), `:126-127` (Messages + compteur non-lus DANS le libellé + `aria-expanded`), `:146-147` (Notifications idem), `:170-172` (Mon compte avec `aria-haspopup="menu"`).
Conséquence : l'état ouvert/fermé des trois panneaux est annoncé, et le nombre de non-lus est lisible sans voir la pastille.

### Boutons-icônes : balayage complet, aucun bouton muet trouvé
Preuve : grep multiligne `<button…><Icône…/></button>` (boutons dont le seul contenu est une icône) → 14 occurrences, toutes avec `aria-label` : retours (`src/pages/Carte.tsx:347`, `Messages.tsx:136`, `PagePro.tsx:418`, `ProConsole.tsx:189`, `components/RetourEntete.tsx:42`, `Sites.tsx:793`), envois (`AgentDiako.tsx:278`, `Messages.tsx:245`), actions du fil (`PostCard.tsx:326,333,341`, `PostImmersif.tsx:138,170`). Second balayage sur les icônes à risque (X, chevrons, corbeilles, plus/moins, options) → 32 correspondances : les fermetures (`Carte.tsx:454`, `AgentDiako.tsx:154`, `Feed.tsx:317`, `InstallPrompt.tsx:96`, `MenuMobile.tsx:85`, `Publier.tsx:400`, `ChampLieu.tsx:149` — avec le nom du lieu dans le libellé), le carrousel (`Carrousel.tsx:82,91`), le compteur de nuits (`PanneauDemande.tsx:86,95`), les 6 corbeilles de ProConsole (`:711,834,1081,1243,1403,1511`), le menu d'options (`PostCard.tsx:237`) — tous étiquetés ; les icônes accompagnées de texte visible sont `aria-hidden="true"`.
Conséquence : aucun bouton n'est annoncé « bouton » sans nom ; les libellés contextualisés (« Supprimer ${chambre.name} », ProConsole.tsx:834) distinguent même les corbeilles entre elles.

### Panneaux et menus : Échap et clic-dehors ferment partout
Preuve : `src/components/MenuCompte.tsx:32-48` (Échap + mousedown-dehors, commentaire du code : « un menu qu'on ne peut fermer qu'en rechoisissant une entrée piège l'utilisateur au clavier ») ; `src/components/PanneauxEntete.tsx:52-66` (même mécanique pour Messages et Notifications, `role="dialog"` + `aria-label` `:77-78`, voile mobile `aria-hidden` `:74`). Le bouton d'ouverture garde le focus (jamais déplacé), donc Échap rend la main exactement où elle était. Les commentaires du fil ne sont pas une modale : bloc en flux (`src/components/Commentaires.tsx:56-129`), rien à piéger, champ étiqueté `sr-only` (`:101-103`). Cogestion n'est pas une modale non plus : section en ligne de l'onglet « Ma fiche » (`src/pages/ProConsole.tsx:273-279`), la confirmation de retrait passe par `confirm()` natif (`src/components/Cogestion.tsx:254`) — nativement accessible.
Conséquence : aucun panneau ne piège le clavier ; on sort toujours par Échap sans perdre sa position.

### Lien d'évitement fonctionnel + langue déclarée
Preuve : `src/App.tsx:176-181` — `<a href="#contenu" className="sr-only focus:not-sr-only …">Aller au contenu</a>`, premier élément focusable de la coque ; la cible existe et est focusable : `<main id="contenu" tabIndex={-1}>` (`src/App.tsx:204-207`). Langue : `<html lang="fr">` (`index.html:2`), également sur `public/offline.html:2` et les 4 gabarits d'e-mails Supabase (`supabase/templates/*.html:2`).
Conséquence : au clavier, on saute la navigation en un Tab ; les synthèses vocales prononcent le site en français.

### prefers-reduced-motion : neutralisation globale + respect ciblé dans les hooks
Preuve : `src/index.css:421-429` — kill-switch universel (`*, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important }`) qui couvre toutes les animations CSS (dk-progress `:417`, épingles carte — doublé d'un bloc dédié `:482-484` qui annule aussi les `transform`). Les animations pilotées en JS vérifient le média elles-mêmes : `src/hooks/useReveal.ts:37` (`const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches`) et le compteur défilant du rail droit `src/components/RightRail.tsx:82` (même garde, commentaire explicite `:74`).
Conséquence : un utilisateur sensible au mouvement (vestibulaire) n'a ni révélations au défilement, ni compteur animé, ni barre de progression qui pulse.

### aria-pressed sur les filtres : 31 occurrences, tous les écrans de tri couverts
Preuve : grep `aria-pressed` → 31 occurrences dans 22 fichiers, dont les quatre écrans demandés : `src/pages/Sites.tsx:1372` (puces filtres), `src/pages/Explorer.tsx:1011` (catégories), `src/components/Feed.tsx:66` (modes du fil), `src/pages/Gouts.tsx:367` (« goûté »), plus Recherche (`:452,468,484`), Plats (`:211`), réactions et favoris des cartes (`src/components/PostCard.tsx:303,340,364`, `PostImmersif.tsx:137,169`), thème (`Parametres.tsx:136`).
Conséquence : l'état actif/inactif de chaque filtre est annoncé, pas seulement peint en couleur.

### Onglets : contrat ARIA complet là où il y a des onglets
Preuve : `role="tablist"` + `role="tab"` + `aria-selected` sur Compte (`src/pages/Compte.tsx:114-119`), Gouts (`:127-145`, avec le `role="tabpanel"` apparié `aria-labelledby` `:161` — le commentaire du code documente la réparation d'un contrat « à moitié écrit »), Favoris (`:102-107`), DiakoHero (`:73-83`), PagePro (`:566-580`), ProConsole (`:232-239`).
Conséquence : un lecteur d'écran annonce « onglet 2 sur 3, sélectionné » au lieu d'une rangée de boutons anonymes.

### Focus visible : règle globale au-dessus des utilitaires, jamais d'outline supprimé sans remplacement
Preuve : `src/index.css:222-228` et `:763-765` — `:where(a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])):focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px }`, placée après `@tailwind utilities` pour battre les `outline-none` des composants (commentaire du code `:753` : « Jamais outline: none sans remplacement »). `:focus:not(:focus-visible)` seul est éteint (`:227-228`) — la souris ne voit pas l'anneau, le clavier le voit toujours.
Conséquence : on sait toujours où l'on est en tabulant, y compris sur les composants qui posent `outline-none`.

### Contrastes : le thème sombre passe large, la palette claire de base passe AA
Preuve (ratios WCAG calculés depuis les jetons de `src/index.css:38-69` clair et `:99-137` sombre) :
- Sombre — tout ≥ 6,6:1 : `muted-foreground` sur `muted` 6,60:1, sur `background` 8,46:1, sur `card` 7,77:1 ; `accent-strong` en texte sur fond 7,91:1, sur carte 7,27:1 ; encre sur bouton `accent-strong` 6,68:1 (`--accent-foreground` passe à l'encre en sombre, `index.css:128` — le point redouté du thème sombre est en réalité le mieux loti) ; `primary` sur fond 9,84:1.
- Clair — le texte secondaire tient partout : `muted-foreground` (#5B6E72) sur `muted` 4,96:1, sur `background` 5,06:1, sur carte blanche 5,37:1, sur `secondary` sable 4,71:1 ; `primary` #0E7C86 sur blanc 4,95:1 (le commentaire du code annonce 4,95:1, `index.css:46` — exact) et blanc sur bouton `primary` 4,95:1.
Conséquence : la lecture courante (corps, légendes, liens) est conforme AA dans les deux thèmes.

## 🔴 Ce qui ne marche pas

### Le champ « Prix payé » de Publier n'a pas de nom accessible
Preuve : `src/pages/Publier.tsx:525-533` — `<input id="montant" … placeholder="15 000">` ; aucun `htmlFor="montant"` dans le fichier (grep exhaustif), aucun `aria-label`. Le titre visible « Prix payé » est un `<p>` (`:515-518`), non associé ; le suffixe « Ar » est un `<span>` décoratif (`:534-536`).
Conséquence : un lecteur d'écran annonce « 15 000, éditable » — l'utilisateur aveugle qui publie un bon plan ne sait pas que ce champ attend le prix, alors que c'est un champ obligatoire pour ce type de publication (`:248` : `manques.push("le montant")`).

### ProConsole : les sous-formulaires pro (saisons, menu, activités, circuits) n'ont que des placeholders — et deux dates n'ont rien du tout
Preuve : `src/pages/ProConsole.tsx:1128-1129` — `<input type="date" value={du}…>` et `<input type="date" value={au}…>` : ni label, ni aria-label, ni placeholder possible sur un type=date. `:1130-1137` — `<select value={pension}>` sans nom. Idem `:1330` (`select dishId`). Les autres champs de ces blocs (`:1113-1126, 1269-1274, 1312-1327, 1417-1463, 1524-1564, 1653`) ne sont nommés que par `placeholder` — qui disparaît à la saisie et sert de nom de dernier recours.
Nuance vérifiée : le formulaire principal de la fiche pro EST étiqueté via le composant `Champ` qui rend un vrai `<label>` enveloppant (`src/pages/ProConsole.tsx:292-308`, utilisé lignes 434-462, 955-1042).
Conséquence : un hôtelier malvoyant peut éditer sa fiche mais pas déclarer une saison tarifaire (deux champs date muets : impossible de savoir lequel est le début) ni composer son menu sans aide voyante. Portée limitée aux comptes pro, mais c'est le cœur de l'offre « Espace pro ».

### Les badges et étiquettes brique sur fond pêche sont sous le seuil AA — de 3,62 à 4,19:1
Preuve (ratios calculés depuis `--accent-strong: 15 78% 46%` et `--accent: 13 89% 59%`, `src/index.css:56-58`) : `text-accent-strong` sur `bg-accent/15` = **3,83:1** (`src/components/Badges.tsx:81` et `:143`, texte de 11 px semibold ; `src/pages/Plat.tsx:172` et `:291`, 10 px bold) ; sur `bg-accent/20` = **3,62:1** (`src/pages/Destination.tsx:40`, badge « déconseillé » — une information de sécurité du voyageur) ; les étiquettes `dk-etiquette text-accent-strong` sur `bg-accent/[0.07]` = 4,19:1 sur carte, 3,97:1 sur fond papier (`src/pages/Destination.tsx:365`, `Circuit.tsx:202`, `Gouts.tsx:247+`, `Index.tsx:123`, `Plat.tsx:353`). Seuil AA pour ces tailles : 4,5:1.
Conséquence : les mentions les plus chargées de sens du site — « déconseillé », « épuisé aujourd'hui », « Non inclus », les badges promo — sont précisément celles qu'un malvoyant léger ou un écran au soleil lit le plus mal. En thème clair uniquement (le sombre passe à 7,27:1).

### Les crédits photo en blanc translucide deviennent illisibles sur photo claire — jusqu'à 2,17:1
Preuve : `text-white/70` et `/75` en 10 px posés sur la photo de couverture (`src/pages/Explorer.tsx:517, 690, 930`). Le voile `bg-black/40` existe (`:510`, `:920`) mais calcul aux bornes : photo noire → 9,96:1 ; photo claire (ciel, plage) → **2,17:1**. Même famille : la légende `text-white/85` sur `bg-black/45` (`src/pages/Destination.tsx:185`) tombe à 2,88:1 sur photo claire, et le titre héro blanc plein sur voile 40 % à 2,85:1 sur plage surexposée (`Explorer.tsx:513`, adouci par `drop-shadow`, non quantifiable).
Conséquence : le crédit du photographe — une obligation morale du produit, le commentaire du code y tient (`Explorer.tsx:928-929`) — disparaît exactement sur les photos où il y a un photographe à créditer. Portée réelle limitée : 10 px, information périphérique.

## 🟠 À améliorer

### Le bouton plein « brique » passe AA avec 0,03 de marge
Preuve : blanc sur `bg-accent-strong` (#D0471C) = **4,53:1** — le seuil est 4,5:1. Utilisé sur les boutons d'action forte : `src/pages/Destination.tsx:372`, `Circuit.tsx:250`, `Gouts.tsx:257`, `components/FicheLigne.tsx:123`, `PanneauDemande.tsx:145`, `Plat.tsx:212`, la pastille de compteur de l'en-tête (`Header.tsx:132,152` — 10 px bold) et le bouton central de la BottomNav (`BottomNav.tsx:55`).
Coût : conforme aujourd'hui, mais n'importe quel assombrissement de photo derrière, antialiasing agressif ou écran mal calibré mange la marge. Assombrir `--accent-strong` de 2 points de luminosité sécuriserait tout d'un coup.

### `role="dialog"` et `role="menu"` annoncés, mais le focus n'est jamais déplacé
Preuve : à l'ouverture des panneaux Messages/Notifications (`src/components/PanneauxEntete.tsx:75-78` — `role="dialog"`, pas d'`aria-modal`, aucun `focus()` dans le fichier) et du menu avatar (`src/components/MenuCompte.tsx:63-65` — `role="menu"` sans navigation aux flèches ni focus initial, grep `\.focus\(` vide sur les deux fichiers), le focus reste sur le bouton déclencheur. Tab entre ensuite dans le panneau par l'ordre du DOM.
Coût : un lecteur d'écran entend « bouton, développé » mais rien ne l'emmène au contenu ; le motif ARIA menu (flèches, Home/End) n'existe pas. Fonctionnel — rien n'est piégé, Échap sort proprement — mais en deçà du contrat que les rôles annoncent. Soit déplacer le focus à l'ouverture, soit rétrograder les rôles.

### Un piège dormant dans les primitives shadcn : blanc sur orange à 3,17:1
Preuve : `text-accent-foreground` sur `bg-accent` plein (#F4633A) = **3,17:1**, présent dans les états hover/focus/sélection de `src/components/ui/button.tsx:14,16`, `calendar.tsx:36`, `command.tsx:108`, `dropdown-menu.tsx`, `menubar.tsx`, `select.tsx:113`, `toggle.tsx:8`. Aucune page de l'application n'importe ces composants aujourd'hui (grep des imports `@/components/ui/…` : seuls d'autres fichiers `ui/` les référencent).
Coût : zéro utilisateur touché aujourd'hui ; le premier écran qui montera un dropdown ou un calendrier shadcn héritera d'un focus illisible. À corriger dans les jetons (`--accent` est trop clair pour porter du blanc) avant tout réemploi.

### ProConsole : un dépliant marqué `aria-pressed` au lieu d'`aria-expanded`, et un à l'envers
Preuve : le grep `aria-expanded` (9 occurrences, toutes justes : `Header.tsx:127,147,171`, `SearchBar.tsx:104`, `ChampLieu.tsx:180`, `Sites.tsx:831`, `PostCard.tsx:318`, `Projet.tsx:666`, `ProConsole.tsx:797`) laisse un cas hybride : `src/pages/Compte.tsx:575` utilise `aria-pressed={lieuxOuverts}` pour un bloc qui se déplie — sémantique de bascule là où l'utilisateur attend « développé/réduit ».
Coût : mineur ; l'état est annoncé, mais avec le mauvais vocabulaire.

## Verdict pour un lancement demain

**PRÊT SOUS CONDITIONS** — le socle est solide et très au-dessus de la moyenne (zéro image muette, zéro bouton anonyme, formulaires voyageur entièrement étiquetés, focus visible global, Échap partout, reduced-motion réellement respecté, thème sombre irréprochable). Rien ne bloque un lancement : aucun parcours n'est infranchissable au clavier ou au lecteur d'écran. Conditions, triées :

1. **Étiqueter le champ « Prix payé »** (`src/pages/Publier.tsx:525`) — une ligne (`aria-label="Prix payé en ariary"`), c'est un champ obligatoire du parcours de publication, le seul défaut qui touche un flux principal.
2. **Nommer les deux dates de saison tarifaire de ProConsole** (`:1128-1129`) puis, dans la foulée, les selects nus (`:1130, :1330`) — le cœur de l'« Espace pro » est inutilisable en lecteur d'écran sans cela.
3. **Remonter les brique-sur-pêche au-dessus de 4,5:1** (badges `bg-accent/15..20` et étiquettes `/[0.07]`, 3,62–4,19:1) — commencer par « déconseillé » (`Destination.tsx:40`) qui porte une information de sécurité.
4. Sous quinzaine, pas pour demain : crédits photo lisibles (fond local au lieu de `white/70` nu), focus déplacé dans les panneaux `role="dialog"`, et 2 points de luminosité en moins sur `--accent-strong` pour donner de la marge aux boutons pleins.
