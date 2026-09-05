# 03-02 — P1/P2 · `.htaccess` : hôte canonique, CSP sans `unsafe-inline` sur les scripts, HSTS preload, pages d'erreur

**Constats.** SE4 (`'unsafe-inline'` inutile sur `script-src` : `dist/index.html` n'a aucun script en ligne, 0 `onclick=`), SE5, SE10/SO5 (`www.` répond 200 sans redirection), OP8 (403/500 Apache bruts).

## `public/.htaccess`

### a. Redirection `www` → apex (dans le bloc `mod_rewrite`, juste après la règle HTTPS, ligne 65)

```apache
  # Un seul hôte : www renvoie vers l'apex (SEO : contenu dupliqué ; HSTS et
  # cookies sont par hôte). Le certificat couvre les deux, vérifié le 05/09/2026.
  RewriteCond %{HTTP_HOST} ^www\.diako\.fonenako\.mg$ [NC]
  RewriteRule ^(.*)$ https://diako.fonenako.mg/$1 [R=301,L]
```

### b. HSTS avec `preload` (ligne 18)

```apache
  Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
```
⚠ Ajouter la directive est sans risque ; **soumettre** `fonenako.mg` à hstspreload.org engage tous les sous-domaines (Fonenako, AKORA, Diako) pour longtemps — décision d'Andry.

### c. CSP : `script-src 'self'` (ligne 47) et mettre à jour le commentaire des lignes 36-39

```apache
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob: https://diako.fonenako.mg; img-src 'self' data: blob: https://diako.fonenako.mg https://fonenako.mg https://*.supabase.co https://*.tile.openstreetmap.org https://*.googleusercontent.com https://*.fbcdn.net https://upload.wikimedia.org; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://diako.fonenako.mg https://nominatim.openstreetmap.org https://overpass-api.de; frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests"
```
Commentaire de remplacement : « `script-src 'self'` suffit : depuis le passage du chargeur en `app-init.js` (externe), `index.html` ne porte plus aucun script exécutable en ligne — le JSON-LD est une donnée, pas un script, la CSP ne le bloque pas. Vérifié sur `dist/index.html` le 05/09/2026 (`grep -c 'onclick=' = 0`). `style-src` garde `'unsafe-inline'` : Leaflet et Radix posent des styles en ligne. »

**Vérification obligatoire avant déploiement** (une CSP cassée est muette) : `npm run build`, puis servir `dist/` avec l'en-tête via `serveur.mjs` (ajouter `res.setHeader('Content-Security-Policy', ...)`) et ouvrir `/`, `/carte`, `/p/les-trois-metis`, `/auth` (bouton Google) : **0 message « Refused to execute » en console**. Si un seul apparaît, revenir à l'ancienne ligne.

### d. Pages d'erreur Apache (après `Options -Indexes`)

```apache
# 403/500 : une page neutre à la charte, pas la page Apache d'o2switch.
ErrorDocument 403 /offline.html
ErrorDocument 500 /offline.html
ErrorDocument 503 /offline.html
```
(`offline.html` est rebrandé par 03-08 ; son texte devient « Diako est momentanément indisponible ».)

### e. Cache des images (ligne 109) — 30 jours → 1 an pour `/uploads/` (noms uniques)

Les fichiers de `uploads/` portent un identifiant unique et ne changent jamais : `Cache-Control: public, max-age=31536000, immutable` dans `public/uploads/.htaccess`.

## Vérification après déploiement

```bash
curl -sI https://www.diako.fonenako.mg/ | grep -i -E 'HTTP/|location'      # 301 → https://diako.fonenako.mg/
curl -sI https://diako.fonenako.mg/ | grep -i -E 'strict-transport|content-security'
```
