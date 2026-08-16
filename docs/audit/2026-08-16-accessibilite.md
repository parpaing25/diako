# Audit accessibilité — Diako, 16/08/2026

> État : (en cours)

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

## 🔴 Ce qui ne marche pas

### Le champ « Prix payé » de Publier n'a pas de nom accessible
Preuve : `src/pages/Publier.tsx:525-533` — `<input id="montant" … placeholder="15 000">` ; aucun `htmlFor="montant"` dans le fichier (grep exhaustif), aucun `aria-label`. Le titre visible « Prix payé » est un `<p>` (`:515-518`), non associé ; le suffixe « Ar » est un `<span>` décoratif (`:534-536`).
Conséquence : un lecteur d'écran annonce « 15 000, éditable » — l'utilisateur aveugle qui publie un bon plan ne sait pas que ce champ attend le prix, alors que c'est un champ obligatoire pour ce type de publication (`:248` : `manques.push("le montant")`).

### ProConsole : les sous-formulaires pro (saisons, menu, activités, circuits) n'ont que des placeholders — et deux dates n'ont rien du tout
Preuve : `src/pages/ProConsole.tsx:1128-1129` — `<input type="date" value={du}…>` et `<input type="date" value={au}…>` : ni label, ni aria-label, ni placeholder possible sur un type=date. `:1130-1137` — `<select value={pension}>` sans nom. Idem `:1330` (`select dishId`). Les autres champs de ces blocs (`:1113-1126, 1269-1274, 1312-1327, 1417-1463, 1524-1564, 1653`) ne sont nommés que par `placeholder` — qui disparaît à la saisie et sert de nom de dernier recours.
Nuance vérifiée : le formulaire principal de la fiche pro EST étiqueté via le composant `Champ` qui rend un vrai `<label>` enveloppant (`src/pages/ProConsole.tsx:292-308`, utilisé lignes 434-462, 955-1042).
Conséquence : un hôtelier malvoyant peut éditer sa fiche mais pas déclarer une saison tarifaire (deux champs date muets : impossible de savoir lequel est le début) ni composer son menu sans aide voyante. Portée limitée aux comptes pro, mais c'est le cœur de l'offre « Espace pro ».

## 🟠 À améliorer

_(en cours de collecte)_

## Verdict pour un lancement demain

_(à venir)_
