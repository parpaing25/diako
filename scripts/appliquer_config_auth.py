# -*- coding: utf-8 -*-
"""
Applique la configuration d'authentification Supabase de Diako qui ne passe
par AUCUNE migration : gabarits d'e-mail en français, sujets, politique de
mot de passe. À lancer UNE fois (et à relancer si les gabarits changent).

    python scripts/appliquer_config_auth.py

POURQUOI CE SCRIPT. Le 23/08/2026, les gabarits en base étaient encore ceux
d'usine, en anglais (« Confirm your email address ») alors que les versions
françaises existaient dans supabase/templates/ depuis le 31/07. Le tableau
de bord est le seul autre chemin, et personne n'y retourne jamais.

Jeton : ~/.fonenako-secrets/supabase_token.txt (jeton personnel du compte,
le même que celui du bot). Aucun secret n'est écrit ni affiché ici.

Pense-bête lié (une ligne SQL, éditeur SQL du connecteur ou du tableau de
bord) — ouvre le bouton « Continuer avec Google » sur /auth :

    insert into app_flags (cle, actif) values ('google_login', true)
    on conflict (cle) do update set actif = true;
"""
import json
import os
import sys
import urllib.request

PROJET = "eifrwecaszzqrdwjjjbu"
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GABARITS = os.path.join(RACINE, "supabase", "templates")


def lire(nom: str) -> str:
    with open(os.path.join(GABARITS, nom), encoding="utf-8") as f:
        return f.read()


def jeton() -> str:
    chemin = os.path.expanduser("~/.fonenako-secrets/supabase_token.txt")
    # utf-8-sig : un BOM en tête d'un en-tête HTTP fait échouer la requête
    # avant même l'envoi (piège déjà documenté dans les bots).
    with open(chemin, encoding="utf-8-sig") as f:
        return f.read().strip().splitlines()[0].strip()


def main() -> int:
    corps = {
        "mailer_subjects_confirmation": "Diako — confirmez votre adresse e-mail",
        "mailer_subjects_recovery": "Diako — réinitialiser votre mot de passe",
        "mailer_subjects_magic_link": "Diako — votre lien de connexion",
        "mailer_subjects_invite": "Diako — vous êtes invité",
        "mailer_subjects_email_change": "Diako — confirmez votre nouvelle adresse",
        "mailer_templates_confirmation_content": lire("confirmation.html"),
        "mailer_templates_recovery_content": lire("recovery.html"),
        "mailer_templates_magic_link_content": lire("magic_link.html"),
        # Pas de gabarit « invite » dédié : le lien magique fait le même travail.
        "mailer_templates_invite_content": lire("magic_link.html"),
        "mailer_templates_email_change_content": lire("email_change.html"),
        # 6 → 8 : aligne le serveur sur ce que le client exige déjà (Auth.tsx).
        "password_min_length": 8,
        # Lettres ET chiffres (pas de symbole obligatoire : clavier de téléphone).
        "password_required_characters": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
        # Changer son mot de passe demande l'ancien.
        "security_update_password_require_reauthentication": True,
        # Plus de localhost dans les redirections OAuth acceptées (audit 05/09).
        "uri_allow_list": "https://diako.fonenako.mg/**",
    }
    # ⚠ RÉGLAGES DU PLAN PRO, TENTÉS À PART. Le 06/09/2026, Andry a lancé ce
    #   script : Supabase a répondu 402 « Configuring leaked password protection
    #   via HaveIBeenPwned.org is available on Pro Plans and up » — et ce seul
    #   refus a annulé TOUT le PATCH (aucun sujet, aucun gabarit posé). Le corps
    #   principal ne porte donc plus que ce que le plan gratuit accepte ; ceux-ci
    #   sont essayés ensuite, un par un, et leur refus est seulement signalé.
    pro = {
        "password_hibp_enabled": True,          # mots de passe divulgués (HIBP)
        "sessions_inactivity_timeout": 43200,   # 30 jours sans activité (minutes)
        "sessions_timebox": 129600,             # 90 jours au plus
    }
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJET}/config/auth",
        data=json.dumps(corps, ensure_ascii=False).encode("utf-8"),
        method="PATCH",
        headers={
            "Authorization": f"Bearer {jeton()}",
            "Content-Type": "application/json",
            "User-Agent": "diako-config-auth/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            apres = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"ÉCHEC HTTP {e.code} — {e.read().decode()[:500]}")
        return 1

    for cle, val in pro.items():
        req_pro = urllib.request.Request(
            f"https://api.supabase.com/v1/projects/{PROJET}/config/auth",
            data=json.dumps({cle: val}).encode("utf-8"),
            method="PATCH",
            headers={"Authorization": f"Bearer {jeton()}", "Content-Type": "application/json",
                     "User-Agent": "diako-config-auth/1.0"},
        )
        try:
            with urllib.request.urlopen(req_pro, timeout=60) as r:
                apres = json.load(r)
            print(f"  {cle} : posé")
        except urllib.error.HTTPError as e:
            print(f"  {cle} : refusé (HTTP {e.code}, plan gratuit) — à reprendre si passage au plan Pro")

    ok_sujet = apres.get("mailer_subjects_confirmation", "").startswith("Diako")
    ok_gabarit = 'lang="fr"' in (apres.get("mailer_templates_confirmation_content") or "")
    print(f"Sujets en français : {'oui' if ok_sujet else 'NON'}")
    print(f"Gabarits en français : {'oui' if ok_gabarit else 'NON'}")
    print(f"Longueur mini du mot de passe : {apres.get('password_min_length')}")
    print(f"Caractères exigés : {'lettres+chiffres' if apres.get('password_required_characters') else 'aucun'}")
    print(f"Ré-authentification pour changer le mot de passe : {apres.get('security_update_password_require_reauthentication')}")
    print(f"Redirections acceptées : {apres.get('uri_allow_list')}")
    print(f"Refus des mots de passe divulgués : {apres.get('password_hibp_enabled')}")
    if not (ok_sujet and ok_gabarit):
        print("⚠ La réponse ne reflète pas les gabarits attendus — vérifier au tableau de bord.")
        return 1
    print("✓ Configuration d'authentification appliquée.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
