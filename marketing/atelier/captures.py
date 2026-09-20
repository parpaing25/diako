# -*- coding: utf-8 -*-
"""captures.py — photographie les pages du site Diako en format téléphone, pour les
publications « Découvrir Diako » (série 2). Une capture = un écran réel du site en ligne.

    python marketing/atelier/captures.py /quand-partir /location ...      # écran du haut
    python marketing/atelier/captures.py --defiler 1400 /plats             # après défilement
    python marketing/atelier/captures.py --planche                          # planche de relecture

Sortie : captures/<chemin>[@<défilement>].png en 390×844 (×2 = 780×1688).

⚠ Le site est une SPA : une adresse fausse rend 200 et l'accueil. La capture est donc
  REFUSÉE si l'écran n'a pas de <h1> ou si le h1 dit « introuvable » — on ne publie pas
  la photo d'une page d'erreur.
⚠ Agent utilisateur réaliste : o2switch sert une page de blocage aux navigateurs sans tête nus.
⚠ Une page à la fois, avec une pause : le limiteur de débit du mutualisé rend 429 en rafale.
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
CAPTURES = ICI / "captures"
SITE = "https://diako.fonenako.mg"
UA = ("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Mobile Safari/537.36")


def nom_fichier(chemin: str, defil: int) -> str:
    n = re.sub(r"[^a-z0-9]+", "-", chemin.lower()).strip("-") or "accueil"
    return f"{n}@{defil}.png" if defil else f"{n}.png"


def capturer(chemins: list[str], defil: int = 0, attente_ms: int = 9000) -> int:
    from playwright.sync_api import sync_playwright
    CAPTURES.mkdir(exist_ok=True)
    refus = 0
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              user_agent=UA, locale="fr-FR", is_mobile=True, has_touch=True)
        page = ctx.new_page()
        codes: list[int] = []
        page.on("response", lambda r: codes.append(r.status) if r.status == 429 else None)
        for ch in chemins:
            codes.clear()
            page.goto(SITE + ch, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(attente_ms)
            # bandeau de consentement / invitation à installer : on les ferme s'ils existent
            for libelle in ("Plus tard", "Fermer", "J'ai compris", "Accepter"):
                b = page.get_by_role("button", name=libelle)
                if b.count() and b.first.is_visible():
                    try:
                        b.first.click(timeout=1500)
                    except Exception:
                        pass
            if defil:
                page.evaluate(f"window.scrollTo(0,{defil})")
                page.wait_for_timeout(1800)
            h1 = page.locator("h1").first.inner_text(timeout=3000) if page.locator("h1").count() else ""
            titre = page.title()
            if "tiger" in page.content().lower() or codes:
                print(f"REFUS  {ch} : page de blocage o2switch ou 429 ({len(codes)})")
                refus += 1
            elif re.search(r"introuvable|404|n'existe pas", h1 + " " + titre, re.I):
                print(f"REFUS  {ch} : page d'erreur ({h1!r} / {titre!r})")
                refus += 1
            else:
                dest = CAPTURES / nom_fichier(ch, defil)
                page.screenshot(path=str(dest))
                print(f"ok     {ch:28} h1={h1[:60]!r}  titre={titre[:50]!r} -> {dest.name}")
            time.sleep(2)
        nav.close()
    return 1 if refus else 0


def planche() -> None:
    from PIL import Image, ImageDraw
    ims = sorted(CAPTURES.glob("*.png"))
    w, h, col = 260, 563, 6
    lignes = (len(ims) + col - 1) // col
    P = Image.new("RGB", (col * w, lignes * (h + 22)), "white")
    d = ImageDraw.Draw(P)
    for i, f in enumerate(ims):
        im = Image.open(f).convert("RGB")
        im.thumbnail((w, h))
        x, y = (i % col) * w, (i // col) * (h + 22)
        P.paste(im, (x, y + 22))
        d.text((x + 4, y + 4), f.stem[:40], fill="black")
    P.save(ICI / "planche-captures.jpg", quality=80)
    print("planche-captures.jpg", P.size, len(ims), "captures")


if __name__ == "__main__":
    a = sys.argv[1:]
    if "--planche" in a:
        planche()
        sys.exit(0)
    d = 0
    if "--defiler" in a:
        i = a.index("--defiler")
        d = int(a[i + 1])
        del a[i:i + 2]
    sys.exit(capturer(a, d))
