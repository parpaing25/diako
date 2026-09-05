#!/usr/bin/env python
"""Regarde ce que le fil Facebook contient VRAIMENT, sans rien filtrer.

À lancer quand la collecte revient à « 0 candidat » alors que le groupe est
plein de publications : ça dit lequel des maillons casse (sélecteur d'article,
images en chargement différé, filtre mots-clés).

    python outils/diagnostic_fb.py                # première source active
    python outils/diagnostic_fb.py 3              # source n° 3
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright  # noqa: E402

from bot import base  # noqa: E402
from bot.collecteur import JS_EXTRAIRE_FIL, _url_fil_de_page  # noqa: E402
from bot.extraction import parle_de_tourisme  # noqa: E402
from bot.config import PROFIL_NAVIGATEUR, charger  # noqa: E402

JS_ETAT_BRUT = """
() => {
  const compte = (s) => document.querySelectorAll(s).length;
  const articles = [...document.querySelectorAll('div[role="article"]')];
  const racines = articles.filter(
    el => !el.parentElement?.closest('div[role="article"]'));
  const toutesImages = [...document.querySelectorAll('img')];
  const scontent = toutesImages.filter(i => (i.currentSrc || i.src || '').includes('scontent'));
  const tailles = scontent.map(i => ({
    nw: i.naturalWidth || 0, w: i.width || 0,
    loading: i.getAttribute('loading') || '',
  }));
  return {
    url: location.href,
    titre: document.title,
    articles: articles.length,
    articles_racines: racines.length,
    role_feed: compte('div[role="feed"]'),
    data_pagelet: compte('[data-pagelet]'),
    images_total: toutesImages.length,
    images_scontent: scontent.length,
    images_scontent_chargees: tailles.filter(t => t.nw > 0).length,
    images_scontent_400plus: tailles.filter(t => Math.max(t.nw, t.w) >= 400).length,
    echantillon_tailles: tailles.slice(0, 12),
    connecte: !document.querySelector('input[name="pass"]'),
    bloque: /connexion|log in|se connecter/i.test(document.title),
    premier_article_texte: racines[0] ? (racines[0].innerText || '').slice(0, 300) : '',
    premier_article_html: racines[0] ? racines[0].outerHTML.slice(0, 1200) : '',
  };
}
"""


def main() -> None:
    base.initialiser()
    sources = base.sources(actives_seulement=True)
    if not sources:
        print("Aucune source active.")
        return
    choix = int(sys.argv[1]) if len(sys.argv) > 1 else None
    source = next((s for s in sources if s["id"] == choix), sources[0])

    cfg = charger()
    url = source["url"].rstrip("/")
    if (source.get("genre") or "groupe") == "groupe":
        url += "?sorting_setting=CHRONOLOGICAL"
    else:
        url = _url_fil_de_page(url)

    print(f"Source  : {source['nom']}  ({source.get('genre')})")
    print(f"Adresse : {url}\n")

    sortie = Path(__file__).resolve().parent.parent / "data" / "diagnostic"
    sortie.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFIL_NAVIGATEUR),
            headless=False,
            viewport={"width": 1280, "height": 900},
            locale="fr-FR",
            timezone_id="Indian/Antananarivo",
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(6000)

        etapes = []
        for tour in range(4):
            brut = page.evaluate(JS_ETAT_BRUT)
            lot = page.evaluate(JS_EXTRAIRE_FIL, int(cfg["largeur_photo_min"]))
            avec_images = [p for p in lot if p["nb_images"] >= 1]
            tourisme = [p for p in lot if parle_de_tourisme(p["texte"], p["nb_images"])]
            retenus = [p for p in lot if p["nb_images"] >= 1 and parle_de_tourisme(p["texte"], p["nb_images"])]
            etapes.append({
                "tour": tour,
                "articles_racines": brut["articles_racines"],
                "extraits": len(lot),
                "avec_photo": len(avec_images),
                "mots_tourisme_ok": len(tourisme),
                "retenus": len(retenus),
                "images_scontent": brut["images_scontent"],
                "images_chargees": brut["images_scontent_chargees"],
                "images_400plus": brut["images_scontent_400plus"],
            })
            print(f"tour {tour} : articles={brut['articles_racines']:3}  "
                  f"extraits={len(lot):3}  avec_photo={len(avec_images):3}  "
                  f"mots_tourisme={len(tourisme):3}  RETENUS={len(retenus):3}  "
                  f"(images scontent {brut['images_scontent']}, "
                  f"chargées {brut['images_scontent_chargees']}, "
                  f"≥400px {brut['images_scontent_400plus']})")
            page.mouse.wheel(0, 1200)
            page.wait_for_timeout(3000)

        final = page.evaluate(JS_ETAT_BRUT)
        lot = page.evaluate(JS_EXTRAIRE_FIL, int(cfg["largeur_photo_min"]))

        page.screenshot(path=str(sortie / "page.png"), full_page=False)
        (sortie / "etat.json").write_text(
            json.dumps({"brut": final, "etapes": etapes, "extraits": lot[:6]},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print("\n--- ÉTAT DE LA PAGE ---")
        for cle in ("titre", "connecte", "bloque", "articles", "articles_racines",
                    "role_feed", "images_total", "images_scontent",
                    "images_scontent_chargees", "images_scontent_400plus"):
            print(f"  {cle:28} {final[cle]}")
        print("\n--- PREMIER ARTICLE (texte) ---")
        print(final["premier_article_texte"][:280] or "(vide)")
        print("\n--- 3 PREMIERS EXTRAITS ---")
        for p in lot[:3]:
            print(f"  images={p['nb_images']:2}  tourisme={parle_de_tourisme(p['texte'])}  "
                  f"heure={p['heure']!r}  auteur={p['auteur']!r}")
            print(f"    texte: {p['texte'][:150]!r}")
        print(f"\nDétail complet : {sortie / 'etat.json'}")
        print(f"Capture        : {sortie / 'page.png'}")
        ctx.close()


if __name__ == "__main__":
    main()
