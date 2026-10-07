# -*- coding: utf-8 -*-
"""fabriquer3.py — série 3 de la page Di'ako, « Tanàna tsirairay — ville par ville » :
30 publications à 15 h 00, un dossier par publication dans sortie3/.

    python marketing/atelier/fabriquer3.py                    # tout
    python marketing/atelier/fabriquer3.py antsirabe ihosy    # quelques-unes

Cinq gabarits, tous en 1080×1350 :
  · affiche photo  : la photo Commons créditée + le panneau (gabarit de la série 2) ;
  · affiche mot    : l'affiche typographique de la série 3 — le NOM de la ville, découpé ;
  · carte sens     : le nom décomposé, chaque morceau avec ce qu'il veut dire ;
  · carte noms     : le nombre de lieux qui partagent ce début (ou cette fin) de nom ;
  · carte chiffres : ce que Diako référence sur place, avec la date du relevé.

🔴 AUCUN NOMBRE N'EST ÉCRIT À LA MAIN. Les textes de serie3.json portent des gabarits
  ({hotels}, {restaurants}, {motif_nombre}…) remplis ici depuis chiffres3.json, lui-même
  recalculé par chiffres3.py depuis le miroir local en lecture seule. Un gabarit inconnu
  laisse une accolade : `remplir()` refuse alors la publication au lieu de la publier fausse.

⚠ `ref_pages` est chargé sans filtre `is_published` : on écrit « référencés sur Diako »,
  jamais « publiés ». Le mot est posé dans le gabarit de la carte chiffres, pas au hasard
  des textes.
⚠ Le crédit des photos est SUR l'image (CC BY / BY-SA l'exigent).
⚠ Série à part de celles de 18 h (sortie/) et de 12 h (sortie2/) : dossier sortie3/,
  heure 15:00. On ne programme jamais par intervalle de dates quand trois séries
  partagent les mêmes jours.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import fabriquer as f1    # noqa: E402  — couleurs, CSS de base, logo, typo, crédits
import fabriquer2 as f2   # noqa: E402  — affiche photo, photo suivante, carte de texte

SORTIE = ICI / "sortie3"
PAPIER, ENCRE, TEAL, TEAL_FORT = f1.PAPIER, f1.ENCRE, f1.TEAL, f1.TEAL_FORT
CORAIL_TEXTE = f1.CORAIL_TEXTE          # #BF4118 : le corail clair #F4633A ne porte jamais de texte

CSS3 = f2.CSS2 + f"""
/* ── affiche « mot » : le nom de la ville, découpé ── */
.m-cadre{{position:absolute;inset:0;background:{ENCRE};overflow:hidden}}
.m-motif{{position:absolute;inset:0;opacity:.09;
  background:repeating-linear-gradient(0deg,#fff 0 2px,transparent 2px 44px)}}
.m-bloc{{position:absolute;left:70px;right:70px;top:330px;text-align:center}}
.m-ou{{color:#8FD3D8;font-size:30px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase}}
.m-titre{{color:#fff;font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:104px;
  line-height:1.03;margin-top:26px}}
.m-trait{{width:120px;height:5px;background:{TEAL};margin:38px auto 0;border-radius:3px}}
.m-decoupe{{margin-top:36px;color:#8FD3D8;font-size:44px;font-weight:700;letter-spacing:2px}}
.m-sens{{margin-top:26px;color:#FFD9C7;font-style:italic;font-weight:600;font-size:46px;line-height:1.25}}
/* ── cartes de données ── */
.d-cadre{{position:absolute;inset:0;background:{PAPIER};padding:70px 80px 60px;display:flex;flex-direction:column}}
.d-haut{{display:flex;justify-content:space-between;align-items:center;color:{TEAL_FORT};font-size:28px;font-weight:700}}
.d-logo{{display:flex;align-items:center;gap:12px;color:{ENCRE};font-weight:800;font-size:30px}}
.d-logo img{{width:52px;height:52px}}
.d-corps{{flex:1;display:flex;flex-direction:column;justify-content:center}}
.d-bas{{display:flex;justify-content:space-between;align-items:flex-end;border-top:4px solid {TEAL};
  padding-top:22px;color:{TEAL_FORT};font-size:26px;font-weight:700}}
.d-source{{font-size:20px;font-weight:600;color:#5A6B6E;max-width:620px;text-align:right;line-height:1.3}}
/* carte « sens » */
.s3-part{{display:flex;align-items:baseline;gap:26px;margin-bottom:34px}}
.s3-mot{{color:{ENCRE};font-family:Georgia,serif;font-weight:700;font-size:62px;white-space:nowrap}}
.s3-fleche{{color:{TEAL};font-size:38px;font-weight:800}}
.s3-def{{color:{TEAL_FORT};font-size:38px;font-weight:600;font-style:italic}}
.s3-total{{margin-top:18px;padding-top:30px;border-top:3px dashed #D8CEC2;color:{CORAIL_TEXTE};
  font-size:46px;font-weight:800;line-height:1.25}}
/* carte « noms » */
.n-nombre{{color:{TEAL};font-family:Georgia,serif;font-weight:700;font-size:168px;line-height:1}}
.n-phrase{{color:{ENCRE};font-size:46px;font-weight:700;line-height:1.3;margin-top:10px}}
.n-liste{{margin-top:38px;display:flex;flex-wrap:wrap;gap:14px}}
.n-puce{{background:#E7F2F3;color:{TEAL_FORT};border-radius:999px;padding:12px 26px;font-size:31px;font-weight:700}}
/* carte « chiffres » */
.c3-titre{{color:{ENCRE};font-size:48px;font-weight:800;line-height:1.2}}
.c3-grille{{margin-top:46px;display:flex;gap:30px}}
.c3-case{{flex:1;background:#fff;border:4px solid {TEAL};border-radius:28px;padding:34px 28px;text-align:center}}
.c3-n{{color:{TEAL};font-family:Georgia,serif;font-weight:700;font-size:118px;line-height:1}}
.c3-l{{color:{ENCRE};font-size:33px;font-weight:700;margin-top:10px}}
.c3-note{{margin-top:38px;color:#5A6B6E;font-size:28px;font-weight:600;line-height:1.35}}
"""


def barre3(lien: str) -> str:
    """L'adresse affichée sur l'image. Un slug qui finit par « -2 », « -5 »… est une
    DÉSAMBIGUÏSATION interne (deux fiches portent le même nom) : affichée en grand sur
    l'affiche, elle passe pour une faute. Dans ce cas on montre le domaine seul ; le lien
    exact, lui, reste dans le texte collé."""
    import re as _re
    return "diako.fonenako.mg" if _re.search(r"-\d+$", lien) else f2.barre(lien)


def fmt(n: int) -> str:
    """1202 -> « 1 202 ». Espace ordinaire : l'espace fine insécable U+202F revient
    déformée des services externes et casse toute comparaison de texte."""
    return f"{n:,}".replace(",", " ")


def remplir(texte: str, ctx: dict) -> str:
    """Remplace les gabarits {clé}. Une accolade qui survit = gabarit inconnu = REFUS."""
    for k, v in ctx.items():
        texte = texte.replace("{" + k + "}", str(v))
    if "{" in texte or "}" in texte:
        reste = re.findall(r"\{[^}]*\}?", texte)
        raise SystemExit(f"gabarit non rempli {reste} dans : {texte[:120]}")
    return texte


def contexte(p: dict, ch: dict) -> dict:
    v = ch["villes"][p["cle"]]
    ctx = {"ville": v["libelle"], "region": v["region"],
           "hotels": fmt(v["hotels"]), "restaurants": fmt(v["restaurants"]), "pages": fmt(v["pages"]),
           "total_lieux": fmt(ch["total_lieux"]), "total_villes": fmt(ch["total_villes"]),
           "total_pages": fmt(ch["total_pages"]), "releve": ch["referentiel_charge_le"]}
    if p.get("motif"):
        m = ch["motifs"][p["motif"]]
        ctx |= {"motif": m["motif"], "motif_nombre": fmt(m["nombre"]), "motif_sens": m["sens"]}
    return ctx


# ─────────────────────────── gabarits ───────────────────────────

def html_affiche_mot(p: dict, ctx: dict, logo: str) -> str:
    sens = p.get("sens")
    bloc_sens = f'<div class="m-sens" id="sens">« {f1.typo(remplir(sens, ctx))} »</div>' if sens else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS3}</style></head><body>
<div class="cadre"><div class="m-cadre"><div class="m-motif"></div>
  <div class="a-haut" style="background:none">{f2.logo_blanc(logo)}<div class="pastille">{p['rubrique']}</div></div>
  <div class="m-bloc">
    <div class="m-ou">{f1.typo(p['ou'])}</div>
    <div class="m-titre" id="t">{f1.typo(p['titre'])}</div>
    <div class="m-trait"></div>
    <div class="m-decoupe" id="dec">{f1.typo(p['decoupe'])}</div>
    {bloc_sens}
  </div>
  <div class="a-barre"><div class="a-cta">Sur Diako → <b>{barre3(p["lien"])}</b></div>
    <div class="a-credit">Affiche typographique Diako — aucune photo</div></div>
</div></div>{f2.AJUSTER2}
<script>(() => {{
tenir('#t',104,54,250); tenir('#dec',44,24,120); tenir('#sens',46,28,180);
/* ⚠ une adresse longue (/lieu/fenoarivo-atsinanana) passe à la ligne dans la barre
   de 120 px et POUSSE LA LIGNE DE CRÉDIT HORS DU CADRE : on la réduit jusqu'à tenir */
tenir('.a-cta',38,22,1);
const b=document.querySelector('.m-bloc'); const h=b.getBoundingClientRect().height;
b.style.top=Math.max(150,(1230-h)/2)+'px';
}})();</script></body></html>"""


def html_carte_sens(p: dict, ctx: dict, n: int, total: int, logo: str) -> str:
    parts = [x.strip() for x in p["decoupe"].split("·")]
    defs = p.get("defs") or {}
    lignes = ""
    for x in parts:
        d = defs.get(x)
        lignes += (f'<div class="s3-part"><div class="s3-mot">{f1.typo(x)}</div>'
                   + (f'<div class="s3-fleche">→</div><div class="s3-def">{f1.typo(d)}</div>' if d else "")
                   + "</div>")
    total_sens = f'<div class="s3-total">« {f1.typo(remplir(p["sens"], ctx))} »</div>' if p.get("sens") else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS3}</style></head><body>
<div class="cadre"><div class="d-cadre">
  <div class="d-haut"><div class="d-logo"><img src="{logo}" alt="">Di'ako</div><div>{n}/{total}</div></div>
  <div class="d-corps"><div>
    <div class="m-ou" style="color:{TEAL_FORT};margin-bottom:34px">Ny anarana · le nom</div>
    {lignes}{total_sens}
  </div></div>
  <div class="d-bas"><div>{p['icone']} {f1.typo(p['titre'])}</div><div>diako.fonenako.mg</div></div>
</div></div></body></html>"""


def html_carte_noms(p: dict, ch: dict, ctx: dict, n: int, total: int, logo: str) -> str:
    m = ch["motifs"][p["motif"]]
    phrase = "noms de lieux commencent par" if m["mode"] == "debut" else "noms de lieux finissent par"
    # Des exemples RÉELS, pris dans le référentiel, la ville elle-même écartée.
    # ⚠ Le gazetier porte des suffixes administratifs : « Ambohitrakely FKT ANONOKA »,
    #   « Tanambao Sanfily NORD », « Mahasoa II ». Ce sont de vrais noms, mais sur une
    #   carte publique ils passent pour du bruit : on préfère les noms d'un seul mot,
    #   et on ne retombe sur les autres que s'il n'y en a pas assez.
    # « Fenoarivo » ne sert pas d'exemple à la publication « Fenoarivo Atsinanana » :
    # on écarte aussi les noms contenus dans le titre, pas seulement le titre exact.
    titre = p["titre"].lower()
    libres = [x for x in m["exemples"] if x.lower() not in titre and titre not in x.lower()]
    nets = [x for x in libres if " " not in x]
    ex = (nets if len(nets) >= 5 else libres)[:7]
    puces = "".join(f'<div class="n-puce">{f1.typo(x)}</div>' for x in ex)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS3}</style></head><body>
<div class="cadre"><div class="d-cadre">
  <div class="d-haut"><div class="d-logo"><img src="{logo}" alt="">Di'ako</div><div>{n}/{total}</div></div>
  <div class="d-corps"><div>
    <div class="n-nombre">{fmt(m['nombre'])}</div>
    <div class="n-phrase" id="ph">{phrase} <b>{m['motif']}</b><br><span style="font-weight:600;font-style:italic;color:{TEAL_FORT}">{f1.typo(m['sens'])}</span></div>
    <div class="n-liste">{puces}</div>
  </div></div>
  <div class="d-bas"><div>{p['icone']} {f1.typo(p['titre'])}</div>
    <div class="d-source">Référentiel Diako, {fmt(ch['total_lieux'])} noms de lieux<br>relevé le {ch['referentiel_charge_le']}</div></div>
</div></div>{f2.AJUSTER2}
<script>(() => {{ tenir('#ph',46,30,170); }})();</script></body></html>"""


def html_carte_chiffres(p: dict, ch: dict, n: int, total: int, logo: str) -> str:
    v = ch["villes"][p["cle"]]
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS3}</style></head><body>
<div class="cadre"><div class="d-cadre">
  <div class="d-haut"><div class="d-logo"><img src="{logo}" alt="">Di'ako</div><div>{n}/{total}</div></div>
  <div class="d-corps"><div>
    <div class="c3-titre" id="ti">Sur Diako, à {f1.typo(v['libelle'])}</div>
    <div class="c3-grille">
      <div class="c3-case"><div class="c3-n">{fmt(v['hotels'])}</div><div class="c3-l">hôtels</div></div>
      <div class="c3-case"><div class="c3-n">{fmt(v['restaurants'])}</div><div class="c3-l">restaurants</div></div>
    </div>
    <div class="c3-note">Fiches d'établissements référencées dans le référentiel Diako,<br>
      relevé le {ch['referentiel_charge_le']}. Une adresse manque ? Ajoutez-la.</div>
  </div></div>
  <div class="d-bas"><div>{p['icone']} {f1.typo(v['region'])}</div><div>diako.fonenako.mg</div></div>
</div></div>{f2.AJUSTER2}
<script>(() => {{ tenir('#ti',48,30,130); }})();</script></body></html>"""


# ─────────────────────────── texte ───────────────────────────

def brouillon(p: dict, photos: list[dict], utm: str, ctx: dict) -> str:
    lien = f"{f2.SITE}{p['lien']}?{utm.format(cle=p['cle'])}"
    corps = [remplir(x, ctx) for x in p["corps"]]
    blocs = [f"{p['icone']} {p['titre']} — {p['mg']} {p['emoji']}🇲🇬", *corps,
             "🙋 " + remplir(p["question"], ctx), f"👉 {remplir(p['cta'], ctx)} : {lien}"]
    if photos:
        auteurs = []
        for ph in photos:
            if ph["auteur"] not in auteurs:
                auteurs.append(ph["auteur"])
        blocs.append("📷 Photos : " + " · ".join(auteurs)
                     + " — Wikimedia Commons, licences libres (détail sur chaque image)")
    blocs.append(" ".join(p["hashtags"]))
    return "\n\n".join(blocs).strip()


# ─────────────────────────── fabrication ───────────────────────────

def main() -> int:
    serie = json.loads((ICI / "serie3.json").read_text(encoding="utf-8"))
    ch = json.loads((ICI / "chiffres3.json").read_text(encoding="utf-8"))
    pubs = serie["publications"]
    debut = date.fromisoformat(serie["debut"])
    seules = [a for a in sys.argv[1:] if not a.startswith("--")]

    for p in pubs:                       # tout ce qui manque est refusé AVANT le moindre rendu
        if not p.get("lien"):
            raise SystemExit(f"{p['cle']} : aucun lien vers le site")
        if p["cle"] not in ch["villes"]:
            raise SystemExit(f"{p['cle']} : aucun chiffre dans chiffres3.json")
        if p.get("motif") and p["motif"] not in ch["motifs"]:
            raise SystemExit(f"{p['cle']} : motif {p['motif']} inconnu de chiffres3.json")
        # 🔴 Une DÉCOUPE est une affirmation de morphologie : elle ne se publie que si la
        #    source la donne. Répétée sous son propre titre (« Sambava / Sambava »), elle
        #    passe pour un bogue ; inventée (« Moro · mbe »), c'est une donnée fabriquée.
        if p["decoupe"].strip().lower() == p["titre"].strip().lower():
            raise SystemExit(f"{p['cle']} : la découpe répète le titre — mettre un repère factuel")
        morceaux = [x.strip() for x in p["decoupe"].split("·")]
        for mot in (p.get("defs") or {}):
            if mot not in morceaux:
                raise SystemExit(f"{p['cle']} : « {mot} » est glosé mais absent de la découpe")
        for c in p["cartes"]:
            if c["k"] == "noms" and not p.get("motif"):
                raise SystemExit(f"{p['cle']} : carte « noms » sans motif")
            if c["k"] == "sens" and not p.get("sens"):
                raise SystemExit(f"{p['cle']} : carte « sens » sans sens")

    from playwright.sync_api import sync_playwright
    logo = f1.b64_logo()
    SORTIE.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        page = nav.new_page(viewport={"width": 1080, "height": 1350}, device_scale_factor=1)
        for i, p in enumerate(pubs, 1):
            if seules and p["cle"] not in seules:
                continue
            ctx = contexte(p, ch)
            # f2.* affiche f2.barre(p['lien']) : copie au lien déjà réduit
            p_img = {**p, 'lien': '/' if barre3(p['lien']) == 'diako.fonenako.mg' else p['lien']}
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

            photos = f2.photos_de(p)
            total = 1 + len(p["cartes"]) + (1 if len(photos) > 1 else 0)
            images: list[str] = []

            def suivante() -> Path:
                return dossier / ("affiche-fil.png" if not images else f"fil-{len(images) + 1}.png")

            # 1 — l'affiche
            d0 = suivante()
            if p["type"] == "photos":
                if not photos:
                    raise SystemExit(f"{p['cle']} : type photos sans photo")
                f2.rendre(page, f2.html_affiche_photo(p_img, photos[0], logo), d0)
            elif p["type"] == "mot":
                f2.rendre(page, html_affiche_mot(p, ctx, logo), d0, 400)
            else:
                raise SystemExit(f"{p['cle']} : type inconnu {p['type']}")
            images.append(d0.name)

            # 2..n — les cartes
            for c in p["cartes"]:
                d = suivante()
                rang = len(images) + 1
                if c["k"] == "sens":
                    html = html_carte_sens(p, ctx, rang, total, logo)
                elif c["k"] == "noms":
                    html = html_carte_noms(p, ch, ctx, rang, total, logo)
                elif c["k"] == "chiffres":
                    html = html_carte_chiffres(p, ch, rang, total, logo)
                elif c["k"] == "fait":
                    html = f2.html_carte(p, remplir(c["t"], ctx), rang, total, logo)
                else:
                    raise SystemExit(f"{p['cle']} : carte inconnue {c['k']}")
                f2.rendre(page, html, d, 300)
                images.append(d.name)

            # dernière — la seconde photo, quand il y en a une
            if len(photos) > 1:
                d = suivante()
                f2.rendre(page, f2.html_photo_suite(p_img, photos[1], len(images) + 1, total, logo), d, 150)
                images.append(d.name)
                photos = photos[:2]

            if not 4 <= len(images) <= 5:      # la consigne d'Andry du 18/09/2026
                raise SystemExit(f"{p['cle']} : {len(images)} images (il en faut 4 ou 5)")

            texte = brouillon(p, photos, serie["utm"], ctx)
            (dossier / "brouillon.txt").write_text(texte + "\n", encoding="utf-8")
            (dossier / "fiche.json").write_text(json.dumps({
                "cle": p["cle"], "serie": serie["serie"], "type": p["type"], "date": jour.isoformat(),
                "heure": serie["heure"], "rang": f"{i}/{len(pubs)}", "lien": p["lien"],
                "attendu": p.get("attendu"), "page": "Di'ako (108742855158464)", "images": images,
                "photos": [{k: (str(v.name) if k == "fichier" else v) for k, v in ph.items()} for ph in photos],
                "sources": p.get("sources", []),
                "chiffres": {"releve": ch["referentiel_charge_le"],
                             "base": ch["base"], "requete_ville": ch["requete_ville"],
                             "requete_motif": ch["requete_motif"] if p.get("motif") else None,
                             "ville": ch["villes"][p["cle"]],
                             "motif": ch["motifs"][p["motif"]] if p.get("motif") else None},
                "avertissement": ch["avertissement"],
            }, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{i:2}/{len(pubs)} {jour} {p['type']:6} {p['cle']:18} {len(images)} image(s) -> {dossier.name}",
                  flush=True)
        nav.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
