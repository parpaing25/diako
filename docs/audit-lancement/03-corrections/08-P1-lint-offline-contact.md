# 03-08 — P1/P2 · Lint rouge, page hors-ligne Fonenako, contact Fonenako, `/compte` avant connexion

## 1. P1 — `src/components/Prix.tsx:60` (la CI échoue sur cette ligne)

```diff
-  entree: "l\'entrée",
+  entree: "l'entrée",
```
`npm run lint` → 0 erreur (12 avertissements `react-refresh` restent, P3).

## 2. P2 — `public/offline.html`

```diff
-  <title>Hors ligne - Fonenako</title>
+  <title>Hors ligne — Diako</title>
 ...
-      background: linear-gradient(135deg, #0EA5E9 0%, #0284c7 100%);
+      background: #0E7C86; /* sarcelle Diako, même valeur que theme_color du manifeste */
```
Texte : « Vous êtes hors ligne. Diako reviendra dès que la connexion sera de retour. » + bouton « Réessayer » (`onclick="location.reload()"` → à remplacer par un `<a href="/">` pour rester compatible avec `script-src 'self'` de 03-02). Le fichier sert aussi de page 403/500 (03-02 d) : ajouter un paragraphe neutre « Si le problème persiste, écrivez-nous : contact.diako@gmail.com ».

## 3. P2 — Contact : Fonenako → Diako

| Fichier | Ligne | Avant | Après |
|---|---|---|---|
| `src/components/Footer.tsx` | 49 | `mailto:contact.fonenako@gmail.com` | `mailto:contact.diako@gmail.com` (compte existant, reconnu par `is_admin()` — `Admin.tsx:15`) ; mieux : lien vers `/aide#contact` (04) |
| `src/pages/Parametres.tsx` | 222 | « Écrivez à contact.fonenako@gmail.com… » | remplacé par la RPC de 03-11 ; en attendant, `contact.diako@gmail.com` |
| `src/pages/Mentions.tsx`, `Confidentialite.tsx` | — | vérifier `grep -rn 'fonenako@gmail' src` → 0 après correction | |

## 4. P3 — `/compte` : deux RPC tirées avant de connaître l'utilisateur (`Compte.tsx:156`, `:408`)

Dans les deux sous-composants : `const { user } = useAuth(); useEffect(() => { if (!user) return; … }, [user])`. Résultat : plus de 401 en console pour un visiteur anonyme redirigé vers `/auth`.

## 5. P3 — `CLAUDE.md:60` vs `vite.config.ts` (radix-vendor)

Mesurer Firefox (page blanche ?) sur le build courant, puis corriger la phrase de `CLAUDE.md` pour qu'elle dise ce que fait réellement `vite.config.ts` (« Radix est découpé par usage ; ne pas remettre `radix-vendor` sans remesurer »).
