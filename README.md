# Diako

**Le réseau social malgache du voyage et du tourisme.**
Où dormir, où manger et avec qui partir à Madagascar.

En ligne : [diako.fonenako.mg](https://diako.fonenako.mg)
Documents : [`docs/`](docs/README.md) — dont le [TDR](docs/TDR-DIAKO.md), document de référence, et ses [20 pièges à ne jamais reproduire](docs/TDR-DIAKO.md#annexe-b--les-20-pièges-à-ne-jamais-reproduire)

---

## Ce qu'est ce dépôt

Diako v3, reconstruit à partir du socle éprouvé de **fonenako.mg** (le produit frère, en production).
Les versions précédentes (`Diako-V2`, `diako-travel-connect`, Firebase + PHP + MySQL) sont **abandonnées** : voir §1.4 du TDR.

| | |
|---|---|
| Stack | Vite · React 18 · TypeScript · Tailwind · shadcn/ui · Supabase |
| Base | Projet Supabase **`eifrwecaszzqrdwjjjbu`** (eu-west-3), **séparé de Fonenako** |
| Hébergement | o2switch `anfa7857`, sous-domaine `diako.fonenako.mg` |
| Images | **o2switch uniquement**, jamais Supabase Storage |

## Démarrer

```bash
npm install
npm run dev        # http://localhost:8080
npm run build      # tsc --noEmit && vite build
npm run deploy     # build + envoi FTP vers diako.fonenako.mg
```

## Les règles du projet

Elles ne sont pas des préférences de style : chacune corrige un incident réel
vécu en production sur le produit frère. L'annexe B du TDR liste les 20 pièges.

1. **Jamais de `select('*')`.** La fermeture des données personnelles (migration 0001 §7)
   révoque le `SELECT` au niveau table puis l'accorde colonne par colonne : une
   étoile renvoie **401** pour un visiteur anonyme. Toute nouvelle colonne exige
   un `GRANT` explicite ajouté à la migration.
2. **Realtime = chat + notifications, point.** Partout ailleurs, rafraîchissement
   au focus. Sur Fonenako, 17 channels ont produit ~6 Go/mois de heartbeats sur
   un quota gratuit de 2 Go.
3. **Aucune image ne passe par Supabase Storage.** Tout sur o2switch, avec
   vignettes. C'est le facteur 17 entre 70 Ko et 1,2 Mo d'egress par visite.
4. **Pagination par curseur, jamais par offset.**
5. **Jamais de `.single()` en écriture** → « Cannot coerce the result to a single
   JSON object ». Toujours `.select('id')`.
6. **`profiles.id = auth.uid()`** — on filtre par `id`, il n'y a pas de `user_id`.
7. **Une seule source de vérité pour le schéma** : `supabase/migrations/`, numéroté.
   Aucun SQL collé à la main. `types.ts` régénéré après **chaque** migration.
8. **`tsc --noEmit` fait partie du build.** Non négociable : l'ancien Diako
   buildait sans vérification de types et un `item.badge` inexistant est parti
   en production.
9. **Ne jamais retirer le `manualChunk` radix-vendor** (page blanche Firefox) ni
   `skipWaiting()`/`clientsClaim()` du service worker (page blanche après
   chaque déploiement).

## Où on en est

| Lot | Contenu | État |
|---|---|---|
| **0** | Socle : auth, profils, chaîne d'images, PWA, charte, CI | ✅ |
| 1 | Référentiels : lieux, plats, équipements | à faire |
| 2 | Pages pro : hôtels, restaurants, agences + catalogue | à faire |
| 3 | Recherche + barre de réponse | à faire |
| 4 | Fil infini + modération | à faire |
| 5 | Demandes, messagerie, notifications, avis | à faire |
| 7 | Administration, vérification, mise en avant, paiements | à faire |

## Réglages manuels restants (côté Supabase)

Ces trois points demandent des identifiants que le code ne peut pas fournir :

- **SMTP** — par défaut, Supabase envoie les e-mails de confirmation via son
  service partagé, limité à quelques envois par heure. Pour la production :
  Authentication → Emails → SMTP, avec le compte o2switch.
- **Google** — créer les identifiants OAuth, les coller dans Authentication →
  Providers, puis lever le drapeau :
  `update app_flags set actif = true where cle = 'google_login';`
- **Clé d'upload o2switch** — `public/api/o2upload.php` attend la variable
  d'environnement de la clé API côté serveur (voir `~/.diako-secrets`).

## Structure

```
public/          .htaccess (versionné), app-init.js, sw.js, api/*.php, fonts/
src/
  components/    coquille (Header, BottomNav, ErrorBoundary) + ui/ (shadcn)
  contexts/      AuthContext, UserDataContext
  integrations/  client Supabase + types générés
  lib/           images (compression, upload o2switch, vignettes), flags, audience
  pages/         Index, Auth, Bienvenue, Compte, Bientot, NotFound
supabase/
  migrations/    source de vérité UNIQUE du schéma
docs/            TDR-DIAKO.md
```
