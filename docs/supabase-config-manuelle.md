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

## 2. URL du site — ✅ FAIT, vérifié le 16/08/2026

*Authentication → URL Configuration*

| Champ | Valeur en place |
|---|---|
| **Site URL** | `https://diako.fonenako.mg` |
| **Redirect URLs** | `https://diako.fonenako.mg/**`, `http://localhost:8080/**` |

> ⚠️ Cette section a porté un « 🔴 À FAIRE, bloquant » longtemps après avoir été
> réglée. Un document qui annonce une panne inexistante coûte deux fois : on
> perd du temps à la corriger, et on cesse de croire au reste du document.
> Relu directement sur l'API de gestion, pas de mémoire.

---

## 3. Modèles d'e-mail en français — 🔴 À FAIRE

*Authentication → Emails → Templates*

Les **cinq** gabarits sont encore ceux de Supabase : anglais, sans mise en
forme, lien bleu par défaut. C'est le premier contact d'un inscrit avec la
marque, et il ressemble à un message technique reçu par erreur.

> ⚠️ **CINQ, PAS DEUX.** Ce document ne prévoyait que la confirmation et le mot
> de passe. Le lien magique, l'invitation et le changement d'adresse partent
> donc aussi en anglais — et ce sont eux qu'on oublie, parce qu'on ne les
> déclenche jamais soi-même en testant.

Coller tel quel, objet **et** contenu, pour chacun des cinq :

### confirmation

**Subject** : `Diako — confirmez votre adresse e-mail`

```html
<div style="font-family:Inter,system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10262B">
  <p style="font-size:24px;font-weight:700;color:#0E7C86;margin:0 0 24px">Diako</p>
  <h1 style="font-size:20px;margin:0 0 12px">Confirmez votre adresse</h1>
  <p style="line-height:1.6;margin:0 0 24px">Bienvenue sur Diako. Il reste une étape&nbsp;: confirmez votre adresse e-mail pour activer votre compte.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0E7C86;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600">
      Confirmer mon adresse
    </a>
  </p>
  <p style="line-height:1.6;font-size:13px;color:#5B6E72;margin:0 0 8px">
    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br>
    <span style="word-break:break-all">{{ .ConfirmationURL }}</span>
  </p>
  <p style="font-size:13px;color:#5B6E72;line-height:1.6;margin:24px 0 0">Vous n'avez pas créé de compte&nbsp;? Ignorez ce message, rien ne sera activé.</p>
  <p style="font-size:12px;color:#8A9BA0;margin:32px 0 0">
    Diako — où dormir, où manger et avec qui partir à Madagascar.
  </p>
</div>
```

### recovery

**Subject** : `Diako — réinitialiser votre mot de passe`

```html
<div style="font-family:Inter,system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10262B">
  <p style="font-size:24px;font-weight:700;color:#0E7C86;margin:0 0 24px">Diako</p>
  <h1 style="font-size:20px;margin:0 0 12px">Nouveau mot de passe</h1>
  <p style="line-height:1.6;margin:0 0 24px">Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable une heure.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0E7C86;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600">
      Choisir un nouveau mot de passe
    </a>
  </p>
  <p style="line-height:1.6;font-size:13px;color:#5B6E72;margin:0 0 8px">
    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br>
    <span style="word-break:break-all">{{ .ConfirmationURL }}</span>
  </p>
  <p style="font-size:13px;color:#5B6E72;line-height:1.6;margin:24px 0 0">Vous n'êtes pas à l'origine de cette demande&nbsp;? Ignorez ce message&nbsp;: votre mot de passe actuel reste valable.</p>
  <p style="font-size:12px;color:#8A9BA0;margin:32px 0 0">
    Diako — où dormir, où manger et avec qui partir à Madagascar.
  </p>
</div>
```

### magic_link

**Subject** : `Diako — votre lien de connexion`

