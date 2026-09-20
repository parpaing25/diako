# -*- coding: utf-8 -*-
"""verifier_liens.py — ouvre les 30 liens de la série dans un VRAI navigateur et
vérifie que chaque page affiche bien le lieu annoncé.

    python marketing/atelier/verifier_liens.py [--cdp http://127.0.0.1:9223]

⚠ POURQUOI UN VRAI NAVIGATEUR. Le site est une SPA servie par o2switch : toute
  adresse répond 200 et index.html, même un slug qui n'existe pas. Un code HTTP ne
  prouve donc rien ; seul le contenu RENDU le prouve. Et un client sans navigateur
  reçoit le défi Tiger Protect (307 puis 406) au lieu de la page.
"""
from __future__ import annotations

import sys
import unicodedata

from fabriquer import SITE, charger

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def norm(t: str) -> str:
    t = unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower()
    return " ".join(t.replace("’", "'").replace("-", " ").split())


def main() -> int:
    cdp = sys.argv[sys.argv.index("--cdp") + 1] if "--cdp" in sys.argv else "http://127.0.0.1:9223"
    _, candidats, pubs = charger()
    from playwright.sync_api import sync_playwright
    mauvais = 0
    with sync_playwright() as pw:
        ctx = pw.chromium.connect_over_cdp(cdp).contexts[0]
        page = ctx.new_page()
        for p in pubs:
            url = SITE + p["lien"]
            page.goto(url, wait_until="domcontentloaded", timeout=90000)
            h1 = ""
            for _ in range(20):                       # la SPA charge la fiche après coup
                page.wait_for_timeout(700)
                h1 = " ".join(page.locator("h1").all_inner_texts()).strip()
                if h1 and "introuvable" not in h1.lower():
                    break
            # le titre affiché (h1) doit contenir un mot fort du titre de la publication.
            # ⚠ Découpé AUSSI sur l'apostrophe (« d'Ilafy » → « ilafy »), et si le titre
            #   n'a aucun mot long (« Nosy Ve »), on compare le titre entier : la première
            #   version déclarait faux trois liens justes.
            mots = [m for m in norm(p["titre"]).replace("'", " ").split()
                    if len(m) > 3 and m not in ("palais", "nosy", "pays")] or [norm(p["titre"])]
            ok = bool(h1) and any(m in norm(h1) for m in mots)
            # ⚠ « 404 » ou « n'existe pas » se cherchent dans le TITRE, jamais dans le corps :
            #   un état vide (« aucun établissement n'existe encore ici ») n'est pas une erreur.
            introuvable = any(x in norm(h1) for x in ("introuvable", "n'existe pas", "404"))
            etat = "OK " if ok and not introuvable else "???"
            mauvais += etat != "OK "
            print(f"{etat} {p['cle']:18} {p['lien']:42} h1 = {h1[:60]!r}")
        page.close()
    print(f"\n{len(pubs) - mauvais}/{len(pubs)} liens affichent le bon lieu")
    return 1 if mauvais else 0


if __name__ == "__main__":
    sys.exit(main())
