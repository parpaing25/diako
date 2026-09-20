# -*- coding: utf-8 -*-
"""collecter_lieux.py — rassemble, pour chaque lieu candidat de la série, les faits
VÉRIFIABLES de la base Diako et sa photo, dans candidats.json + photos/.

    python marketing/atelier/collecter_lieux.py

Lecture seule : REST public (clé anon, déjà dans le bundle du site) pour les faits ;
le navigateur de publication (CDP 9223) pour les photos, parce qu'elles sont servies
par o2switch derrière Tiger Protect : un client HTTP nu y reçoit 307 puis 406.

⚠ UNE PHOTO N'ENTRE QUE SI SA LICENCE EST LIBRE (CC, CC0, domaine public). Les
  crédits « Publication Facebook — reprise avec attribution » et ceux au nom d'un
  hôtel ou d'une agence sont des photos d'AUTRES pages : les republier sur la page
  Di'ako, c'est reprendre le travail d'un voisin — parfois d'un concurrent.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
DEPOT = ICI.parent.parent
PHOTOS = ICI / "photos"
SORTIE = ICI / "candidats.json"

URL = "https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1"


def cle_anon() -> str:
    """La clé anon est publique par nature (elle est dans le bundle) : on la relit
    dans le client du site plutôt que de la recopier ici."""
    src = (DEPOT / "src" / "integrations" / "supabase" / "client.ts").read_text(encoding="utf-8")
    m = re.search(r'"(eyJ[A-Za-z0-9._-]+)"', src)
    if not m:
        raise SystemExit("clé anon introuvable dans src/integrations/supabase/client.ts")
    return m.group(1)


CLE = cle_anon()


def rest(table: str, params: dict) -> list[dict]:
    q = urllib.parse.urlencode(params, safe="(),.*:")
    req = urllib.request.Request(f"{URL}/{table}?{q}", headers={"apikey": CLE, "Authorization": f"Bearer {CLE}"})
    return json.load(urllib.request.urlopen(req, timeout=30))


# (clé de la série, slug du SITE qui porte la photo libre, slug du LIEU vers lequel on
#  renvoie s'il existe — la fiche de destination est plus riche que celle du site)
CANDIDATS = [
    ("rova-antananarivo", "rova-d-antananarivo", None),
    ("andasibe", "parc-national-d-andasibe-mantadia", "andasibe"),
    ("mer-emeraude", "mer-d-emeraude", "mer-d-emeraude"),
    ("tritriva", "lac-tritriva", None),
    ("berenty", "reserve-de-berenty", None),
    ("ambohimanga", "ambohimanga-rova", "ambohimanga-2"),
    ("tsingy-rouges", "tsingy-rouge", None),
    ("pangalanes", "canal-des-pangalanes", "canal-des-pangalanes"),
    ("andringitra", "parc-national-d-andringitra", "andringitra"),
    ("tanikely", "parc-national-nosy-tanikely", "nosy-tanikely"),
    ("ankarafantsika", "lac-ravelobe", "ankarafantsika"),
    ("ilafy", "palais-royal-ilafy", None),
    ("kirindy", "kirindy-forest", "kirindy"),
    ("cap-sainte-marie", "reserve-speciale-du-cap-sainte-marie", "cap-sainte-marie"),
    ("marojejy", "parc-national-de-marojejy", "marojejy"),
    ("katsepy", "phare-katsepy", None),
    ("anja", "anja-community-reserve", "anja"),
    ("andraikiba", "lake-andraikiba", None),
    ("ankarana", "reserve-speciale-d-ankarana", "ankarana"),
    ("masoala", "parc-national-de-masoala", "masoala"),
    ("nosy-ve", "nosy-ve", "nosy-ve"),
    ("namoroka", "parc-national-du-tsingy-de-namoroka", "namoroka"),
    ("montagne-des-francais", "montagne-des-francais", None),
    ("lac-anosy", "lac-anosy", None),
    ("lokobe", "reserve-naturelle-integrale-de-lokobe", None),
    ("andafiavaratra", "palais-d-andafiavaratra", None),
    # remplaçants, si une photo ne tient pas à l'œil
    ("sakalava", "baie-de-sakalava", "baie-de-sakalava"),
    ("ramena", "ramena-beach", "ramena"),
    ("nosy-hara", "parc-national-marin-de-nosy-hara", "nosy-hara"),
    ("sainte-luce", "sainte-luce-reserve", None),
    ("anjajavy", "anjajavy-forest", "anjajavy"),
    ("tsimbazaza", "parc-botanique-et-zoologique-de-tsimbazaza", None),
    ("ambohidratrimo", "rovan-ambohidratrimo", None),
    ("kinkony", "complexe-mahavavy-kinkony", None),
    ("belo-sur-mer", None, "belo-sur-mer"),
]

LIBRE = re.compile(r"(?i)\b(cc[ -]?by|cc0|cc-by|public domain|domaine public)\b")

COLS_SITE = ("id,slug,name,kind,summary,description,cover_url,cover_credit,cover_licence,cover_source,"
             "best_months,fee_resident_ar,fee_nonresident_ar,rates_checked_at,guide_required,fady,place_id,is_published")
COLS_LIEU = "id,slug,name_fr,name_mg,kind,region,summary,why_go,cover_url,cover_credit,is_touristique,merged_into,lat,lng"


def main() -> int:
    sites = {r["slug"]: r for r in rest("attractions", {
        "select": COLS_SITE, "slug": "in.(" + ",".join(s for _, s, _ in CANDIDATS if s) + ")"})}
    lieux = {r["slug"]: r for r in rest("places", {
        "select": COLS_LIEU, "slug": "in.(" + ",".join(l for _, _, l in CANDIDATS if l) + ")"})}
    # la région du site vient de son lieu de rattachement
    ids_rattach = {s["place_id"] for s in sites.values() if s.get("place_id")}
    rattach = {r["id"]: r for r in rest("places", {
        "select": "id,slug,name_fr,region", "id": "in.(" + ",".join(ids_rattach) + ")"})} if ids_rattach else {}

    ids_lieux = [l["id"] for l in lieux.values()]
    saisons, acces = {}, {}
    if ids_lieux:
        for r in rest("place_seasons", {"select": "place_id,month,rating,reason",
                                        "place_id": "in.(" + ",".join(ids_lieux) + ")"}):
            saisons.setdefault(r["place_id"], []).append(r)
        acc = rest("place_access", {"select": "place_id,from_place_id,mode,duration_h,distance_km,road_state,all_year,departure_point",
                                    "place_id": "in.(" + ",".join(ids_lieux) + ")"})
        dep = {r["id"]: r["name_fr"] for r in rest("places", {
            "select": "id,name_fr", "id": "in.(" + ",".join({a["from_place_id"] for a in acc} or {"00000000-0000-0000-0000-000000000000"}) + ")"})} if acc else {}
        for a in acc:
            a["depuis"] = dep.get(a["from_place_id"])
            acces.setdefault(a["place_id"], []).append(a)

    PHOTOS.mkdir(exist_ok=True)
    out = []
    for cle, s_slug, l_slug in CANDIDATS:
        s = sites.get(s_slug) if s_slug else None
        l = lieux.get(l_slug) if l_slug else None
        if l and l.get("merged_into"):
            l = None                                   # fiche fusionnée : lien mort
        photo = None
        if s and s.get("cover_url") and LIBRE.search(s.get("cover_licence") or ""):
            photo = {"url": s["cover_url"], "credit": s["cover_credit"], "licence": s["cover_licence"],
                     "source": s["cover_source"]}
        region = (l or {}).get("region") or (rattach.get((s or {}).get("place_id")) or {}).get("region")
        lien = f"/lieu/{l['slug']}" if l else (f"/site/{s['slug']}" if s and s.get("is_published") else None)
        out.append({
            "cle": cle, "nom_site": (s or {}).get("name"), "nom_lieu": (l or {}).get("name_fr"),
            "region": region, "genre": (s or {}).get("kind") or (l or {}).get("kind"),
            "lien": lien, "photo": photo,
            "resume_lieu": (l or {}).get("summary"), "pourquoi": (l or {}).get("why_go"),
            "resume_site": (s or {}).get("summary"), "description_site": ((s or {}).get("description") or "")[:600],
            "mois_site": (s or {}).get("best_months"), "fady": (s or {}).get("fady"),
            "guide_obligatoire": (s or {}).get("guide_required"),
            "saisons": sorted(saisons.get((l or {}).get("id"), []), key=lambda x: x["month"]),
            "acces": acces.get((l or {}).get("id"), []),
        })
        etat = "photo libre" if photo else ("PAS de photo libre" if s else "pas de site")
        print(f"{cle:24} {etat:18} lien={lien}  région={region}")
    SORTIE.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(out)} candidats -> {SORTIE}")

    # ── les photos, par le navigateur (Tiger Protect) ──────────────────────
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = p.chromium.connect_over_cdp("http://127.0.0.1:9223").contexts[0]
        pg = ctx.pages[0]
        pg.goto("https://diako.fonenako.mg/", wait_until="domcontentloaded")   # prend le cookie du défi
        pg.wait_for_timeout(4000)
        for c in out:
            if not c["photo"]:
                continue
            dest = PHOTOS / f"{c['cle']}.jpg"
            if dest.exists() and dest.stat().st_size > 20_000:
                continue
            r = ctx.request.get(c["photo"]["url"], timeout=150000)
            ok = r.ok and r.headers.get("content-type", "").startswith("image/")
            if ok:
                dest.write_bytes(r.body())
            print(f"  photo {c['cle']:22} {r.status} {r.headers.get('content-type','?')[:12]} {len(r.body()) if ok else 0:>8} o")
    return 0


if __name__ == "__main__":
    sys.exit(main())
