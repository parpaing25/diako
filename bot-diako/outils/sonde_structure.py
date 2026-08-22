#!/usr/bin/env python
"""Cherche quel conteneur DOM correspond à UNE publication du fil.

Facebook renomme ses attributs sans prévenir. Ce script compare plusieurs
stratégies de sélection sur la page réelle et dit laquelle isole les posts.

    python outils/sonde_structure.py [id_source]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright  # noqa: E402

from bot import base  # noqa: E402
from bot.collecteur import _url_fil_de_page  # noqa: E402
from bot.config import PROFIL_NAVIGATEUR  # noqa: E402

JS_SONDE = """
() => {
  const infos = (el) => {
    const txt = (el.innerText || '').trim();
    const imgs = [...el.querySelectorAll('img')].filter(i => {
      const u = i.currentSrc || i.src || '';
      return u.includes('scontent') && Math.max(i.naturalWidth || 0, i.width || 0) >= 400;
    });
    const lien = [...el.querySelectorAll('a[href]')]
      .map(a => a.href)
      .find(h => /\\/posts\\/|\\/permalink\\/|story_fbid=|multi_permalinks=/.test(h)) || '';
    return { longueur: txt.length, images: imgs.length, permalien: lien,
             extrait: txt.slice(0, 90) };
  };

  const resultats = {};

  // Stratégie A — enfants directs du conteneur de fil
  const feed = document.querySelector('div[role="feed"]');
  resultats.A_feed_enfants = feed
    ? [...feed.children].map(infos)
    : 'pas de div[role=feed]';

  // Stratégie B — remonter depuis chaque grande photo jusqu'à un bloc qui a
  // un permalien : le post est le plus petit ancêtre qui contient les deux.
  const grandes = [...document.querySelectorAll('img')].filter(i => {
    const u = i.currentSrc || i.src || '';
    return u.includes('scontent') && Math.max(i.naturalWidth || 0, i.width || 0) >= 400;
  });
  const vus = new Set();
  const parPhoto = [];
  for (const img of grandes) {
    let el = img;
    for (let n = 0; n < 14 && el.parentElement; n++) {
      el = el.parentElement;
      const txt = (el.innerText || '').trim();
      const aLien = [...el.querySelectorAll('a[href]')]
        .some(a => /\\/posts\\/|\\/permalink\\/|story_fbid=/.test(a.href));
      if (aLien && txt.length > 60) break;
    }
    if (!vus.has(el)) { vus.add(el); parPhoto.push(infos(el)); }
  }
  resultats.B_remontee_photo = parPhoto;

  // Stratégie C — attributs que Facebook utilise encore
  for (const sel of ['div[data-pagelet]', '[data-ad-preview]', '[data-ad-comet-preview]',
                     'div[aria-posinset]', 'div[data-virtualized]']) {
    resultats['C_' + sel] = document.querySelectorAll(sel).length;
  }

  // Structure du premier enfant du fil, pour lecture humaine
  resultats.exemple_attributs = feed && feed.children[0]
    ? [...feed.children[0].attributes].map(a => a.name + '=' + a.value.slice(0, 40))
    : [];
  return resultats;
}
"""


def main() -> None:
    base.initialiser()
    sources = base.sources(actives_seulement=True)
    choix = int(sys.argv[1]) if len(sys.argv) > 1 else None
    source = next((s for s in sources if s["id"] == choix), sources[0])

    url = source["url"].rstrip("/")
    url += "?sorting_setting=CHRONOLOGICAL" if (source.get("genre") or "groupe") == "groupe" \
        else ""
    if (source.get("genre") or "groupe") == "page":
        url = _url_fil_de_page(source["url"])

    print(f"Source : {source['nom']}\n{url}\n")

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFIL_NAVIGATEUR), headless=False,
            viewport={"width": 1280, "height": 900}, locale="fr-FR",
            timezone_id="Indian/Antananarivo",
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(6000)
        for _ in range(3):
            page.mouse.wheel(0, 1300)
            page.wait_for_timeout(2500)

        r = page.evaluate(JS_SONDE)

        print("--- A : enfants directs de div[role=feed] ---")
        blocs = r["A_feed_enfants"]
        if isinstance(blocs, str):
            print("   ", blocs)
        else:
            print(f"    {len(blocs)} enfants")
            for b in blocs[:8]:
                print(f"     texte={b['longueur']:5}  images={b['images']:2}  "
                      f"permalien={'oui' if b['permalien'] else 'non '}  "
                      f"{b['extrait']!r}")

        print("\n--- B : remontée depuis les grandes photos ---")
        for b in r["B_remontee_photo"][:8]:
            print(f"     texte={b['longueur']:5}  images={b['images']:2}  "
                  f"permalien={'oui' if b['permalien'] else 'non '}  "
                  f"{b['extrait']!r}")

        print("\n--- C : autres attributs ---")
        for cle, valeur in r.items():
            if cle.startswith("C_"):
                print(f"     {cle[2:]:34} {valeur}")
        print(f"\n     attributs du 1er bloc : {r['exemple_attributs']}")

        sortie = Path(__file__).resolve().parent.parent / "data" / "diagnostic"
        sortie.mkdir(parents=True, exist_ok=True)
        (sortie / "sonde.json").write_text(
            json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nDétail : {sortie / 'sonde.json'}")
        ctx.close()


if __name__ == "__main__":
    main()
