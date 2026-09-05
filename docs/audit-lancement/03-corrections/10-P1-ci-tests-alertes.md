# 03-10 — P1 · CI complète, tests de bout en bout, alertes sur les erreurs

**Constats (02-CQ2, AM1, AM2, PF6, AC6).** CI = typecheck + lint + test + build ; aucun test de parcours ; l'incident du 05/09 n'a déclenché aucune alerte.

## 1. `.github/workflows/ci.yml` — trois étapes de plus

```yaml
      - run: npm audit --omit=dev --audit-level=high        # dépendances servies en prod seulement
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npx playwright test                           # e2e/ (ci-dessous) contre `vite preview`
      - uses: treosh/lighthouse-ci-action@v12
        with:
          urls: http://localhost:4173/ http://localhost:4173/explorer http://localhost:4173/p/les-trois-metis
          budgetPath: ./lighthouse-budget.json
          uploadArtifacts: true
```
`lighthouse-budget.json` : `[{ "path": "/*", "timings": [{ "metric": "largest-contentful-paint", "budget": 2500 }], "resourceSizes": [{ "resourceType": "total", "budget": 500 }, { "resourceType": "image", "budget": 250 }], "resourceCounts": [{ "resourceType": "total", "budget": 35 }] }]`.
⚠ Les pages appellent Supabase en prod même depuis la CI : les tests doivent rester **en lecture** (jamais d'inscription réelle depuis la CI — règle « une suite de tests n'écrit jamais dans une base de production »).

## 2. `e2e/` — six scénarios Playwright (lecture seule)

| Fichier | Vérifie |
|---|---|
| `accueil.spec.ts` | h1 présent, 1ʳᵉ carte de récit cliquable → `/post/:id` ouvre le récit avec son texte |
| `recherche.spec.ts` | `/recherche?q=hotel` rend ≥ 1 résultat avec un lien `/p/` |
| `fiche.spec.ts` | `/p/les-trois-metis` : h1, bouton « Demander » ou WhatsApp visible, JSON-LD parsable |
| `destination.spec.ts` | `/lieu/mahajanga` : sections « Où dormir » / « Où manger » non vides, carte Leaflet montée |
| `auth.spec.ts` | `/auth` : 2 champs étiquetés, mot de passe < 8 → message, bouton Google présent si `google_login` |
| `mobile.spec.ts` | 390 px : `document.documentElement.scrollWidth === 390` sur 5 pages ; menu s'ouvre et se ferme à Échap |
| `a11y.spec.ts` | `@axe-core/playwright` : 0 violation serious/critical sur 6 pages |

`playwright.config.ts` : `use: { userAgent: "<Android réel>", viewport: { width: 390, height: 844 } }` — **jamais** l'agent Chromium nu (page 429 d'o2switch quand on vise la prod).

Les parcours **en écriture** (inscription, publication, revendication, messages) se jouent **à la main** avant le lancement (07-checklist), pas en CI.

## 3. Alerte sur `journal_erreurs` (1 h)

Migration `0122_alerte_erreurs.sql` :
```sql
-- Toutes les 10 minutes, si plus de 3 erreurs nouvelles : un mail (pg_net → Edge Function send-push
-- ou un simple appel HTTP vers un webhook Telegram du pont des bots).
select cron.schedule('diako-alerte-erreurs', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://eifrwecaszzqrdwjjjbu.supabase.co/functions/v1/alerte-erreurs',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('depuis', now() - interval '10 minutes')
  ) where (select count(*) from public.journal_erreurs where created_at > now() - interval '10 minutes') > 3;
$$);
```
(`pg_cron` et `pg_net` à activer dans Extensions — **NON VÉRIFIÉ** qu'ils le sont.) L'Edge Function `alerte-erreurs` (nouvelle, 40 lignes) lit les erreurs et envoie un message Telegram au bot du pont (`~\hermes`), qui joint Andry déjà pour les autres bots. Alternative sans code : Sentry gratuit (5 000 événements/mois) — `@sentry/react` + `Sentry.init({ dsn, tracesSampleRate: 0 })` — mais c'est un tiers de plus dans la CSP et les données partent aux États-Unis : préférer l'alerte maison.

## 4. Disponibilité (0,3 h)

UptimeRobot (gratuit, 5 min) sur `https://diako.fonenako.mg/` (mot-clé attendu : « Diako ») et `https://diako.fonenako.mg/sitemap.xml` (mot-clé `<urlset`). Alerte par e-mail à `contact.diako@gmail.com`. ⚠ Agent utilisateur du moniteur à déclarer réaliste, sinon o2switch le bloque en 429 et l'alerte crie à tort.
