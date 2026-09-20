# -*- coding: utf-8 -*-
"""commons.py — cherche sur Wikimedia Commons des photos LIBRES d'un lieu, avec leur
auteur et leur licence lus dans les métadonnées du fichier, et fabrique une planche
contact pour choisir à l'œil.

    python marketing/atelier/commons.py andasibe "Indri Andasibe" "Analamazaotra"
    python marketing/atelier/commons.py --prendre andasibe "File:Indri indri 0003.jpg" [--rang 2]
    python marketing/atelier/commons.py --retenues andasibe

⚠ L'AUTEUR ET LA LICENCE SE LISENT DANS extmetadata, jamais dans le nom du fichier
  ni dans la page de recherche. Une photo sans licence libre lisible est refusée,
  même si elle est belle : elle part sur la page Di'ako avec son crédit, et un crédit
  deviné est un crédit faux.
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
PHOTOS = ICI / "photos"
CHOIX = ICI / "choix"          # un fichier par lieu : plusieurs agents écrivent en même temps
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "DiakoAtelier/1.0 (https://diako.fonenako.mg; contact.diako@gmail.com)"}
LIBRE = re.compile(r"(?i)^(cc[ -]?by(-sa)?([ -]\d(\.\d)?)?|cc0|public domain|pd.*)$")


def api(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=40))


def texte(v: str | None) -> str:
    """Les champs Artist/Credit sont en HTML : on garde le texte."""
    return html.unescape(re.sub(r"<[^>]+>", "", v or "")).strip()


def infos(titres: list[str]) -> list[dict]:
    r = api({"action": "query", "titles": "|".join(titres), "prop": "imageinfo",
             "iiprop": "url|size|extmetadata|mime", "iiurlwidth": 400})
    out = []
    for p in r["query"]["pages"]:
        ii = (p.get("imageinfo") or [{}])[0]
        m = ii.get("extmetadata", {})
        lic = texte((m.get("LicenseShortName") or {}).get("value"))
        out.append({
            "titre": p["title"], "largeur": ii.get("width"), "hauteur": ii.get("height"),
            "mime": ii.get("mime"), "url": ii.get("url"), "vignette": ii.get("thumburl"),
            "auteur": texte((m.get("Artist") or {}).get("value"))[:120],
            "licence": lic, "libre": bool(LIBRE.match(lic)),
            "source": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(p["title"].replace(" ", "_")),
        })
    return out


def chercher(cle: str, requetes: list[str]) -> None:
    vus: dict[str, dict] = {}
    for q in requetes:
        r = api({"action": "query", "list": "search", "srsearch": q, "srnamespace": 6, "srlimit": 20})
        titres = [x["title"] for x in r["query"]["search"] if re.search(r"(?i)\.(jpe?g)$", x["title"])]
        for i in range(0, len(titres), 20):
            for f in infos(titres[i:i + 20]):
                if f["libre"] and (f["largeur"] or 0) >= 1200 and f["titre"] not in vus:
                    vus[f["titre"]] = f
    cands = list(vus.values())[:15]
    # planche contact
    from PIL import Image, ImageDraw, ImageFont
    import io
    W, H, COL = 260, 205, 5
    rows = max(1, (len(cands) + COL - 1) // COL)
    sheet = Image.new("RGB", (COL * W, rows * H), "white")
    d = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        f = ImageFont.load_default()
    for i, c in enumerate(cands):
        try:
            b = urllib.request.urlopen(urllib.request.Request(c["vignette"], headers=UA), timeout=40).read()
            im = Image.open(io.BytesIO(b)).convert("RGB")
            im.thumbnail((W - 6, H - 38))
            x, y = (i % COL) * W, (i // COL) * H
            sheet.paste(im, (x + (W - im.width) // 2, y + 2))
            d.text((x + 3, y + H - 34), f"{i+1}. {c['largeur']}px {c['licence'][:14]}", fill="black", font=f)
            d.text((x + 3, y + H - 18), c["auteur"][:34], fill="#444", font=f)
        except Exception as e:
            print("vignette", i + 1, "illisible :", e)
    out = ICI / f"planche-{cle}.jpg"
    sheet.save(out, quality=70)
    (ICI / f"planche-{cle}.json").write_text(json.dumps(cands, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{cle}: {len(cands)} photos libres ≥ 1200 px -> {out.name}")
    for i, c in enumerate(cands, 1):
        print(f"  {i:2}. {c['titre'][:70]} | {c['licence']} | {c['auteur'][:40]}")


def prendre(cle: str, titre: str, rang: int = 1) -> None:
    """Télécharge la photo choisie (largeur 1600 max) et note son crédit.

    rang 1 = la photo de l'affiche (photos/<cle>.jpg) ; rangs 2 à 5 = les photos
    qui suivent l'affiche dans la publication (photos/<cle>-<rang>.jpg)."""
    f = infos([titre])[0]
    if not f["libre"]:
        raise SystemExit(f"REFUS : licence non libre ou illisible ({f['licence']!r})")
    if not f["auteur"]:
        raise SystemExit("REFUS : auteur illisible dans les métadonnées — un crédit deviné est un crédit faux")
    CHOIX.mkdir(exist_ok=True)
    fiche = CHOIX / f"{cle}.json"
    mien = json.loads(fiche.read_text(encoding="utf-8")) if fiche.exists() else {}
    deja = {v["titre"] for f2 in CHOIX.glob("*.json") if f2 != fiche
            for v in json.loads(f2.read_text(encoding="utf-8")).values()}
    deja |= {v["titre"] for r, v in mien.items() if r != str(rang)}
    if titre in deja:
        raise SystemExit(f"REFUS : {titre} sert déjà à une autre publication — une photo, une publication")
    r = api({"action": "query", "titles": titre, "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 1600})
    url = r["query"]["pages"][0]["imageinfo"][0].get("thumburl") or f["url"]
    PHOTOS.mkdir(exist_ok=True)
    nom = f"{cle}.jpg" if rang == 1 else f"{cle}-{rang}.jpg"
    for essai in range(4):          # Commons coupe parfois une connexion (WinError 10060) : on réessaie
        try:
            (PHOTOS / nom).write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())
            break
        except OSError as e:
            if essai == 3:
                raise
            print(f"  nouvel essai ({e})")
    mien[str(rang)] = {"titre": titre, "fichier": nom, "credit": f["auteur"],
                       "licence": f["licence"], "source": f["source"]}
    fiche.write_text(json.dumps(mien, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{cle} #{rang}: {titre} | {f['auteur']} | {f['licence']} -> photos/{nom}")


def planche_retenue(cle: str) -> None:
    """La planche des photos RETENUES d'un lieu, pour la relecture finale."""
    from PIL import Image, ImageDraw, ImageFont
    fichiers = [PHOTOS / f"{cle}.jpg"] + [PHOTOS / f"{cle}-{r}.jpg" for r in range(2, 6)]
    fichiers = [f for f in fichiers if f.exists()]
    W, H = 300, 250
    sheet = Image.new("RGB", (W * len(fichiers), H), "white")
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    for i, f in enumerate(fichiers):
        im = Image.open(f).convert("RGB")
        im.thumbnail((W - 6, H - 24))
        sheet.paste(im, (i * W + (W - im.width) // 2, 2))
        d.text((i * W + 4, H - 20), f"{cle} #{i + 1}", fill="black", font=font)
    out = ICI / f"retenues-{cle}.jpg"
    sheet.save(out, quality=72)
    print(out.name, len(fichiers), "photos")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 3 and a[0] == "--numeros":
        # --numeros <clé> 5 6 11 : les photos n°5, 6, 11 de la planche, dans cet ordre = rangs 1, 2, 3.
        # Évite de recopier à la main des titres accentués (la console cp1252 les abîme).
        cands = json.loads((ICI / f"planche-{a[1]}.json").read_text(encoding="utf-8"))
        for rang, n in enumerate(a[2:], 1):
            prendre(a[1], cands[int(n) - 1]["titre"], rang)
    elif len(a) >= 3 and a[0] == "--prendre":
        rang = int(a[a.index("--rang") + 1]) if "--rang" in a else 1
        prendre(a[1], a[2], rang)
    elif len(a) == 2 and a[0] == "--retenues":
        planche_retenue(a[1])
    elif len(a) >= 2:
        chercher(a[0], a[1:])
    else:
        raise SystemExit(__doc__)
