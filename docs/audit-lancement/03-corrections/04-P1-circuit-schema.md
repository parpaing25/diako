# 03-04 — P1 · `/circuit/:slug` : la page interroge des colonnes qui n'existent pas

**Constat (02-FN1).** `GET /rest/v1/tours?select=…prices:tour_prices(pax_min,…)` → **400 `42703 column tour_prices_1.pax_min does not exist`** (reproduit par `curl` le 05/09). L'écran rend « Quelque chose s'est mal passé » sur l'unique circuit (`nosy-iranja-1-nosy-be-sido-tours`).

Schéma réel (information_schema, 05/09) :

| Table | Colonnes réelles | Ce que `Circuit.tsx` demande |
|---|---|---|
| `tour_prices` | `id, tour_id, base_pax, price_ar, price_unit` | `pax_min, pax_max, price_ar, price_unit` |
| `tour_days` | `tour_id, jour, titre, detail, place_id, nuitee` | `day_no, title, km, hours, meals, lodging` |
| `tour_inclusions` | `id, tour_id, libelle, inclus, sort_order` | `label, included` |

Le rendu prévoyait des paliers `pax_min–pax_max`, des kilomètres et des heures par jour : **ces données n'existent pas en base** (0 ligne dans les trois tables). Règle du projet : « Aucune donnée inventée » → le rendu s'aligne sur ce qui existe, et dit ce qui manque.

## `src/pages/Circuit.tsx`

### a. Type `Fiche` (lignes 50-52)

```ts
  prices: { base_pax: number | null; price_ar: number; price_unit: string | null }[];
  days: { jour: number; titre: string | null; detail: string | null; nuitee: string | null; place_id: string | null }[];
  inclusions: { libelle: string; inclus: boolean; sort_order: number | null }[];
```

### b. Requête (lignes 66-73)

```ts
        .select(
          "id, slug, title, summary, description, duration_days, duration_nights, difficulty, " +
            "format, axe, months_open, transports, page:pages(slug, name, verification_status), " +
            "prices:tour_prices(base_pax, price_ar, price_unit), " +
            "days:tour_days(jour, titre, detail, nuitee, place_id), " +
            "inclusions:tour_inclusions(libelle, inclus, sort_order)"
        )
```

### c. Dérivations (lignes 120-123)

```ts
  const inclus = [...(f.inclusions ?? [])].filter((i) => i.inclus).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const nonInclus = [...(f.inclusions ?? [])].filter((i) => !i.inclus).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const paliers = [...(f.prices ?? [])].sort((a, b) => (a.base_pax ?? 0) - (b.base_pax ?? 0));
  const jours = [...(f.days ?? [])].sort((a, b) => a.jour - b.jour);
```

### d. Rendu des jours (lignes 160-178)

```tsx
<li key={j.jour} className="flex gap-3">
  <span className="…">{j.jour}</span>
  <div>
    {j.titre && <p className="font-semibold leading-tight">{j.titre}</p>}
    {j.detail && <p className="text-sm text-muted-foreground">{j.detail}</p>}
    {j.nuitee && <p className="mt-1 text-xs text-muted-foreground">Nuit : {j.nuitee}</p>}
  </div>
</li>
```
(supprimer les lignes `km`, `hours`, `meals`, `lodging` : 168-177.)

### e. Inclusions (lignes 195 et 205) : `key={i.libelle}` / `· {i.libelle}`.

### f. Paliers de prix (lignes 228-233)

```tsx
<li key={`${p.base_pax ?? "base"}-${p.price_unit ?? ""}`} className="…">
  <p className="text-xs">{p.base_pax ? `base ${p.base_pax} pers.` : "prix de base"}</p>
  <p className="mt-1 text-sm font-bold tabular-nums">{ariary(p.price_ar)}</p>
  {p.price_unit && <p className="text-[12px] text-muted-foreground">{p.price_unit}</p>}
</li>
```
Et quand `paliers.length === 0` (cas réel aujourd'hui) : « Tarif sur demande — écrivez à l'agence » avec le bouton « Demander » existant (jamais « Réserver »).

### g. Commentaire d'en-tête (ligne 18) : remplacer « par palier de `pax_min` » par « par `base_pax` (nombre de personnes sur lequel le prix est calculé) ».

## `types.ts`

Régénérer après vérification (`supabase gen types` par le connecteur `generate_typescript_types`) : les trois tables y sont déjà avec les bonnes colonnes ; c'est la page qui était fausse, pas les types.

## Test à ajouter — `src/lib/contratCircuit.test.ts`

Un test qui **compare la chaîne `select` de la page aux colonnes de `types.ts`** (même principe que `scripts/verifier_contrat_client_base.py`) : il aurait attrapé ce bug à la première exécution de la CI.

## Vérification

```bash
curl -s "https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1/tours?select=id,prices:tour_prices(base_pax,price_ar,price_unit),days:tour_days(jour,titre,detail,nuitee,place_id),inclusions:tour_inclusions(libelle,inclus,sort_order)&slug=eq.nosy-iranja-1-nosy-be-sido-tours" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```
→ 200 avec `prices: []`, `days: []`, `inclusions: []` ; la page doit alors afficher le résumé, la durée et « Tarif sur demande », **pas** l'écran d'erreur.

Tant que `/circuits` reste « bientôt » (`nav.ts:105`), retirer `/circuits` du sitemap (03-03) ; la route `/circuit/:slug` peut rester : elle ne sera atteinte que par lien direct.
