# 04 — Pages construites

Trois pages **prêtes à déposer** dans `src/pages/` (même composant `PageLegale`, même hook `useSEO`, aucune donnée inventée : les chiffres cités sont ceux de la base au 05/09/2026) et le câblage qui les rend atteignables (règle du projet : aucune page sans entrée de navigation).

| Fichier | Route | Pourquoi (02) | État |
|---|---|---|---|
| `APropos.tsx` | `/a-propos` | CO2 — la confiance d'une marque inconnue : qui, d'où viennent les prix, ce que Diako n'est pas | prêt |
| `Aide.tsx` | `/aide` (ancres `#pro`, `#contact`, `#prix`…) | CO2 — 10 questions + contact ; remplace `/pro` dans le sitemap comme page vitrine pro | prêt |
| `Confidentialite.tsx` | `/confidentialite` (remplace l'existante) | CO1 — RGPD art. 13 : responsable, bases légales, durées, sous-traitants, droits, CMIL/CNIL | prêt ; **le nom de l'éditeur reste à poser dans `Mentions.tsx`** (décision d'Andry : personne physique ou société, NIF/STAT) |

`Mentions.tsx` (existante) : remplacer `contact.fonenako@gmail.com` par `contact.diako@gmail.com`, remplacer `useDocumentTitle` par `useSEO({ titre: "Mentions légales", url: "/mentions" })`, et ajouter sous « Éditeur du site » la ligne d'identité choisie par Andry (nom ou raison sociale, adresse, NIF, STAT).

`Cgu.tsx` (existante, 409 mots) : ajouter `useSEO({ titre: "Conditions d'utilisation", url: "/cgu" })` et un article « Suppression du compte » renvoyant à Paramètres (03-11).

## Câblage

### `src/App.tsx`
```diff
+const APropos = chargerPage(() => import("./pages/APropos"));
+const Aide = chargerPage(() => import("./pages/Aide"));
 ...
       <Route path="/mentions" element={<Mentions />} />
+      <Route path="/a-propos" element={<APropos />} />
+      <Route path="/aide" element={<Aide />} />
```

### `src/components/Footer.tsx` (colonne « Contact et informations », lignes 46-53)
```diff
-              <a href="mailto:contact.fonenako@gmail.com" className="text-muted-foreground hover:text-foreground">
-                Nous écrire
-              </a>
+              <Link to="/aide#contact" className="text-muted-foreground hover:text-foreground">
+                Aide et contact
+              </Link>
+            </li>
+            <li>
+              <Link to="/a-propos" className="text-muted-foreground hover:text-foreground">
+                À propos de Diako
+              </Link>
```

### `src/lib/nav.ts` (menu complet, groupe « decouvrir » ou un groupe « diako » en fin) — facultatif : le pied de page suffit à la profondeur ≤ 3 ; ajouter au menu seulement si Andry le veut.

### `public/sitemap.php` (03-03 §4) : `['/a-propos', '0.6', 'monthly', '2026-09-05']`, `['/aide', '0.6', 'monthly', '2026-09-05']`, retirer `/pro`.

### `public/llms.txt` (03-03 §6) : liens vers `/a-propos` et `/aide` déjà inclus.

### `src/components/PageLegale.tsx` : vérifier que les tableaux (`<table>` de Confidentialité) héritent d'un style lisible à 390 px — sinon envelopper dans `<div className="overflow-x-auto">` (le corps de page ne doit jamais défiler horizontalement).

## Vérification
`npm run typecheck && npm run lint` ; puis `node $TEMP/crawl.mjs` local : `/a-propos`, `/aide`, `/confidentialite` → h1 présent, canonical propre, description ≠ défaut ; largeur `scrollWidth === 390` à 390 px.
