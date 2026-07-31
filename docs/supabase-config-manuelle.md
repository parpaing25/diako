# Réglages Supabase à faire à la main

Ce qui ne peut pas vivre dans le dépôt : la configuration du tableau de bord
Supabase (projet **Diako** — `eifrwecaszzqrdwjjjbu`).
À rejouer à l'identique en cas de recréation du projet.

---

## 1. SMTP — ✅ FAIT et vérifié le 31/07/2026

*Authentication → Emails → SMTP Settings*

| Champ | Valeur |
|---|---|
| Sender email | `no-reply@diako.fonenako.mg` |
| Sender name | `Diako` |
| Host | `mail.fonenako.mg` |
| Port | `465` |
| Username | `no-reply@diako.fonenako.mg` |
| Password | voir `~/.diako-secrets/smtp.env` |
| Minimum interval | `60` s |

> ⚠️ Le **Host** est `mail.fonenako.mg`, pas `mail.diako.fonenako.mg` (n'existe
> pas) ni `mail.anfa7857.odns.fr` (certificat émis pour `karla.o2switch.net`,
> donc rejeté par toute validation TLS stricte).
>
> ⚠️ Le **Username** est l'adresse **complète**. Un simple `no-reply` échoue.

Vérifié de bout en bout : authentification TLS OK, mail de confirmation
Supabase reçu en ~1 s dans la boîte, expédié « Diako
<no-reply@diako.fonenako.mg> ». SPF et DKIM sont VALID sur
`diako.fonenako.mg` (contrôlés côté cPanel **et** dans le DNS public).

---

## 2. URL du site — 🔴 À FAIRE, bloquant

*Authentication → URL Configuration*

Par défaut, Supabase laisse `http://localhost:3000`. Conséquence mesurée : le
lien de confirmation d'un vrai utilisateur le renvoie **sur son propre
ordinateur**, sur une page qui n'existe pas. L'inscription devient impossible
à terminer.

| Champ | Valeur |
|---|---|
| **Site URL** | `https://diako.fonenako.mg` |
| **Redirect URLs** | `https://diako.fonenako.mg/**`<br>`http://localhost:8080/**` *(pour le développement local)* |

---

## 3. Modèles d'e-mail en français — à faire

*Authentication → Emails → Templates*

Les modèles par défaut sont en anglais (« Confirm your email address »). Pour
un produit grand public malgache, c'est à traduire. Coller tel quel :

### Confirm signup

**Subject** : `Diako — confirmez votre adresse e-mail`

```html
<div style="font-family:Inter,system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10262B">
  <p style="font-size:24px;font-weight:700;color:#0E7C86;margin:0 0 24px">Diako</p>
  <h1 style="font-size:20px;margin:0 0 12px">Confirmez votre adresse</h1>
  <p style="line-height:1.6;margin:0 0 24px">
    Bienvenue sur Diako. Il reste une étape : confirmez votre adresse e-mail
    pour activer votre compte.
  </p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0E7C86;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600">
      Confirmer mon adresse
    </a>
  </p>
  <p style="line-height:1.6;font-size:13px;color:#5B6E72;margin:0 0 8px">
    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
    <span style="word-break:break-all">{{ .ConfirmationURL }}</span>
  </p>
  <p style="font-size:13px;color:#5B6E72;line-height:1.6;margin:24px 0 0">
    Vous n'avez pas créé de compte&nbsp;? Ignorez ce message, rien ne sera activé.
  </p>
  <p style="font-size:12px;color:#8A9BA0;margin:32px 0 0">
    Diako — où dormir, où manger et avec qui partir à Madagascar.
  </p>
</div>
```

### Reset password

**Subject** : `Diako — réinitialiser votre mot de passe`

```html
<div style="font-family:Inter,system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10262B">
  <p style="font-size:24px;font-weight:700;color:#0E7C86;margin:0 0 24px">Diako</p>
  <h1 style="font-size:20px;margin:0 0 12px">Nouveau mot de passe</h1>
  <p style="line-height:1.6;margin:0 0 24px">
    Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable
    une heure.
  </p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0E7C86;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600">
      Choisir un nouveau mot de passe
    </a>
  </p>
  <p style="font-size:13px;color:#5B6E72;line-height:1.6;margin:0">
    Vous n'êtes pas à l'origine de cette demande&nbsp;? Ignorez ce message :
    votre mot de passe actuel reste valable.
  </p>
  <p style="font-size:12px;color:#8A9BA0;margin:32px 0 0">
    Diako — où dormir, où manger et avec qui partir à Madagascar.
  </p>
</div>
```

---

## 4. Google — quand les identifiants OAuth existeront

*Authentication → Providers → Google*, puis lever le drapeau **en base**
(aucun redéploiement nécessaire) :

```sql
update app_flags set actif = true where cle = 'google_login';
```

Redirect URI à déclarer côté Google Cloud :
`https://eifrwecaszzqrdwjjjbu.supabase.co/auth/v1/callback`

---

## 5. Clé d'API d'upload o2switch — à faire

`public/api/o2upload.php` attend une clé partagée côté serveur pour accepter
les téléversements. Tant qu'elle n'est pas posée, le changement de photo de
profil échouera.
