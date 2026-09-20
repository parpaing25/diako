# -*- coding: utf-8 -*-
"""fabriquer.py — fabrique les 30 publications de la série « Lieux emblématiques »
de la page Facebook Di'ako : un dossier par publication, prêt pour onglets.py.

    python marketing/atelier/fabriquer.py --debut 2026-09-19            # tout
    python marketing/atelier/fabriquer.py --debut 2026-09-19 andasibe   # une seule
    python marketing/atelier/fabriquer.py --planche                     # relecture

Chaque dossier `sortie/AAAA-MM-JJ-<clé>/` reçoit :
  affiche-fil.png   1080×1350 — la photo n°1, le nom, le sous-titre malgache, le site
  fil-2.png … fil-5.png  1080×1350 — les photos suivantes, chacune avec son crédit
  brouillon.txt     le texte EXACT à coller dans le composeur
  fiche.json        date, heure, lien, et la provenance de chaque photo

⚠ LE CRÉDIT EST SUR L'IMAGE, pas seulement dans le texte. Les licences CC BY et
  CC BY-SA exigent l'auteur et la licence avec l'œuvre : une photo repartagée sans
  sa légende perdrait son crédit en route.
⚠ LES PHOTOS 2 À 5 NE SONT JAMAIS ROGNÉES : un paysage est posé entier sur un fond
  flou tiré de lui-même. Rogner au centre coupait les lémuriens et les phares.
"""
from __future__ import annotations

import base64
import io
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
DEPOT = ICI.parent.parent
PHOTOS = ICI / "photos"
SORTIE = ICI / "sortie"
LOGO = DEPOT / "public" / "media" / "diako-marque-512.png"
SITE = "https://diako.fonenako.mg"

# Couleurs relevées dans src/index.css (contrastes AA documentés là-bas)
PAPIER, ENCRE, TEAL, TEAL_FORT, CORAIL_TEXTE = "#FBF7F1", "#10262B", "#0E7C86", "#0A5F67", "#BF4118"


def b64_image(chemin: Path, largeur_max: int = 1600) -> str:
    im = Image.open(chemin).convert("RGB")
    im.thumbnail((largeur_max, largeur_max))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def b64_logo() -> str:
    return "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode()


def licence_lisible(l: str) -> str:
    l = (l or "").strip()
    if re.match(r"(?i)^(public domain|pd)", l):
        return "Domaine public"
    return l


def auteur_lisible(a: str) -> str:
    a = re.sub(r"^User:", "", (a or "").strip())
    a = re.sub(r"\s+at English Wikipedia$", "", a)
    return a.strip()


def photos_du_lieu(cle: str, candidats: dict) -> list[dict]:
    """Rang 1 (affiche) puis 2..5, avec leur crédit. Rang 1 vient de la base Diako
    (candidats.json) ou de Commons (choix/<clé>.json) ; les suivants de Commons."""
    choix_f = ICI / "choix" / f"{cle}.json"
    choix = json.loads(choix_f.read_text(encoding="utf-8")) if choix_f.exists() else {}
    out = []
    for rang in range(1, 6):
        fichier = PHOTOS / (f"{cle}.jpg" if rang == 1 else f"{cle}-{rang}.jpg")
        if not fichier.exists():
            continue
        c = choix.get(str(rang))
        if c:
            cred = {"auteur": auteur_lisible(c["credit"]), "licence": licence_lisible(c["licence"]),
                    "source": c["source"], "titre": c["titre"]}
        elif rang == 1 and candidats.get(cle, {}).get("photo"):
            p = candidats[cle]["photo"]
            cred = {"auteur": auteur_lisible(p["credit"]), "licence": licence_lisible(p["licence"]),
                    "source": p["source"], "titre": p["source"].rsplit("/", 1)[-1]}
        else:
            raise SystemExit(f"{cle} #{rang} : photo SANS crédit connu — refusée")
        out.append({"rang": rang, "fichier": fichier, **cred})
    return out


