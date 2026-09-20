# -*- coding: utf-8 -*-
"""jeton_page.py — transforme un jeton UTILISATEUR (Graph Explorer, app Fonenako
Publisher 2) en jeton de PAGE Di'ako durable, et le range dans ~/.diako-secrets.

    python marketing/atelier/jeton_page.py

N'affiche JAMAIS un jeton : seulement le compte, l'app, les permissions, les dates.

⚠ Un jeton de Graph Explorer vit une à deux heures. Échangé contre un jeton
  longue durée (≈ 60 jours) PUIS dérivé en jeton de page, il n'expire plus — sauf
  si la session d'Andry est déconnectée : c'est exactement ce qui a tué, le
  18/09/2026, le jeton du profil onja et les 25 jetons de fb_pages.json
  (« The session is invalid because the user logged out »).
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SECRETS = Path.home() / ".diako-secrets"
PAGE_DIAKO = "108742855158464"          # facebook.com/DiakoMDG, 14 K — PAS 104126917813219 (DiakoMada)
V = "v21.0"


def env_publisher2() -> dict:
    """App id / secret de Fonenako Publisher 2, déjà rangés pour le profil onja."""
    env = {}
    for l in (Path.home() / ".hermes/profiles/onja/.env").read_text(encoding="utf-8-sig").splitlines():
        if "=" in l and not l.strip().startswith("#"):
            k, v = l.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def g(chemin: str, **p) -> dict:
    q = urllib.parse.urlencode(p)
    try:
        return json.load(urllib.request.urlopen(f"https://graph.facebook.com/{V}/{chemin}?{q}", timeout=40))
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode("utf-8", "replace")).get("error", {})
        return {"ERREUR": {k: err.get(k) for k in ("code", "error_subcode", "message")}}


def main() -> int:
    court = (SECRETS / "fb_user_token_court.txt").read_text(encoding="utf-8").strip()
    env = env_publisher2()
    app = f"{env['META_APP_ID']}|{env['META_APP_SECRET']}"

    d = g("debug_token", input_token=court, access_token=app).get("data", {})
    print("jeton reçu : valide =", d.get("is_valid"), "| app", d.get("app_id"), d.get("application"),
          "| compte", d.get("user_id"), "| expire", d.get("expires_at"))
    print("  permissions :", ", ".join(d.get("scopes") or []))
    if not d.get("is_valid"):
        print("  ->", g("me", access_token=court))
        return 1
    if str(d.get("app_id")) != str(env["META_APP_ID"]):
        print("⚠ Le jeton ne vient pas de l'app Publisher 2 : l'échange longue durée est impossible avec ce secret.")
        long = court
    else:
        r = g("oauth/access_token", grant_type="fb_exchange_token", client_id=env["META_APP_ID"],
              client_secret=env["META_APP_SECRET"], fb_exchange_token=court)
        if "access_token" not in r:
            print("échange longue durée REFUSÉ :", r)
            long = court
        else:
            long = r["access_token"]
            (SECRETS / "fb_user_token.txt").write_text(long + "\n", encoding="utf-8")
            dl = g("debug_token", input_token=long, access_token=app).get("data", {})
            print("jeton longue durée : expire", dl.get("expires_at"), "| accès aux données jusqu'au", dl.get("data_access_expires_at"))

    moi = g("me", fields="id,name", access_token=long)
    print("compte :", moi)
    # /me/accounts pagine par 25 : on suit « next » jusqu'au bout
    pages, url = [], f"https://graph.facebook.com/{V}/me/accounts?" + urllib.parse.urlencode(
        {"fields": "id,name,access_token,tasks", "limit": 100, "access_token": long})
    while url:
        r = json.load(urllib.request.urlopen(url, timeout=40))
        pages += r.get("data", [])
        url = r.get("paging", {}).get("next")
    print(f"pages gérées : {len(pages)}")
    diako = next((p for p in pages if p["id"] == PAGE_DIAKO), None)
    if not diako:
        print("🔴 Di'ako (108742855158464) N'EST PAS dans les pages de ce jeton — elle n'a pas été cochée "
              "dans Graph Explorer. Pages présentes :", [p["name"] for p in pages][:30])
        return 1
    print("Di'ako trouvée : tâches =", diako.get("tasks"))
    (SECRETS / "fb_page_token_diako.txt").write_text(diako["access_token"] + "\n", encoding="utf-8")
    dp = g("debug_token", input_token=diako["access_token"], access_token=app).get("data", {})
    print("jeton de page Di'ako : valide =", dp.get("is_valid"), "| expire", dp.get("expires_at") or "jamais",
          "| type", dp.get("type"))
    lecture = g(PAGE_DIAKO, fields="name,username,followers_count", access_token=diako["access_token"])
    print("lecture de la page :", lecture)
    return 0


if __name__ == "__main__":
    sys.exit(main())
