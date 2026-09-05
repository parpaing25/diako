# 03-05 — P1 · Authentification : mot de passe serveur, HIBP, captcha, e-mails en français, liste de redirections, sessions, DMARC

**Constats (02-SE1, SE2, SE3, SE6, SE7, FN2).** Lus par l'API de gestion le 05/09/2026 : `password_min_length = 6`, `password_required_characters = ""`, `password_hibp_enabled = false`, `security_captcha_enabled = false`, `mailer_subjects_confirmation = "Confirm your email address"` (gabarits d'usine, en anglais), `uri_allow_list` contient `http://localhost:8080/**`, `sessions_timebox = 0`, `security_update_password_require_reauthentication = false`.

⚠ **Aucune de ces écritures ne se fait depuis une session Claude sans l'ordre explicite d'Andry** (règle du 03/09). Tout est préparé ; il reste à lancer.

## 1. Script existant, jamais lancé — `scripts/appliquer_config_auth.py`

Il pose déjà : sujets et gabarits français (`supabase/templates/*.html`), `password_min_length: 8`, `password_hibp_enabled: true`. **Compléter le corps `corps = {...}` (ligne 47)** avec :

```python
        # Complexité : lettres ET chiffres (pas de symboles obligatoires : clavier
        # de téléphone). Les 4 valeurs admises par Supabase sont documentées ;
        # celle-ci est la plus douce qui exclue « azertyuiop ».
        "password_required_characters": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
        # Sessions : 30 jours d'inactivité, 90 jours au plus (minutes).
        "sessions_inactivity_timeout": 43200,
        "sessions_timebox": 129600,
        # Changer son mot de passe demande l'ancien.
        "security_update_password_require_reauthentication": True,
        # Plus de localhost dans les redirections OAuth acceptées.
        "uri_allow_list": "https://diako.fonenako.mg/**",
```
Puis, **sur ordre d'Andry** :
```
cd ~/Desktop/Diako && python scripts/appliquer_config_auth.py
```
Le script relit la configuration et affiche « ✓ ». Le client (`Auth.tsx:69`) exige déjà 8 caractères : aucun changement d'écran. Ajouter sous le champ : « 8 caractères, avec des lettres et des chiffres. »

## 2. Captcha à l'inscription et à la connexion — Cloudflare Turnstile (gratuit, sans cookie tiers)

1. Créer le widget sur dash.cloudflare.com → Turnstile → domaine `diako.fonenako.mg` (mode « Managed »). Clé de site (publique) et clé secrète.
2. Supabase (même script, ou tableau de bord → Auth → Attack protection) : `security_captcha_enabled: true`, `security_captcha_provider: "turnstile"`, `security_captcha_secret: <clé secrète>` — **la clé secrète vit dans `~/.diako-secrets/turnstile.env`, jamais dans le dépôt**.
3. Client `src/pages/Auth.tsx` :
```tsx
// index.html : <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
// .htaccess (CSP) : script-src + https://challenges.cloudflare.com ; frame-src https://challenges.cloudflare.com
const [captcha, setCaptcha] = useState<string | null>(null);
useEffect(() => {
  window.turnstile?.render("#turnstile", { sitekey: TURNSTILE_SITE_KEY, callback: setCaptcha, language: "fr" });
}, []);
...
await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/bienvenue`, captchaToken: captcha ?? undefined } });
await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captcha ?? undefined } });
```
et `<div id="turnstile" className="mt-3" />` au-dessus du bouton. Le bouton reste désactivé tant que `captcha` est nul, avec le texte « Vérification… ».
4. `VITE_TURNSTILE_SITE_KEY` dans `.env.production` (clé **publique**, peut être commise).

## 3. E-mails en français — déjà dans le script (`supabase/templates/confirmation.html`, `recovery.html`, `magic_link.html`, `email_change.html`). Après exécution, **envoyer un vrai e-mail de test** : inscription avec une adresse jetable, vérifier sujet « Diako — confirmez votre adresse e-mail », expéditeur `Diako <no-reply@diako.fonenako.mg>`, lien vers `/bienvenue`.

## 4. DMARC — DNS de `fonenako.mg` (registrar)

Aujourd'hui : `v=DMARC1; p=none;`. Étape 1 (jour J) : `v=DMARC1; p=none; rua=mailto:contact.diako@gmail.com; pct=100` pour recevoir les rapports. Étape 2 (J+15, si les rapports ne montrent que des sources légitimes) : `p=quarantine`. Étape 3 (J+45) : `p=reject`.

## 5. Bouton Google — retour sur `/bienvenue` (02-FN3)

`src/pages/Auth.tsx:106-112` : `redirectTo: \`${window.location.origin}/bienvenue\``, et dans `Bienvenue.tsx` rediriger vers `/` si le profil est déjà complet (type de compte renseigné).

## Vérification

```bash
python - <<'EOF'
import json,urllib.request
tok=open(__import__('os').path.expanduser('~/.fonenako-secrets/supabase_token.txt'),encoding='utf-8-sig').read().strip()
r=urllib.request.urlopen(urllib.request.Request('https://api.supabase.com/v1/projects/eifrwecaszzqrdwjjjbu/config/auth',headers={'Authorization':'Bearer '+tok}))
c=json.load(r); print({k:c.get(k) for k in ['password_min_length','password_hibp_enabled','password_required_characters','security_captcha_enabled','mailer_subjects_confirmation','uri_allow_list','sessions_timebox']})
EOF
```
Attendu : 8 / True / lettres+chiffres / True / « Diako — confirmez… » / sans localhost / 129600.