CSS = f"""
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1080px;height:1350px;overflow:hidden;font-family:"Segoe UI",system-ui,Arial,sans-serif;background:{PAPIER}}}
.cadre{{position:relative;width:1080px;height:1350px;overflow:hidden}}
.logo{{display:flex;align-items:center;gap:14px;color:#fff;font-weight:800;font-size:34px;letter-spacing:.3px;text-shadow:0 2px 10px rgba(0,0,0,.45)}}
.logo img{{width:62px;height:62px;filter:invert(1) drop-shadow(0 2px 6px rgba(0,0,0,.4))}}
.pastille{{background:rgba(16,38,43,.62);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:999px;
  padding:10px 22px;font-size:24px;font-weight:600;backdrop-filter:blur(6px)}}
/* ── affiche ── */
.a-photo{{position:absolute;left:0;top:0;width:1080px;height:905px;background-size:cover}}
.a-haut{{position:absolute;left:0;top:0;right:0;height:220px;padding:36px 40px;display:flex;justify-content:space-between;align-items:flex-start;
  background:linear-gradient(to bottom,rgba(0,0,0,.55),rgba(0,0,0,0))}}
.a-panneau{{position:absolute;left:0;top:905px;width:1080px;height:325px;background:{PAPIER};padding:18px 56px 14px;
  border-top:10px solid {TEAL};display:flex;flex-direction:column;justify-content:center}}
.a-ou{{color:{TEAL_FORT};font-size:29px;font-weight:700;letter-spacing:.5px}}
.a-titre{{color:{ENCRE};font-weight:800;line-height:1.02;margin-top:10px;font-size:96px}}
.a-mg{{color:{CORAIL_TEXTE};font-style:italic;font-weight:600;font-size:40px;margin-top:14px;line-height:1.15}}
.a-barre{{position:absolute;left:0;bottom:0;width:1080px;height:120px;background:{TEAL};color:#fff;padding:18px 56px}}
.a-cta{{font-size:38px;font-weight:800}}
.a-cta b{{font-weight:800;text-decoration:underline;text-underline-offset:6px}}
.a-credit{{font-size:19px;opacity:.9;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
/* ── photos 2 à 5 ── */
.p-fond{{position:absolute;inset:-60px;background-size:cover;background-position:center;filter:blur(38px) brightness(.5)}}
.p-img{{position:absolute;left:0;top:0;width:1080px;height:1350px;object-fit:contain}}
.p-img.plein{{object-fit:cover}}
.p-haut{{position:absolute;left:0;top:0;right:0;padding:34px 40px;display:flex;justify-content:space-between;align-items:center;
  background:linear-gradient(to bottom,rgba(0,0,0,.5),rgba(0,0,0,0));height:190px}}
.p-bas{{position:absolute;left:0;bottom:0;right:0;padding:70px 40px 30px;color:#fff;
  background:linear-gradient(to top,rgba(0,0,0,.72),rgba(0,0,0,0))}}
.p-nom{{font-size:40px;font-weight:800;text-shadow:0 2px 10px rgba(0,0,0,.5)}}
.p-credit{{font-size:20px;opacity:.92;margin-top:6px}}
.p-site{{font-size:24px;font-weight:700;margin-top:10px;color:#E7F2F3}}
"""

# Réduit le titre (puis le sous-titre) jusqu'à tenir : deux lignes au plus, sans débordement.
AJUSTER = """
<script>
function tenir(sel, max, min, lignes){
  const e=document.querySelector(sel); if(!e) return;
  let t=max; e.style.fontSize=t+'px';
  const lh=()=>parseFloat(getComputedStyle(e).lineHeight)||t*1.1;
  while(t>min && (e.scrollWidth>e.clientWidth+1 || e.getBoundingClientRect().height>lh()*lignes+2)){ t-=2; e.style.fontSize=t+'px'; }
}
tenir('.a-titre',96,56,2); tenir('.a-mg',40,28,2);
</script>"""


def typo(t: str) -> str:
    """L'apostrophe droite devient typographique sur l'image (pas dans le texte collé)."""
    return t.replace("'", "’")


def html_affiche(p: dict, photo: dict, rang_serie: int, total: int, logo: str) -> str:
    focus = p.get("focus", "50% 50%")
    credit = f"Photo : {photo['auteur']} · {photo['licence']} · Wikimedia Commons (recadrée)"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="cadre">
  <div class="a-photo" style="background-image:url('{b64_image(photo['fichier'])}');background-position:{focus}"></div>
  <div class="a-haut">
    <div class="logo"><img src="{logo}" alt="">Di'ako</div>
    <div class="pastille">Lieux emblématiques · {rang_serie}/{total}</div>
  </div>
  <div class="a-panneau">
    <div class="a-ou">📍 {typo(p['ou'])}</div>
    <div class="a-titre">{typo(p['titre'])}</div>
    <div class="a-mg">{typo(p['mg'])}</div>
  </div>
  <div class="a-barre">
    <div class="a-cta">Tout sur ce lieu → <b>diako.fonenako.mg</b></div>
    <div class="a-credit">{credit}</div>
  </div>
</div>{AJUSTER}</body></html>"""


def html_photo(p: dict, photo: dict, n: int, total_photos: int, logo: str) -> str:
    im = Image.open(photo["fichier"])
    # Portrait proche du 4:5 : on remplit. Mais une image TRÈS verticale (Ankarana, 1248×3147)
    # recadrée au centre perdrait ce qu'elle montre — le lac au fond du canyon : on la pose entière.
    ratio = im.width / im.height
    plein = "plein" if 0.6 <= ratio <= 0.95 else ""
    src = b64_image(photo["fichier"])
    credit = f"Photo : {photo['auteur']} · {photo['licence']} · Wikimedia Commons"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="cadre" style="background:#0b1416">
  <div class="p-fond" style="background-image:url('{src}')"></div>
  <img class="p-img {plein}" src="{src}" alt="">
  <div class="p-haut">
    <div class="logo"><img src="{logo}" alt="">Di'ako</div>
    <div class="pastille">{n}/{total_photos}</div>
  </div>
  <div class="p-bas">
    <div class="p-nom">{p['emoji']} {p['titre']}</div>
    <div class="p-credit">{credit}</div>
    <div class="p-site">diako.fonenako.mg</div>
  </div>
</div></body></html>"""


