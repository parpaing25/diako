# -*- coding: utf-8 -*-
"""captures_plan.py — les écrans du site pour les publications « Découvrir Diako » (série 2).

    python marketing/atelier/captures_plan.py            # toutes
    python marketing/atelier/captures_plan.py fil-hotels  # une seule

Chaque capture = une adresse + des gestes (cliquer un bouton, choisir dans une liste,
défiler), puis une photo 390×844 (×2). Ce sont de vrais écrans du site EN LIGNE : si un
geste échoue, la capture est refusée plutôt que publiée à moitié.

⚠ Le fil ne garde pas son thème dans l'adresse : on clique la puce, comme un visiteur.
⚠ « Près de moi » demande la position : on la donne (Antananarivo, place de l'Indépendance).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
CAPTURES = ICI / "captures"
SITE = "https://diako.fonenako.mg"
UA = ("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Mobile Safari/537.36")

# nom : (chemin, [gestes])   geste = ("clic", nom) | ("choix", n° de liste, libellé) | ("defiler", px) | ("attendre", ms)
PLAN: dict[str, tuple[str, list]] = {
    "fil-hotels":      ("/", [("clic", "Hôtels"), ("attendre", 5000)]),
    "fil-restaurants": ("/", [("clic", "Restaurants"), ("attendre", 5000)]),
    "fil-voyages":     ("/", [("clic", "Voyages organisés"), ("attendre", 5000)]),
    "fil-pres":        ("/", [("clic", "Près de moi"), ("attendre", 6000)]),
    "yaller-haut":     ("/y-aller", []),
    "yaller-trajet":   ("/y-aller", [("choix", 0, "Antananarivo — Analamanga"), ("choix", 1, "Isalo — Ihorombe"),
                                     ("attendre", 2500), ("defiler", 620)]),
    "carte":           ("/carte", [("attendre", 4000)]),
    "evenements-haut": ("/evenements", []),
    "evenements-bas":  ("/evenements", [("defiler", 1500)]),
    "evenements-jaca": ("/evenements", [("voir", "Floraison des jacarandas", -470)]),
    "evenements-requins": ("/evenements", [("voir", "Agrégation de requins-baleines", -470)]),
    "evenements-baleines": ("/evenements", [("voir", "Saison des baleines à bosse", 0)]),
    "plats":           ("/plats", []),
    "plats-familles":  ("/plats", [("defiler", 900)]),
    "gouts":           ("/gouts", []),
    "quand-partir":    ("/quand-partir", []),
    "quand-partir-2":  ("/quand-partir", [("defiler", 1100)]),
    "sites":           ("/sites", []),
    "sites-bas":       ("/sites", [("defiler", 700)]),
    "lieu-nosy-be":    ("/lieu/nosy-be", [("attendre", 3000)]),
    "lieu-nosy-be-2":  ("/lieu/nosy-be", [("attendre", 3000), ("defiler", 700)]),
    "villes":          ("/villes", []),
    "explorer":        ("/explorer", [("attendre", 3000)]),
    "explorer-2":      ("/explorer", [("attendre", 3000), ("defiler", 800)]),
    "pro":             ("/pro", []),
    "publier":         ("/publier", []),
    "site-zombitse":   ("/site/parc-national-de-zombitse-vohibasia", [("attendre", 3000)]),
}


def charger_images(page) -> None:
    """Attend que les images VISIBLES soient décodées : sans cela les cartes sortent en
    cadres vides (chargement différé + décodage progressif du site)."""
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass
    for _ in range(20):
        manque = page.evaluate("""() => [...document.images].filter(i => {
            const r = i.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.width > 40 && !(i.complete && i.naturalWidth > 0);
        }).length""")
        if not manque:
            break
        page.wait_for_timeout(700)
    page.wait_for_timeout(1500)


def capturer(noms: list[str]) -> int:
    from playwright.sync_api import sync_playwright
    CAPTURES.mkdir(exist_ok=True)
    refus = 0
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, user_agent=UA,
                              locale="fr-FR", is_mobile=True, has_touch=True,
                              geolocation={"latitude": -18.9105, "longitude": 47.5255}, permissions=["geolocation"])
        page = ctx.new_page()
        for nom in noms:
            chemin, gestes = PLAN[nom]
            try:
                page.goto(SITE + chemin, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(8000)
                for g in gestes:
                    if g[0] == "clic":
                        page.get_by_role("button", name=g[1], exact=True).first.click(timeout=8000)
                    elif g[0] == "choix":
                        page.locator("select").nth(g[1]).select_option(label=g[2], timeout=8000)
                    elif g[0] == "defiler":
                        page.evaluate(f"window.scrollTo(0,{g[1]})")
                        page.wait_for_timeout(2500)
                    elif g[0] == "voir":          # amener en haut de l'écran l'élément qui porte ce texte
                        el = page.get_by_text(g[1], exact=False).first
                        el.scroll_into_view_if_needed(timeout=8000)
                        # le haut de la CARTE qui contient ce texte (photo comprise) juste sous l'en-tête
                        el.evaluate("""e => { const c = e.closest('article, li, [class*="rounded"]') || e;
                            window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 72); }""")
                        page.wait_for_timeout(6000)
                    elif g[0] == "attendre":
                        page.wait_for_timeout(g[1])
                charger_images(page)
                if "tiger" in page.content().lower():
                    raise RuntimeError("page de blocage o2switch")
                page.screenshot(path=str(CAPTURES / f"{nom}.png"))
                print(f"ok     {nom:18} {chemin}")
            except Exception as e:
                refus += 1
                print(f"REFUS  {nom:18} {chemin} : {str(e).splitlines()[0][:140]}")
            time.sleep(2)
        nav.close()
    return 1 if refus else 0


if __name__ == "__main__":
    noms = sys.argv[1:] or list(PLAN)
    sys.exit(capturer(noms))