```html
<div style="font-family:Inter,system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10262B">
  <p style="font-size:24px;font-weight:700;color:#0E7C86;margin:0 0 24px">Diako</p>
  <h1 style="font-size:20px;margin:0 0 12px">Votre lien de connexion</h1>
  <p style="line-height:1.6;margin:0 0 24px">Suivez ce lien pour vous connecter à Diako. Il expire rapidement et ne peut servir qu'une fois.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0E7C86;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600">
      Me connecter
    </a>
  </p>
  <p style="line-height:1.6;font-size:13px;color:#5B6E72;margin:0 0 8px">
    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br>
    <span style="word-break:break-all">{{ .ConfirmationURL }}</span>
  </p>
  <p style="font-size:13px;color:#5B6E72;line-height:1.6;margin:24px 0 0">Vous n'avez pas demandé à vous connecter&nbsp;? Ignorez ce message.</p>
  <p style="font-size:12px;color:#8A9BA0;margin:32px 0 0">
    Diako — où dormir, où manger et avec qui partir à Madagascar.
  </p>
</div>
```

### invite

**Subject** : `Diako — vous êtes invité`

```html
<div style="font-family:Inter,system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10262B">
  <p style="font-size:24px;font-weight:700;color:#0E7C86;margin:0 0 24px">Diako</p>
  <h1 style="font-size:20px;margin:0 0 12px">Vous êtes invité sur Diako</h1>
  <p style="line-height:1.6;margin:0 0 24px">Quelqu'un vous invite à rejoindre Diako. Suivez ce lien pour créer votre compte.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0E7C86;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600">
      Accepter l'invitation
    </a>
  </p>
  <p style="line-height:1.6;font-size:13px;color:#5B6E72;margin:0 0 8px">
    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br>
    <span style="word-break:break-all">{{ .ConfirmationURL }}</span>
  </p>
  
  <p style="font-size:12px;color:#8A9BA0;margin:32px 0 0">
    Diako — où dormir, où manger et avec qui partir à Madagascar.
  </p>
</div>
```

### email_change

**Subject** : `Diako — confirmez votre nouvelle adresse`

```html
<div style="font-family:Inter,system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10262B">
  <p style="font-size:24px;font-weight:700;color:#0E7C86;margin:0 0 24px">Diako</p>
  <h1 style="font-size:20px;margin:0 0 12px">Confirmez votre nouvelle adresse</h1>
  <p style="line-height:1.6;margin:0 0 24px">Suivez ce lien pour confirmer <strong>{{ .NewEmail }}</strong> comme nouvelle adresse de votre compte Diako.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0E7C86;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600">
      Confirmer la nouvelle adresse
    </a>
  </p>
  <p style="line-height:1.6;font-size:13px;color:#5B6E72;margin:0 0 8px">
    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br>
    <span style="word-break:break-all">{{ .ConfirmationURL }}</span>
  </p>
  <p style="font-size:13px;color:#5B6E72;line-height:1.6;margin:24px 0 0">Vous n'avez pas demandé ce changement&nbsp;? Ignorez ce message&nbsp;: votre adresse actuelle reste la seule valable.</p>
  <p style="font-size:12px;color:#8A9BA0;margin:32px 0 0">
    Diako — où dormir, où manger et avec qui partir à Madagascar.
  </p>
</div>
```

---

## 4. Google — ✅ FAIT

*Authentication → Providers → Google* est activé, et le drapeau est levé en
base (`app_flags.google_login = true`, vérifié le 16/08/2026).

`facebook_login` reste à `false` : aucun identifiant OAuth Facebook n'a été
créé pour Diako.

Redirect URI déclarée côté Google Cloud :
`https://eifrwecaszzqrdwjjjbu.supabase.co/auth/v1/callback`

---

## 5. Clé d'API d'upload o2switch — ✅ FAIT

`O2SWITCH_UPLOAD_API_KEY` est posée dans `~/.env_diako` sur le serveur, et la
clé locale correspondante vit dans `~/.diako-secrets/env_diako.txt`
(64 caractères).

> ⚠️ Ce n'est **pas** la clé de Fonenako
> (`~/.fonenako-secrets/o2switch_upload_key.txt`, 55 caractères). Les deux
> sites exposent le même `o2upload.php` ; se tromper rend
> `{"error":"Unauthorized"}`, un message qui envoie chercher du côté des
> en-têtes alors que la requête est parfaite.

Vérifié le 16/08/2026 : 209 couvertures envoyées, trois tailles générées à
chaque fois.