def brouillon(p: dict, photos: list[dict], utm: str) -> str:
    lien = f"{SITE}{p['lien']}?{utm.format(cle=p['cle'])}"
    if p.get("adresses"):
        ligne_site = f"🌍 Où dormir et où manger à {p['titre']}, sur Diako 👉 {lien}"
    else:
        ligne_site = f"🌍 La fiche {p['titre']} sur Diako, le réseau social du voyage à Madagascar 👉 {lien}"
    auteurs = []
    for ph in photos:
        if ph["auteur"] not in auteurs:
            auteurs.append(ph["auteur"])
    credits = "📷 Photos : " + " · ".join(auteurs) + " — Wikimedia Commons, licences libres (détail sur chaque image)"
    blocs = [f"📍 {p['titre']} — {p['mg']} {p['emoji']}🇲🇬", *p["corps"], p["question"], ligne_site, credits,
             " ".join(p["hashtags"])]
    return "\n\n".join(blocs).strip()


# Le slug français, pas « lake-andraikiba » ; et les lieux choisis après la collecte.
LIENS_FORCES = {"andraikiba": "/site/lac-andraikiba", "ampefy": "/lieu/ampefy", "zafimaniry": "/lieu/zafimaniry",
                "belo-sur-mer": "/lieu/belo-sur-mer", "foulpointe": "/lieu/foulpointe",
                "nosy-mangabe": "/lieu/nosy-mangabe"}


def charger() -> tuple[dict, dict, list[dict]]:
    """La série, les candidats, et le lien de chaque publication : la fiche du LIEU si
    elle existe (plus riche), sinon celle du SITE. Aucun lien = publication refusée."""
    serie = json.loads((ICI / "serie.json").read_text(encoding="utf-8"))
    candidats = {c["cle"]: c for c in json.loads((ICI / "candidats.json").read_text(encoding="utf-8"))}
    pubs = serie["publications"]
    for p in pubs:
        p["lien"] = LIENS_FORCES.get(p["cle"]) or (candidats.get(p["cle"]) or {}).get("lien")
        if not p["lien"]:
            raise SystemExit(f"{p['cle']} : aucun lien vers le site — publication refusée")
    return serie, candidats, pubs


def main() -> int:
    args = sys.argv[1:]
    serie, candidats, pubs = charger()

    if "--debut" not in args:
        raise SystemExit("--debut AAAA-MM-JJ obligatoire : la date du premier jour de la série")
    debut = date.fromisoformat(args[args.index("--debut") + 1])
    seules = [a for a in args if not a.startswith("--") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a)]

    from playwright.sync_api import sync_playwright
    logo = b64_logo()
    SORTIE.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        page = nav.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=1)
        for i, p in enumerate(pubs, 1):
            if seules and p["cle"] not in seules:
                continue
            jour = debut + timedelta(days=i - 1)
            dossier = SORTIE / f"{jour.isoformat()}-{p['cle']}"
            # une publication change de date si le début change : on retire l'ancien dossier du même lieu
            for ancien in SORTIE.glob(f"*-{p['cle']}"):
                if ancien != dossier and re.match(r"\d{4}-\d{2}-\d{2}-", ancien.name):
                    for f in ancien.iterdir():
                        f.unlink()
                    ancien.rmdir()
            dossier.mkdir(exist_ok=True)
            photos = photos_du_lieu(p["cle"], candidats)
            if len(photos) < 1:
                raise SystemExit(f"{p['cle']} : aucune photo")
            for f in dossier.glob("fil-*.png"):
                f.unlink()
            page.set_content(html_affiche(p, photos[0], i, len(pubs), logo), wait_until="load")
            page.wait_for_timeout(250)
            page.screenshot(path=str(dossier / "affiche-fil.png"))
            for n, ph in enumerate(photos[1:], 2):
                page.set_content(html_photo(p, ph, n, len(photos), logo), wait_until="load")
                page.wait_for_timeout(150)
                page.screenshot(path=str(dossier / f"fil-{n}.png"))
            texte = brouillon(p, photos, serie["utm"])
            (dossier / "brouillon.txt").write_text(texte + "\n", encoding="utf-8")
            (dossier / "fiche.json").write_text(json.dumps({
                "cle": p["cle"], "date": jour.isoformat(), "heure": serie["heure"], "rang": f"{i}/{len(pubs)}",
                "lien": p["lien"], "page": "Di'ako (108742855158464)",
                "photos": [{k: (str(v.name) if k == "fichier" else v) for k, v in ph.items()} for ph in photos],
                "sources_faits": serie["sources_faits"],
            }, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{i:2}/{len(pubs)} {jour} {p['cle']:18} {len(photos)} photo(s) -> {dossier.name}")
        nav.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
