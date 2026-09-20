# -*- coding: utf-8 -*-
"""etat_file.py — ce que Facebook a VRAIMENT en file sur la page Di'ako, jour par jour.

    python marketing/atelier/etat_file.py            # a l'ecran
    python marketing/atelier/etat_file.py --ecrire   # + ETAT-FILE.md dans le meme dossier

Lit /scheduled_posts (les publications ET les reels programmes y figurent) et range par
jour et par heure : 12 h = serie 2 « Decouvrir Diako », 18 h = serie 1 « Lieux emblematiques »,
20 h = reels. Aucune ecriture chez Facebook : lecture seule.
"""
from __future__ import annotations

import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
G = "https://graph.facebook.com/v21.0"
PAGE = "108742855158464"
TANA = timezone(timedelta(hours=3))


def quand(p: dict) -> datetime:
    t = p.get("scheduled_publish_time")
    if str(t).isdigit():
        return datetime.fromtimestamp(int(t), TANA)
    return datetime.fromisoformat(str(t).replace("+0000", "+00:00")).astimezone(TANA)


def main() -> int:
    tok = (Path.home() / ".diako-secrets" / "fb_page_token_diako.txt").read_text(encoding="utf-8").strip()
    url, params, out = f"{G}/{PAGE}/scheduled_posts", {
        "fields": "id,message,scheduled_publish_time,is_published", "limit": 100, "access_token": tok}, []
    while url:
        r = requests.get(url, params=params, timeout=90)
        if not r.ok:
            raise SystemExit("lecture de la file impossible : " + r.text[:200])
        d = r.json()
        out += d.get("data", [])
        url, params = d.get("paging", {}).get("next"), None

    jours: dict[str, dict[str, str]] = defaultdict(dict)
    for p in out:
        d = quand(p)
        titre = (p.get("message") or "(sans texte : reel)").splitlines()[0][:46]
        jours[d.strftime("%Y-%m-%d")][d.strftime("%H:%M")] = titre
    lignes = [f"# Page Di'ako — ce que Facebook a en file  ({datetime.now(TANA):%d/%m/%Y %H:%M} à Tana)", "",
              f"**{len(out)} éléments** relus dans /scheduled_posts. 12 h = série « Découvrir Diako », "
              "18 h = série « Lieux emblématiques », 20 h = reel. Tout a été programmé par l'API, "
              "rien par Business Suite.", "", "| Jour | 12 h | 18 h | 20 h (reel) |", "|---|---|---|---|"]
    for j in sorted(jours):
        c = jours[j]
        lignes.append(f"| {datetime.fromisoformat(j):%d/%m} | {c.get('12:00', '—')} | {c.get('18:00', '—')} "
                      f"| {c.get('20:00', '—')} |")
    par_heure = {h: sum(1 for c in jours.values() if h in c) for h in ("12:00", "18:00", "20:00")}
    lignes += ["", f"Compte par heure : {par_heure}", "",
               "Relire à tout moment : `python marketing\\atelier\\etat_file.py`"]
    texte = "\n".join(lignes)
    print(texte)
    if "--ecrire" in sys.argv:
        (ICI / "ETAT-FILE.md").write_text(texte + "\n", encoding="utf-8")
        print("\n-> ETAT-FILE.md écrit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
