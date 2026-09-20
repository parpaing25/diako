# -*- coding: utf-8 -*-
"""fabriquer2.py — série 2 de la page Di'ako, « Découvrir Madagascar avec Diako » :
30 publications à 12 h 00, de trois sortes, un dossier par publication dans sortie2/.

    python marketing/atelier/fabriquer2.py                 # tout
    python marketing/atelier/fabriquer2.py zombitse d-fil  # quelques-unes

Trois gabarits, tous en 1080×1350 :
  · photos : l'affiche (photo + panneau + barre du site) puis les photos, chacune créditée ;
  · récit  : l'affiche (photo, ou typographique quand le sujet n'a pas de photo libre),
             puis des cartes de texte qui racontent la légende, puis une photo s'il en reste ;
  · site   : de VRAIES captures du site en ligne (captures/, faites par captures_plan.py)
             posées dans un cadre de téléphone, avec une légende.

⚠ Le crédit des photos est SUR l'image (CC BY / BY-SA l'exigent) ; quand une photo ne
  montre pas exactement le sujet (Toamasina pour un festival, une autre scène de jazz),
  sa légende le DIT sur l'image : « legendes_photos » dans serie2.json.
⚠ Série à part de celle de 18 h (sortie/) : dossier sortie2/, heure 12:00. On ne programme
  jamais par intervalle de dates quand deux séries partagent les mêmes jours.
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
sys.path.insert(0, str(ICI))
import fabriquer as f1  # noqa: E402  — crédits, CSS de base, logo, typo : les mêmes que la série 1

SORTIE = ICI / "sortie2"
CAPTURES = ICI / "captures"
SITE = "https://diako.fonenako.mg"
PAPIER, ENCRE, TEAL, TEAL_FORT, CORAIL_TEXTE = f1.PAPIER, f1.ENCRE, f1.TEAL, f1.TEAL_FORT, f1.CORAIL_TEXTE

CSS2 = f1.CSS + f"""
/* ── carte de récit ── */
.r-cadre{{position:absolute;inset:0;background:{PAPIER};padding:70px 80px 60px;display:flex;flex-direction:column}}
.r-haut{{display:flex;justify-content:space-between;align-items:center;color:{TEAL_FORT};font-size:28px;font-weight:700}}
.r-logo{{display:flex;align-items:center;gap:12px;color:{ENCRE};font-weight:800;font-size:30px}}
.r-logo img{{width:52px;height:52px}}
.r-texte{{flex:1;display:flex;align-items:center;color:{ENCRE};font-family:Georgia,"Times New Roman",serif;
  font-size:60px;line-height:1.28;white-space:pre-line}}
.r-t{{width:100%}}
.r-guillemet{{color:{TEAL};font-family:Georgia,serif;font-size:170px;line-height:.6;height:90px}}
.r-bas{{display:flex;justify-content:space-between;align-items:center;border-top:4px solid {TEAL};padding-top:22px;
  color:{TEAL_FORT};font-size:28px;font-weight:700}}
