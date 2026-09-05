# 03-07 — P1/P2 · Accessibilité : champ sans étiquette, cibles tactiles, textes sous 12 px, focus initial

**Constats (02-AC2, MO1, MO2, UX3, AC3).**

## 1. P1 — `src/components/ChampLieu.tsx:209` : le combobox n'a qu'un placeholder

```diff
 export function ChampLieu({ valeur, onChange, ..., 
+  /** Nom accessible du champ : « Destination », « Ville de départ »… */
+  etiquette = "Destination",
 }: Props) {
 ...
         <input
           id={id}
           type="text"
           role="combobox"
+          aria-label={etiquette}
           aria-expanded={ouvert}
```
Appelants : `/quand-partir` → `etiquette="Destination"` ; `/y-aller` → `etiquette="Ville de départ"` et `"Ville d'arrivée"` ; `/projet`, `/publier` (lieu du récit) → `"Lieu du récit"`. Le placeholder reste (exemple), il n'est plus le seul nom.

Contrôle : `document.querySelectorAll('input[role=combobox]:not([aria-label]):not([aria-labelledby])').length === 0` sur les 4 pages.

## 2. P2 — Cibles tactiles (règle du projet : 44 × 44 ; WCAG 2.5.8 : 24 × 24)

| Élément | Mesuré (390 px) | Correctif |
|---|---|---|
| Puces de filtre du fil (`Découvrir`, `Près de moi`, `Hôtels`…) | 32 px de haut | `min-h-11` (44 px) sur le `<button>`, `py-1.5` → aspect inchangé, zone tactile complète |
| Boutons d'icône de l'en-tête (`Ouvrir le menu`, `Passer en mode sombre`, `Retour`) | 36 × 36 | `h-11 w-11` (icône 20 px centrée) |
| Bouton « plus » (déplier le récit) | 25 × 23 | `min-h-6 px-2 -mx-2` (≥ 24 px) |
| Lien « Ouvrir » (carte de récit) | 34 × 16 | `inline-flex min-h-6 items-center px-1` |
| Liens du pied de page | 19 px de haut | `py-1 inline-block` (≥ 24 px) |

Les liens dans le corps d'un texte (auteur, lieu, « il y a 3 j ») sont exemptés par 2.5.8 (« inline ») : on ne les touche pas.

## 3. P2 — Textes sous 12 px

`grep -rn 'text-\[1[01]px\]\|text-\[9px\]' src` → remplacer par `text-xs` (12 px). Cas vus : « MADAGASIKARA » (en-tête, 11 px), étiquettes de groupe du menu (11 px), « il y a 3 j » (11 px), compteurs « 1/2 » du carrousel (11 px), « bientôt » (10 px). Les étiquettes en capitales espacées peuvent garder 12 px avec `tracking-wide`.

## 4. P3 — Focus initial

Au premier chargement, la 1ʳᵉ tabulation atterrit sur « Découvrir » : un `focus()` est posé sur `main` (probablement dans le routeur, `useReveal` ou `ScrollRestoration`). Ne le faire **qu'après une navigation interne** (`if (navigationType !== "POP" && historyLength > 1)`), pour que le lien d'évitement « Aller au contenu » et l'en-tête restent les premiers arrêts à l'arrivée sur le site.

## 5. P3 — `ErrorBoundary.tsx` : `role="alert"` sur le conteneur du message d'erreur, `autoFocus` sur le bouton « Recharger ».

## 6. Test automatisé (06) — `@axe-core/playwright` sur `/`, `/explorer`, `/p/:slug`, `/lieu/:slug`, `/auth`, `/quand-partir`, seuil : 0 violation `serious`/`critical`. ⚠ Avec un agent utilisateur réaliste (règle du 05/09 : Chromium nu reçoit la page 429 d'o2switch).
