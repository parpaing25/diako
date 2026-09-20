# -*- coding: utf-8 -*-
"""verifier_liens2.py — les 30 liens de la série 2 (serie2.json), ouverts dans un VRAI
navigateur sans tête : chaque page doit afficher le texte « attendu » de sa publication
(le lieu, le plat, la rubrique), et son h1 ne doit pas dire « introuvable ».

    python marketing/atelier/verifier_liens2.py

Même raison que verifier_liens.py : la SPA répond 200 et l'accueil à toute adresse, un code
HTTP ne prouve rien. Série 2 : une page d'agenda ou de rubrique n'a pas le sujet dans son h1,
d'où la recherche du texte attendu dans la page RENDUE (h1 + corps), après chargement.
"""
from __future__ import annotations

import json
import sys
import time
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
SITE = "https://diako.fonenako.mg"
UA = ("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Mobile Safari/537.36")


def norm(t: str) -> str:
    t = unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower()
    return " ".join(t.replace("’", "'").split())


def main() -> int:
    pubs = json.loads((ICI / "serie2.json").read_text(encoding="utf-8"))["publications"]
    from playwright.sync_api import sync_playwright
    mauvais, vus = 0, {}
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        page = nav.new_context(viewport={"width": 390, "height": 844}, user_agent=UA, is_mobile=True).new_page()
        for p in pubs:
            url, attendu = SITE + p["lien"], p["attendu"]
            if (p["lien"], attendu) in vus:
                ok, h1 = vus[(p["lien"], attendu)]
            else:
                page.goto(url, wait_until="domcontentloaded", timeout=90000)
                ok, h1 = False, ""
                for _ in range(25):                      # la SPA remplit la page après coup
                    page.wait_for_timeout(800)
                    h1 = " ".join(page.locator("h1").all_inner_texts()).strip()
                    corps = page.evaluate("document.body.innerText")
                    if norm(attendu) in norm(corps):
                        ok = True
                        break
                if any(x in norm(h1) for x in ("introuvable", "n'existe pas", "404")):
                    ok = False
                vus[(p["lien"], attendu)] = (ok, h1)
                time.sleep(1.5)
            mauvais += not ok
            print(f"{'OK ' if ok else '???'} {p['cle']:18} {p['lien']:46} attendu={attendu!r:28} h1={h1[:40]!r}")
        nav.close()
    print(f"\n{len(pubs) - mauvais}/{len(pubs)} liens affichent le sujet annoncé")
    return 1 if mauvais else 0


if __name__ == "__main__":
    sys.exit(main())