/* ── affiche typographique ── */
.t-cadre{{position:absolute;inset:0;background:{ENCRE};overflow:hidden}}
.t-motif{{position:absolute;inset:0;opacity:.10;background:
  repeating-linear-gradient(45deg,#fff 0 2px,transparent 2px 38px),repeating-linear-gradient(-45deg,#fff 0 2px,transparent 2px 38px)}}
.t-bloc{{position:absolute;left:70px;right:70px;top:400px}}
.t-ou{{color:#8FD3D8;font-size:32px;font-weight:700;letter-spacing:.5px}}
.t-titre{{color:#fff;font-family:Georgia,serif;font-weight:700;font-size:110px;line-height:1.02;margin-top:22px}}
.t-mg{{color:#F4A383;font-style:italic;font-weight:600;font-size:44px;margin-top:30px;line-height:1.2}}
/* ── écran du site ── */
.s-cadre{{position:absolute;inset:0;background:{PAPIER};overflow:hidden}}
.s-haut{{position:absolute;left:0;top:0;right:0;padding:44px 56px 0;display:flex;justify-content:space-between;align-items:center}}
.s-logo{{display:flex;align-items:center;gap:12px;color:{ENCRE};font-weight:800;font-size:32px}}
.s-logo img{{width:56px;height:56px}}
.s-badge{{background:{TEAL};color:#fff;border-radius:999px;padding:10px 24px;font-size:24px;font-weight:700}}
.s-legende{{position:absolute;left:56px;right:56px;top:140px;color:{ENCRE};font-size:46px;font-weight:800;line-height:1.15}}
.s-tel{{position:absolute;left:50%;transform:translateX(-50%);width:520px;border-radius:58px;background:#0b1416;padding:16px;
  box-shadow:0 30px 70px rgba(16,38,43,.35)}}
.s-tel img{{display:block;width:100%;border-radius:44px}}
.s-bas{{position:absolute;left:0;right:0;bottom:0;height:96px;background:{TEAL};color:#fff;font-size:34px;font-weight:800;
  display:flex;align-items:center;justify-content:center}}
/* affiche « site » */
.c-cadre{{position:absolute;inset:0;background:linear-gradient(170deg,{TEAL} 0%,{TEAL_FORT} 62%,{ENCRE} 100%);overflow:hidden}}
.c-titre{{position:absolute;left:60px;right:60px;top:150px;color:#fff;font-weight:800;font-size:84px;line-height:1.04}}
.c-mg{{position:absolute;left:60px;right:60px;color:#FFD9C7;font-style:italic;font-weight:600;font-size:38px;line-height:1.2}}
"""

AJUSTER2 = """
<script>
function tenir(sel, max, min, hmax){
  const e=document.querySelector(sel); if(!e) return;
  let t=max; e.style.fontSize=t+'px';
  while(t>min && (e.scrollWidth>e.clientWidth+1 || e.getBoundingClientRect().height>hmax)){ t-=2; e.style.fontSize=t+'px'; }
}
</script>"""


def logo_blanc(logo: str) -> str:
    return f'<div class="logo"><img src="{logo}" alt="">Di\'ako</div>'


def credit_de(photo: dict, legende: str | None = None, recadree: bool = False) -> str:
    base = f"{photo['auteur']} · {photo['licence']} · Wikimedia Commons" + (" (recadrée)" if recadree else "")
    return f"Photo : {legende} — {base}" if legende else f"Photo : {base}"


def barre(lien: str) -> str:
    chemin = "" if lien == "/" else lien
    return f"diako.fonenako.mg{chemin}"


# ─────────────────────────── gabarits ───────────────────────────

def html_affiche_photo(p: dict, photo: dict, logo: str) -> str:
    focus = p.get("focus", "50% 50%")
    leg = (p.get("legendes_photos") or {}).get("1")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS2}</style></head><body>
<div class="cadre">
  <div class="a-photo" style="background-image:url('{f1.b64_image(photo['fichier'])}');background-position:{focus}"></div>
  <div class="a-haut">{logo_blanc(logo)}<div class="pastille">{p['rubrique']}</div></div>
  <div class="a-panneau">
    <div class="a-ou">{f1.typo(p['icone'] + ' ' + p['ou'])}</div>
    <div class="a-titre">{f1.typo(p['titre'])}</div>
    <div class="a-mg">{f1.typo(p['mg'])}</div>
  </div>
  <div class="a-barre">
    <div class="a-cta">Sur Diako → <b>{barre(p['lien'])}</b></div>
    <div class="a-credit">{credit_de(photo, leg, recadree=True)}</div>
  </div>
</div>{f1.AJUSTER}
<script>tenir('.a-cta',38,24,1);</script></body></html>"""


def html_photo_suite(p: dict, photo: dict, n: int, total: int, logo: str) -> str:
    im = Image.open(photo["fichier"])
    plein = "plein" if 0.6 <= im.width / im.height <= 0.95 else ""
    src = f1.b64_image(photo["fichier"])
    leg = (p.get("legendes_photos") or {}).get(str(photo["rang"]))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS2}</style></head><body>
<div class="cadre" style="background:#0b1416">
  <div class="p-fond" style="background-image:url('{src}')"></div>
  <img class="p-img {plein}" src="{src}" alt="">
  <div class="p-haut">{logo_blanc(logo)}<div class="pastille">{n}/{total}</div></div>
  <div class="p-bas">
    <div class="p-nom">{p['emoji']} {f1.typo(p['titre'])}</div>
    <div class="p-credit">{credit_de(photo, leg)}</div>
    <div class="p-site">{barre(p['lien'])}</div>
  </div>
</div></body></html>"""


def html_affiche_typo(p: dict, logo: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS2}</style></head><body>
<div class="cadre"><div class="t-cadre"><div class="t-motif"></div>
  <div class="a-haut" style="background:none">{logo_blanc(logo)}<div class="pastille">{p['rubrique']}</div></div>
  <div class="t-bloc">
    <div class="t-ou">{f1.typo(p['icone'] + ' ' + p['ou'])}</div>
    <div class="t-titre">{f1.typo(p['titre'])}</div>
    <div class="t-mg">{f1.typo(p['mg'])}</div>
  </div>
  <div class="a-barre"><div class="a-cta">Sur Diako → <b>{barre(p['lien'])}</b></div>
    <div class="a-credit">Illustration typographique Diako — aucune photo</div></div>
</div></div>{AJUSTER2}
<script>tenir('.t-titre',110,64,520);tenir('.t-mg',44,30,200);tenir('.a-cta',38,24,60);</script></body></html>"""


def html_carte(p: dict, texte: str, n: int, total: int, logo_noir: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS2}</style></head><body>
<div class="cadre"><div class="r-cadre">
  <div class="r-haut"><div class="r-logo"><img src="{logo_noir}" alt="">Di'ako</div><div>{n}/{total}</div></div>
  <div class="r-guillemet">“</div>
  <div class="r-texte"><div class="r-t">{f1.typo(texte)}</div></div>
  <div class="r-bas"><div>{p['icone']} {f1.typo(p['titre'])}</div><div>diako.fonenako.mg</div></div>
</div></div>{AJUSTER2}
<script>tenir('.r-t',66,40,760);</script></body></html>"""


def b64_png(chemin: Path, largeur: int = 900) -> str:
    im = Image.open(chemin).convert("RGB")
    im.thumbnail((largeur, largeur * 3))
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def html_affiche_site(p: dict, capture: Path, logo: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS2}</style></head><body>
<div class="cadre"><div class="c-cadre">
  <div class="a-haut" style="background:none">{logo_blanc(logo)}<div class="pastille">{p['rubrique']}</div></div>
  <div class="c-titre">{f1.typo(p['titre'])}</div>
  <div class="c-mg" id="mg">{f1.typo(p['mg'])}</div>
  <div class="s-tel" id="tel"><img src="{b64_png(capture)}" alt=""></div>
  <div class="s-bas">Sur Diako → {barre(p['lien'])}</div>
</div></div>{AJUSTER2}
<script>
/* ⚠ bloc isolé : set_content garde les « const » du rendu précédent, un second « const t »
   lèverait une erreur et laisserait le téléphone collé en haut, sur le titre */
(() => {{
tenir('.c-titre',84,52,280);
const t=document.querySelector('.c-titre').getBoundingClientRect();
const mg=document.getElementById('mg'); mg.style.top=(t.bottom+18)+'px'; tenir('#mg',38,26,100);
document.getElementById('tel').style.top=(mg.getBoundingClientRect().bottom+44)+'px';
}})();
</script></body></html>"""


def html_ecran(p: dict, capture: Path, legende: str, n: int, total: int, logo_noir: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS2}</style></head><body>
<div class="cadre"><div class="s-cadre">
  <div class="s-haut"><div class="s-logo"><img src="{logo_noir}" alt="">Di'ako</div><div class="s-badge">{n}/{total}</div></div>
  <div class="s-legende" id="leg">{f1.typo(legende)}</div>
  <div class="s-tel" id="tel"><img src="{b64_png(capture)}" alt=""></div>
  <div class="s-bas">{barre(p['lien'])}</div>
</div></div>{AJUSTER2}
<script>
(() => {{
tenir('#leg',46,30,120);
document.getElementById('tel').style.top=(document.getElementById('leg').getBoundingClientRect().bottom+34)+'px';
}})();
</script></body></html>"""


# ─────────────────────────── texte ───────────────────────────

def brouillon(p: dict, photos: list[dict], utm: str) -> str:
    lien = f"{SITE}{p['lien']}?{utm.format(cle=p['cle'])}"
    blocs = [f"{p['icone']} {p['titre']} — {p['mg']} {p['emoji']}🇲🇬", *p["corps"], "🙋 " + p["question"],
             f"👉 {p['cta']} : {lien}"]
    if photos:
        auteurs = []
        for ph in photos:
            if ph["auteur"] not in auteurs:
                auteurs.append(ph["auteur"])
        ligne = "📷 Photos : " + " · ".join(auteurs) + " — Wikimedia Commons, licences libres (détail sur chaque image)"
        if p.get("note_texte"):
            ligne += ". " + p["note_texte"]
        blocs.append(ligne)
    if p["type"] == "site":
        blocs.append("📱 Captures d'écran du site Diako en ligne")
    blocs.append(" ".join(p["hashtags"]))
    return "\n\n".join(blocs).strip()


# ─────────────────────────── fabrication ───────────────────────────

def photos_de(p: dict) -> list[dict]:
    if not p.get("photos"):
        return []
    out = f1.photos_du_lieu(p["photos"], {})
    for ph in out:                     # Commons écrit « Unknown authorUnknown author » pour un anonyme
        if re.search(r"(?i)unknown author", ph["auteur"]):
            ph["auteur"] = "auteur inconnu"
    return out


def rendre(page, html: str, dest: Path, attente: int = 250) -> None:
    page.set_content(html, wait_until="load")
    page.wait_for_timeout(attente)
    page.screenshot(path=str(dest))


def main() -> int:
    serie = json.loads((ICI / "serie2.json").read_text(encoding="utf-8"))
    pubs = serie["publications"]
    debut = date.fromisoformat(serie["debut"])
    seules = [a for a in sys.argv[1:] if not a.startswith("--")]
    for p in pubs:                           # un lien manquant ou une capture absente = refus AVANT rendu
        if not p.get("lien"):
            raise SystemExit(f"{p['cle']} : aucun lien vers le site")
        for c in p.get("captures", []):
            if not (CAPTURES / f"{c['f']}.png").exists():
                raise SystemExit(f"{p['cle']} : capture {c['f']}.png absente — lancer captures_plan.py")

    from playwright.sync_api import sync_playwright
    logo = f1.b64_logo()
    logo_noir = logo                          # le logo d'origine est sombre ; inversé en blanc par CSS sur fond foncé
    SORTIE.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        page = nav.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=1)
        for i, p in enumerate(pubs, 1):
            if seules and p["cle"] not in seules:
                continue
            jour = debut + timedelta(days=i - 1)
            dossier = SORTIE / f"{jour.isoformat()}-{p['cle']}"
            for ancien in SORTIE.glob(f"*-{p['cle']}"):
                if ancien != dossier and re.match(r"\d{4}-\d{2}-\d{2}-", ancien.name):
                    for x in ancien.iterdir():
                        x.unlink()
                    ancien.rmdir()
            dossier.mkdir(exist_ok=True)
            for x in list(dossier.glob("fil-*.png")) + list(dossier.glob("affiche-fil.png")):
                x.unlink()
            photos = photos_de(p)
            images: list[str] = []            # dans l'ordre : affiche-fil.png, fil-2.png, …

            def suivante() -> Path:
                return dossier / ("affiche-fil.png" if not images else f"fil-{len(images) + 1}.png")

            if p["type"] == "photos":
                if not photos:
                    raise SystemExit(f"{p['cle']} : aucune photo")
                total = min(5, len(photos))
                d0 = suivante(); rendre(page, html_affiche_photo(p, photos[0], logo), d0); images.append(d0.name)
                for n, ph in enumerate(photos[1:5], 2):
                    d = suivante(); rendre(page, html_photo_suite(p, ph, n, total, logo), d, 150); images.append(d.name)
            elif p["type"] == "recit":
                cartes = p["cartes"]
                reste = photos[1:] if photos else []
                extra = min(len(reste), max(0, 4 - len(cartes)))       # 5 images au plus, affiche comprise
                total = 1 + len(cartes) + extra
                utilisees = photos[:1]
                d0 = suivante()
                rendre(page, html_affiche_photo(p, photos[0], logo) if photos else html_affiche_typo(p, logo), d0)
                images.append(d0.name)
                for k, texte in enumerate(cartes, 2):
                    d = suivante(); rendre(page, html_carte(p, texte, k, total, logo_noir), d); images.append(d.name)
                for ph in reste[:extra]:
                    d = suivante(); rendre(page, html_photo_suite(p, ph, len(images) + 1, total, logo), d, 150)
                    images.append(d.name); utilisees.append(ph)
                photos = utilisees                                     # le crédit du texte = les photos MONTRÉES
            elif p["type"] == "site":
                caps = p["captures"]
                total = min(5, len(caps) + 1)
                d0 = suivante(); rendre(page, html_affiche_site(p, CAPTURES / f"{caps[0]['f']}.png", logo), d0, 400)
                images.append(d0.name)
                # l'affiche montre déjà le 1er écran : avec 3 écrans ou plus, les pages suivantes partent du 2e
                suite = caps[1:] if len(caps) >= 3 else caps
                total = min(5, len(suite) + 1)
                for k, c in enumerate(suite[:4], 2):
                    d = suivante()
                    rendre(page, html_ecran(p, CAPTURES / f"{c['f']}.png", c["legende"], k, total, logo_noir), d, 400)
                    images.append(d.name)
            else:
                raise SystemExit(f"{p['cle']} : type inconnu {p['type']}")

            texte = brouillon(p, photos, serie["utm"])
            (dossier / "brouillon.txt").write_text(texte + "\n", encoding="utf-8")
            (dossier / "fiche.json").write_text(json.dumps({
                "cle": p["cle"], "serie": serie["serie"], "type": p["type"], "date": jour.isoformat(),
                "heure": serie["heure"], "rang": f"{i}/{len(pubs)}", "lien": p["lien"], "attendu": p.get("attendu"),
                "page": "Di'ako (108742855158464)", "images": images,
                "photos": [{k: (str(v.name) if k == "fichier" else v) for k, v in ph.items()} for ph in photos],
                "captures": [c["f"] for c in p.get("captures", [])],
                "sources": p.get("sources", []), "comptes": serie["comptes_releves"] if p["type"] == "site" else None,
            }, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{i:2}/{len(pubs)} {jour} {p['type']:6} {p['cle']:16} {len(images)} image(s) -> {dossier.name}", flush=True)
        nav.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
