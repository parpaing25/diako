# 12 — P0 · Aucun courriel d'inscription n'était jamais remis (corrigé le 06/09/2026)

**C'est le défaut le plus grave trouvé pendant tout l'audit, et il était invisible.** Personne ne pouvait créer de compte sur Diako par adresse e-mail : le message de confirmation ne partait jamais. Les deux seuls comptes confirmés du projet viennent de Google, qui n'envoie aucun courriel — le défaut n'avait donc laissé aucune trace visible.

## Ce qui l'a révélé

L'audit du 05/09 notait « FN2 — inscription de bout en bout NON VÉRIFIÉE ». Le 06/09, le parcours a été joué pour de vrai sur la production, avec une adresse en alias de la boîte de l'équipe :

| Étape | Résultat |
|---|---|
| Formulaire d'inscription à 390 px | `200 /auth/v1/signup` ✅ |
| Compte créé en base | `confirmation_sent_at` renseigné ✅ |
| Courriel reçu | **rien**, ni en boîte, ni en indésirables, ni ailleurs (`in:anywhere`) ❌ |

Puis la preuve que ce n'était pas nouveau : le compte de test `onjaniaina27+test-diako-lancement@gmail.com`, **créé le 23/08/2026**, avait encore `email_confirmed_at` à `null` avec un `confirmation_sent_at` renseigné. Le défaut durait depuis au moins deux semaines.

⚠ La documentation affirmait pourtant : « Vérifié de bout en bout : … mail de confirmation Supabase reçu en ~1 s dans la boîte » (31/07). Ce qui avait été vérifié ce jour-là, c'est l'**authentification** TLS — pas la remise d'un message.

## Deux causes, mesurées séparément

### 1. Le port 465 ne fonctionne pas depuis Supabase

Une fonction de diagnostic déployée dans l'infrastructure Supabase a ouvert le dialogue SMTP vers `mail.fonenako.mg` :

| Port | Depuis le poste d'Andry (Madagascar) | Depuis Supabase (`ec2-…eu-west-3`) |
|---|---|---|
| 465 (TLS implicite) | authentifie et délivre | **connexion cassée** (`Broken pipe`) |
| 587 (STARTTLS) | authentifie et délivre | `235 Authentication succeeded`, `MAIL FROM 250 OK`, `RCPT TO 250 Accepted` |

Le 465 était configuré depuis le 31/07.

### 2. Tout message contenant du HTML est accepté puis jeté

Quatre messages envoyés dans la **même** session SMTP, vers la **même** boîte, à quelques secondes d'intervalle :

| Cas | Contenu | Arrivé ? |
|---|---|---|
| A | sujet avec tiret cadratin et accents, **texte brut** | ✅ |
| C | témoin texte simple | ✅ |
| B | le gabarit HTML français de 4,6 Ko | ❌ jamais |
| D | **HTML minimal de 119 caractères** (un lien) | ❌ jamais |

Le serveur mutualisé répond `250 OK` puis ne remet pas. Ce n'est ni le sujet, ni les accents, ni la taille : c'est la présence d'une partie HTML. Or GoTrue n'envoie que du HTML — d'où l'échec total, silencieux, depuis le début.

## Le correctif en place

1. **Port 587** dans la configuration d'authentification.
2. **Limite d'envoi portée de 30 à 100 courriels par heure** : trente inscriptions suffisaient à bloquer toutes les suivantes un jour d'annonce, sans message clair pour la personne qui s'inscrit.
3. **Hook « Send Email »** activé vers la fonction `envoyer-courriel` (`supabase/functions/envoyer-courriel/index.ts`) : Supabase nous appelle, et la fonction compose elle-même un message **en texte brut** puis l'envoie par un client SMTP écrit à la main (le dialogue exact qui a été prouvé). La signature du hook est vérifiée (HMAC-SHA256, horodatage à 5 minutes).

Secrets posés : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SEND_EMAIL_HOOK_SECRET` (gardé dans `~/.diako-secrets/hook_email_secret.txt`).

## Vérification, de bout en bout, sur la production

| Étape | Résultat |
|---|---|
| Inscription | compte créé |
| Courriel « Diako — confirmez votre adresse e-mail » | **reçu en 2 secondes**, en boîte de réception, marqué important |
| Lien de confirmation ouvert | compte confirmé, session ouverte sur le site |
| Connexion par mot de passe | jeton obtenu |
| Export RGPD `mes_donnees()` | 12 rubriques, profil présent |
| Suppression du compte (`supprimer-mon-compte`) | `{"ok":true}`, compte disparu |
| Mot de passe oublié | courriel « Diako — réinitialiser votre mot de passe » **reçu** |

Les quatre comptes de test ont été supprimés : la base ne porte que les deux comptes réels.

## Ce qui reste ouvert

- **Le HTML n'est pas revenu.** Les gabarits français restent configurés et inutilisés. Pour retrouver des courriels en HTML : demander au support o2switch pourquoi les messages HTML de `no-reply@diako.fonenako.mg` ne sont pas remis, ou passer par un relais dédié (Brevo, Resend : gratuit à ce volume, DKIM propre, conçu pour l'envoi transactionnel). Il suffira alors de désactiver le hook.
- ~~**Un moniteur d'inscription** serait le vrai garde-fou~~ — **fait le 06/09 au soir** (migration **0125**). Une fois par jour à 06:00 UTC, si trois personnes ou plus ont reçu un courriel de confirmation sur sept jours glissants et qu'**aucune** n'a confirmé, la même chaîne que l'alerte d'erreurs (pg_cron → pg_net → `alerte-erreurs` → Telegram) envoie un message qui dit quoi vérifier, dans quel ordre. Ni compte de test créé, ni boîte à lire : une simple lecture de ce que GoTrue consigne déjà.
  Le seuil de trois évite de crier sur un abandon isolé, et **on n'alerte jamais sur « zéro inscription »** : un site calme et un expéditeur en panne se ressemblent, et une alerte qui crie pour rien s'apprend à ignorer. Chemin vérifié de bout en bout le 06/09 (message direct accepté, routé, journalisé) — il ne manque que le destinataire Telegram (09 §2 F).
