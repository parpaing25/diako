# -*- coding: utf-8 -*-
"""sources_wiki.py — relève le texte brut d'articles Wikipédia (fr puis en) pour sourcer
les publications de la série 2 : légendes, culture, parcs, saisons.

    python marketing/atelier/sources_wiki.py "fr:Ibonia" "fr:Rapeto" "en:Darafify" ...

Écrit sources/<langue>-<titre>.txt (texte intégral + URL + date de relevé). Un fait publié
doit pouvoir se retrouver mot pour mot dans l'un de ces fichiers.
"""
from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
SOURCES = ICI / "sources"
UA = {"User-Agent": "DiakoAtelier/1.0 (contact.fonenako@gmail.com)"}


def relever(spec: str) -> None:
    langue, titre = spec.split(":", 1)
    r = requests.get(f"https://{langue}.wikipedia.org/w/api.php", headers=UA, timeout=60, params={
        "action": "query", "prop": "extracts|info", "explaintext": 1, "redirects": 1, "inprop": "url",
        "titles": titre, "format": "json"})
    pages = r.json().get("query", {}).get("pages", {})
    for p in pages.values():
        if "missing" in p:
            print(f"ABSENT  {spec}")
            return
        txt = p.get("extract", "")
        nom = re.sub(r"[^\w-]+", "_", f"{langue}-{p['title']}")[:80]
        SOURCES.mkdir(exist_ok=True)
        (SOURCES / f"{nom}.txt").write_text(
            f"SOURCE : {p.get('fullurl')}\nRELEVÉ : {date.today().isoformat()}\n\n{txt}", encoding="utf-8")
        print(f"ok      {spec:40} -> {nom}.txt  {len(txt)} car.")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        relever(s)
