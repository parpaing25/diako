# 03-06 — P1 · Performance de l'accueil : preconnect, données avant le JS, images du fil, invite PWA

**Constats (02-PF1, PF2, PF7, UX1).** LCP 2,6–3,1 s ; première requête Supabase à 1,5 s ; 1,4 Mo dont 1,1 Mo d'images (35 diapositives, originaux JPEG) ; invite d'installation dès la première visite.

## 1. `index.html` — connexion anticipée (0,2 h, −300 à −500 ms sur le LCP)

Juste après `<meta name="viewport">` :
```html
<link rel="preconnect" href="https://eifrwecaszzqrdwjjjbu.supabase.co" crossorigin />
<link rel="dns-prefetch" href="https://eifrwecaszzqrdwjjjbu.supabase.co" />
```
`crossorigin` est obligatoire : les appels `fetch` de supabase-js sont en mode CORS, une connexion ouverte sans `crossorigin` ne serait pas réutilisée.

## 2. `public/app-init.js` — demander le fil avant que React existe (1 h, −0,9 s)

Le fil attend aujourd'hui la fin du JS (1,5 s) pour lancer `feed_filtre`/`get_feed`. Le petit script externe déjà chargé en tête peut lancer la requête tout de suite et la laisser dans une promesse que le client consomme :

```js
// app-init.js — s'exécute avant le module principal (script classique, non différé).
(function () {
  var URL = "https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1/rpc/get_feed";
  var KEY = "<clé anon, déjà publique dans le bundle>";
  try {
    window.__dkFil = fetch(URL, {
      method: "POST",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_limite: 12 }),   // mêmes arguments que src/lib/api.ts (à relire avant de copier)
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  } catch (e) { window.__dkFil = null; }
})();
```
Côté client (`src/components/Feed.tsx`, chargement initial) : `const prechargé = await window.__dkFil; if (prechargé && paramètres par défaut) utiliser prechargé; sinon appel normal`. ⚠ Uniquement pour l'état par défaut du fil (aucun filtre, non connecté) ; dès qu'un filtre ou une session existe, on ignore la promesse. ⚠ Relire `types.ts` pour les arguments exacts de `get_feed` avant d'écrire la ligne `body`.

## 3. Première image du fil : `fetchpriority="high"` dès le premier rendu

`Feed.tsx:507` pose `prioritaire={i === 0}` — bien, mais l'image n'existe qu'après les données. Avec le préchargement (§2) elle arrive ≈ 0,9 s plus tôt. Ajouter aussi, dans `index.html`, un `<link rel="preload" as="image">` **n'est pas possible** (l'URL n'est connue qu'à l'exécution) : c'est §2 qui joue ce rôle.

## 4. Images : variantes WebP et diapositives à la demande (2 h, −800 Ko)

### `src/components/ImageProgressive.tsx:69`
```diff
-        srcSet={aVignette && largeurAffichee ? `${vignette} 480w, ${src} 1600w` : undefined}
+        srcSet={aVignette && largeurAffichee ? srcsetPour(src) : undefined}
```
avec `import { srcsetPour } from "@/lib/imageThumb"` (la fonction existe déjà, lignes 34-36 : `.thumb.webp 480w, .w960.webp 960w, .w1600.webp 1600w`). Vérifier que **toutes** les images de `uploads/posts/` ont leurs trois variantes (`o2upload.php` ne fabrique que `.thumb.webp` par défaut : `fnk_generate_thumb($src,$dst,480)`) — sinon générer `.w960.webp` et `.w1600.webp` à l'envoi (deux appels de plus à `fnk_generate_thumb` avec 960 et 1600) et rattraper l'existant par `scripts/photos_variantes.py` (à écrire : parcourt `uploads/`, produit les manquantes). `onError` retombe déjà sur la vignette.

### `src/components/Carrousel.tsx` — ne monter que ce qui se voit
```tsx
// Diapositive i rendue seulement si i ∈ {courante-1, courante, courante+1}
// (une case grise de même ratio sinon : le scroll-snap garde ses repères).
{diapos.map((d, i) => Math.abs(i - courante) <= 1
  ? <ImageProgressive key={d.url} ... prioritaire={prioritaire && i === 0} />
  : <div key={d.url} className="aspect-[4/3] bg-muted" aria-hidden="true" />)}
```
`courante` suit `scrollLeft` (déjà calculée pour le compteur « 1/3 »). Résultat attendu : 5 récits × 2 images au lieu de 35.

### `Feed.tsx` : les cartes au-delà de la 4ᵉ passent `loading="lazy"` sur leur 1ʳᵉ image (déjà le cas via `prioritaire={i === 0}` ✅).

## 5. `src/components/InstallPrompt.tsx` — pas à la première visite (0,5 h)

```diff
   useEffect(() => {
     if (refusRecent()) return;
+    // ⚠ Jamais à la première visite : l'invite couvrait le premier récit avant
+    //   même que le visiteur sache ce qu'est Diako (capture 390 px du 05/09).
+    //   On compte les visites ; l'invite attend la deuxième, et jamais sur /auth.
+    try {
+      const n = Number(localStorage.getItem("dk-visites") ?? 0) + 1;
+      localStorage.setItem("dk-visites", String(n));
+      if (n < 2 || location.pathname.startsWith("/auth")) return;
+    } catch { return; }
     if (window.matchMedia?.("(display-mode: standalone)").matches) return;
```

## 6. Budget et mesure (06) — Lighthouse CI avec `budget.json` : LCP ≤ 2 500 ms, poids total ≤ 500 Ko, requêtes ≤ 35 sur `/` en « mobile lent ».

## Vérification

```bash
node $TEMP/lcp-accueil.mjs      # 3 mesures prod espacées : LCP médian attendu ≤ 2 000 ms
node $TEMP/poids-accueil.mjs    # total attendu < 500 Ko, img:uploads n ≤ 12
```
