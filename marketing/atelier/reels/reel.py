# -*- coding: utf-8 -*-
"""reel.py — reels verticaux (1080×1920, 30 i/s) de la page Di'ako, en français, sur les
lieux emblématiques : des photos Commons HD mises en mouvement, un texte court par plan,
une musique libre, et en option une voix française (Vivienne −8 %, réglage validé par Andry).

    python marketing/atelier/reels/reel.py r-baobabs            # les deux versions
    python marketing/atelier/reels/reel.py r-baobabs --musique  # musique seule
    python marketing/atelier/reels/reel.py r-baobabs --voix     # voix + musique

Le scénario vit dans reels.json. Chaque plan = une photo (rang dans choix/<clé>.json) +
un mouvement + une ligne de texte. Sortie : reels/sortie/<clé>/<clé>-musique.mp4,
<clé>-voix.mp4, description.txt (texte à coller, crédits compris) et fiche.json.

Ce qui fait un reel « des grandes pages », et que ce script impose :
  · une ACCROCHE lisible dans les 2 premières secondes, en grand ;
  · un plan toutes les ~2,5 s, en mouvement continu (panoramique ou zoom lent), jamais figé ;
  · le texte dans la ZONE SÛRE : ni sous l'en-tête « Reels » (haut), ni sous la légende et le
    nom de la page (bas, ~420 px), ni sous la colonne de boutons (droite) ;
  · une carte de fin qui dit où aller : diako.fonenako.mg ;
  · le son ramené à −14 LUFS, crête −1,5 dB.

⚠ HD : les photos sont retéléchargées en grand (3 840 px) depuis Commons ; la version
  1 600 px des publications, agrandie à 1 920 px de haut, serait floue.
⚠ Crédit : sur l'image (petite ligne en haut) ET dans la description — CC BY-SA l'exige.
⚠ Tout est ffmpeg + Playwright (texte) : aucun module vidéo Python en mémoire.
"""
from __future__ import annotations

import asyncio
import base64
import json
import math
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
ATELIER = ICI.parent
DEPOT = ATELIER.parents[1]
HD = ICI / "hd"
SORTIE = ICI / "sortie"
TRAVAIL = ICI / "travail"
LOGO = DEPOT / "public" / "media" / "diako-marque-512.png"
MUSIQUES = Path("C:/Users/ANDRIANIRINA/Desktop/Fonenako preprod/29031/Fonenako FinAL GITHUB/marketing/atelier/musique")
UA = {"User-Agent": "DiakoAtelier/1.0 (https://diako.fonenako.mg; contact.fonenako@gmail.com)"}
W, H, FPS = 1080, 1920, 30
TRANS = 0.4                     # durée d'un fondu entre deux plans
VOIX = "fr-FR-VivienneMultilingualNeural"
VITESSE = "-8%"                 # validé à l'oreille par Andry le 01/09/2026 (tutos Fonenako)
PAPIER, ENCRE, TEAL, TEAL_FORT = "#FBF7F1", "#10262B", "#0E7C86", "#0A5F67"


def run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit("ffmpeg a échoué :\n" + " ".join(cmd[:12]) + " …\n" + r.stderr[-1500:])


def duree(f: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


# ───────────────────────── photos HD ─────────────────────────

def photo_hd(cle: str, rang: int) -> tuple[Path, dict]:
    """La photo n°rang de choix/<clé>.json, en grand (3 840 px de large au plus), et son crédit."""
    tous = json.loads((ATELIER / "choix" / f"{cle}.json").read_text(encoding="utf-8"))
    if str(rang) in tous:
        choix = tous[str(rang)]
    else:
        # série 1 : la photo n°1 vient parfois de la base Diako (candidats.json), toujours de
        # Commons ; son titre se relit dans l'URL de la source. Pas de source Commons = refus.
        cand = {c["cle"]: c for c in json.loads((ATELIER / "candidats.json").read_text(encoding="utf-8"))}
        p = (cand.get(cle) or {}).get("photo") or {}
        src = p.get("source") or ""
        if "commons.wikimedia.org/wiki/File:" not in src:
            raise SystemExit(f"{cle} #{rang} : photo sans source Commons — refusée")
        titre = "File:" + urllib.parse.unquote(src.split("File:", 1)[1]).replace("_", " ")
        choix = {"titre": titre, "credit": p["credit"], "licence": p["licence"], "source": src}
    dest = HD / f"{cle}-{rang}.jpg"
    if not dest.exists():
        HD.mkdir(exist_ok=True)
        q = urllib.parse.urlencode({"action": "query", "titles": choix["titre"], "prop": "imageinfo",
                                    "iiprop": "url", "iiurlwidth": 3840, "format": "json", "formatversion": "2"})
        ii = json.load(urllib.request.urlopen(urllib.request.Request(
            "https://commons.wikimedia.org/w/api.php?" + q, headers=UA), timeout=60))["query"]["pages"][0]["imageinfo"][0]
        url = ii.get("thumburl") or ii["url"]
        for essai in range(4):
            try:
                dest.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read())
                break
            except OSError:
                if essai == 3:
                    raise
    auteur = re.sub(r"^User:", "", choix["credit"]).strip()
    if re.search(r"(?i)unknown author", auteur):
        auteur = "auteur inconnu"
    return dest, {"auteur": auteur, "licence": choix["licence"], "source": choix["source"], "titre": choix["titre"]}


def taille(img: Path) -> tuple[int, int]:
    from PIL import Image
    with Image.open(img) as im:
        return im.size


# ───────────────────────── calques de texte (Playwright) ─────────────────────────

CSS = f"""
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:{W}px;height:{H}px;background:transparent;font-family:"Segoe UI","Segoe UI Emoji",system-ui,sans-serif;overflow:hidden}}
.marque{{position:absolute;left:64px;top:150px;display:flex;align-items:center;gap:12px;color:#fff;font-weight:800;font-size:34px;
  text-shadow:0 2px 12px rgba(0,0,0,.55)}}
.marque img{{width:54px;height:54px;filter:invert(1) drop-shadow(0 2px 6px rgba(0,0,0,.5))}}
.credit{{position:absolute;left:66px;top:214px;right:180px;color:rgba(255,255,255,.88);font-size:21px;text-shadow:0 1px 6px rgba(0,0,0,.8)}}
.ombre-bas{{position:absolute;left:0;right:0;bottom:0;height:1000px;background:linear-gradient(to top,rgba(0,0,0,.62) 0%,rgba(0,0,0,.35) 45%,rgba(0,0,0,0) 100%)}}
.ombre-haut{{position:absolute;left:0;right:0;top:0;height:330px;background:linear-gradient(to bottom,rgba(0,0,0,.45),rgba(0,0,0,0))}}
.ligne{{position:absolute;left:66px;width:840px;bottom:470px;color:#fff;font-weight:800;font-size:64px;line-height:1.12;
  text-shadow:0 3px 16px rgba(0,0,0,.6)}}
.ligne small{{display:block;font-size:34px;font-weight:600;margin-top:14px;color:#D8F1F3}}
.accroche{{position:absolute;left:66px;width:880px;top:560px;color:#fff;font-weight:900;font-size:96px;line-height:1.04;
  text-shadow:0 4px 24px rgba(0,0,0,.65)}}
.lieu{{display:inline-block;margin-top:26px;background:{TEAL};color:#fff;border-radius:999px;padding:12px 30px;font-size:40px;font-weight:800}}
.fin{{position:absolute;inset:0;background:linear-gradient(165deg,{TEAL} 0%,{TEAL_FORT} 55%,{ENCRE} 100%);color:#fff;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 90px}}
.fin img{{width:170px;height:170px;filter:invert(1)}}
.fin h1{{font-size:92px;font-weight:900;margin-top:26px;letter-spacing:.5px}}
.fin p{{font-size:46px;font-weight:700;margin-top:34px;line-height:1.2}}
.fin .url{{margin-top:40px;background:#fff;color:{TEAL_FORT};border-radius:999px;padding:18px 44px;font-size:48px;font-weight:900}}
.fin .suivre{{margin-top:44px;font-size:36px;opacity:.92}}
"""


def logo_b64() -> str:
    return "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode()


def calque_plan(texte: str, sous: str, credit: str, accroche: str | None, lieu: str | None) -> str:
    haut = f'<div class="ombre-haut"></div><div class="marque"><img src="{logo_b64()}">Di\'ako</div><div class="credit">{credit}</div>'
    if accroche:
        corps = f'<div class="accroche">{accroche}<br><span class="lieu">📍 {lieu}</span></div>'
    else:
        corps = f'<div class="ombre-bas"></div><div class="ligne">{texte}' + (f"<small>{sous}</small>" if sous else "") + "</div>"
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{haut}{corps}</body></html>'


def calque_fin(lieu: str, invite: str, chemin: str) -> str:
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="fin">'
            f'<img src="{logo_b64()}"><h1>Di\'ako</h1><p>{invite}</p><div class="url">diako.fonenako.mg</div>'
            f'<div class="suivre">Suivez Di\'ako pour le prochain lieu ➜</div></div></body></html>')


def rendre_calques(pages: list[tuple[str, Path, bool]]) -> None:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        page = nav.new_page(viewport={"width": W, "height": H})
        for html, dest, transparent in pages:
            page.set_content(html, wait_until="load")
            page.wait_for_timeout(150)
            page.screenshot(path=str(dest), omit_background=transparent)
        nav.close()


# ───────────────────────── plans vidéo ─────────────────────────

def filtre_mouvement(img: Path, d: float, mouv: str) -> str:
    """Panoramique (paysage) ou zoom lent (portrait), avec une douceur en cosinus."""
    w0, h0 = taille(img)
    doux = f"(1-cos(PI*t/{d:.3f}))/2"                    # 0 → 1 sans à-coup
    if mouv.startswith("pano") and w0 / h0 > 0.75:
        # hauteur 2 016 (5 % de marge) : le plan dérive un peu verticalement aussi
        hs = 2016
        ws = int(round(w0 * hs / h0 / 2)) * 2
        if ws >= W + 240:
            a, b = (0.15, 0.85) if mouv != "pano-g" else (0.85, 0.15)
            x = f"(iw-{W})*({a}+({b}-{a})*{doux})"
            return (f"scale={ws}:{hs}:flags=lanczos,crop={W}:{H}:x='{x}':y='(ih-{H})*(0.3+0.4*{doux})',"
                    f"format=yuv420p")
    # zoom lent : d'abord couvrir 1080×1920, puis grandir de 12 % au fil du plan
    s = max(W / w0, H / h0)
    wc, hc = int(math.ceil(w0 * s / 2)) * 2, int(math.ceil(h0 * s / 2)) * 2
    z = f"(1+0.12*{doux})" if mouv != "zoom-out" else f"(1.12-0.12*{doux})"
    return (f"scale={wc}:{hc}:flags=lanczos,scale=w='trunc({wc}*{z}/2)*2':h='trunc({hc}*{z}/2)*2':eval=frame:flags=bicubic,"
            f"crop={W}:{H}:(iw-{W})/2:(ih-{H})/2,format=yuv420p")


def plan(img: Path, calque: Path, d: float, mouv: str, dest: Path) -> None:
    fo = max(0.0, d - 0.45)
    fc = (f"[0:v]{filtre_mouvement(img, d, mouv)},fps={FPS}[bg];"
          f"[1:v]format=rgba,fade=t=in:st=0.12:d=0.35:alpha=1,fade=t=out:st={fo:.2f}:d=0.3:alpha=1[tx];"
          f"[bg][tx]overlay=0:0:format=auto,format=yuv420p[v]")
    run(["ffmpeg", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", str(img),
         "-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", str(calque),
         "-filter_complex", fc, "-map", "[v]", "-t", f"{d:.3f}", "-r", str(FPS),
         "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p", str(dest)])


def plan_fin(carte: Path, d: float, dest: Path) -> None:
    doux = f"(1-cos(PI*t/{d:.3f}))/2"
    run(["ffmpeg", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", str(carte),
         "-vf", f"scale=w='trunc({W}*(1+0.04*{doux})/2)*2':h='trunc({H}*(1+0.04*{doux})/2)*2':eval=frame,"
                f"crop={W}:{H}:(iw-{W})/2:(ih-{H})/2,format=yuv420p,fps={FPS}",
         "-t", f"{d:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p", str(dest)])


def enchainer(plans: list[Path], durees: list[float], transitions: list[str], dest: Path) -> float:
    """Fondus xfade entre plans ; rend la durée totale."""
    entrees, fc, cum = [], [], durees[0]
    for p in plans:
        entrees += ["-i", str(p)]
    prec = "[0:v]"
    for k in range(1, len(plans)):
        off = cum - TRANS
        sortie = f"[x{k}]" if k < len(plans) - 1 else "[v]"
        fc.append(f"{prec}[{k}:v]xfade=transition={transitions[(k - 1) % len(transitions)]}:duration={TRANS}:offset={off:.3f}{sortie}")
        prec = sortie
        cum = off + durees[k]
    run(["ffmpeg", "-y", *entrees, "-filter_complex", ";".join(fc), "-map", "[v]",
         "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(FPS), str(dest)])
    return cum


# ───────────────────────── son ─────────────────────────

async def _dire(texte: str, dest: Path) -> None:
    import edge_tts
    await edge_tts.Communicate(texte, VOIX, rate=VITESSE).save(str(dest))


def voix_phrases(phrases: list[str], dossier: Path) -> list[Path]:
    out = []
    for i, ph in enumerate(phrases):
        f = dossier / f"voix-{i:02d}.mp3"
        if not f.exists():
            asyncio.run(_dire(ph, f))
        out.append(f)
    return out


def sonoriser(video: Path, total: float, musique: Path, debut_musique: float, voix: Path | None,
              whoosh: list[float], dest: Path) -> None:
    entrees = ["-i", str(video), "-ss", f"{debut_musique:.2f}", "-i", str(musique)]
    fc = [f"[1:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st={total - 1.6:.3f}:d=1.6,"
          f"volume={'0.22' if voix else '0.9'}[mus]"]
    mix = ["[mus]"]
    k = 2
    if voix:
        entrees += ["-i", str(voix)]
        fc.append(f"[{k}:a]aresample=48000,volume=1.0,apad=whole_dur={total:.3f}[vx]")
        fc.append("[vx]asplit=2[vx1][vx2]")
        fc[0] = fc[0].replace("[mus]", "[mus0]")
        fc.append("[mus0][vx2]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[mus]")
        mix.append("[vx1]")
        k += 1
    wh = MUSIQUES / "sfx" / "whoosh-doux.mp3"
    for i, t in enumerate(whoosh):
        entrees += ["-i", str(wh)]
        fc.append(f"[{k}:a]volume=0.28,adelay={int(t * 1000)}|{int(t * 1000)}[w{i}]")
        mix.append(f"[w{i}]")
        k += 1
    fc.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:duration=first,"
              f"loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]")
    run(["ffmpeg", "-y", *entrees, "-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[a]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart", str(dest)])


def sonie(f: Path) -> float:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(f), "-af", "ebur128", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)[-1])


def ajuster_sonie(f: Path, cible: float = -14.0) -> float:
    """Seconde passe : loudnorm en une passe dépasse parfois d'1,5 dB (mesuré : −12,6 au lieu
    de −14 sur la musique seule). On MESURE, puis on corrige le gain, sous un limiteur à −1,5 dB."""
    i = sonie(f)
    if abs(i - cible) <= 0.4:
        return i
    tmp = f.with_suffix(".tmp.mp4")
    run(["ffmpeg", "-y", "-i", str(f), "-map", "0:v", "-map", "0:a", "-c:v", "copy",
         "-af", f"volume={cible - i:.2f}dB,alimiter=limit=0.84:level=false", "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart", str(tmp)])
    tmp.replace(f)
    return sonie(f)


# ───────────────────────── fabrication ─────────────────────────

def fabriquer(r: dict, avec_voix: bool) -> Path:
    cle = r["cle"]
    trav = TRAVAIL / cle
    trav.mkdir(parents=True, exist_ok=True)
    out = SORTIE / cle
    out.mkdir(parents=True, exist_ok=True)
    plans_def = r["plans"]

    # 1. durées : fixes (musique seule) ou calées sur la voix, phrase par phrase
    fichiers_voix, durees = [], []
    if avec_voix:
        fichiers_voix = voix_phrases([p["voix"] for p in plans_def] + [r["fin"]["voix"]], trav)
        for p, f in zip(plans_def, fichiers_voix):
            durees.append(max(2.2, duree(f) + 0.55) + TRANS)
        d_fin = max(3.0, duree(fichiers_voix[-1]) + 0.9)
    else:
        durees = [p.get("duree", 2.6) + TRANS for p in plans_def]
        d_fin = 3.2

    # 2. calques de texte + photos HD
    credits, pages, imgs = [], [], []
    for i, p in enumerate(plans_def):
        img, cr = photo_hd(r["photos"], p["photo"])
        imgs.append(img)
        credits.append(cr)
        credit = f"Photo : {cr['auteur']} · {cr['licence']} · Wikimedia Commons"
        acc = r["accroche"] if i == 0 else None
        pages.append((calque_plan(p.get("texte", ""), p.get("sous", ""), credit, acc, r["lieu"] if acc else None),
                      trav / f"calque-{i:02d}.png", True))
    pages.append((calque_fin(r["lieu"], r["fin"]["texte"], r["lien"]), trav / "fin.png", False))
    rendre_calques(pages)

    # 3. plans, puis enchaînement
    fichiers = []
    for i, (p, img) in enumerate(zip(plans_def, imgs)):
        f = trav / f"plan-{i:02d}.mp4"
        plan(img, trav / f"calque-{i:02d}.png", durees[i], p.get("mouv", "pano"), f)
        fichiers.append(f)
        print(f"  plan {i + 1}/{len(plans_def)}  {durees[i]:.2f} s  {p.get('mouv', 'pano')}", flush=True)
    ffin = trav / "plan-fin.mp4"
    plan_fin(trav / "fin.png", d_fin, ffin)
    fichiers.append(ffin)
    durees.append(d_fin)
    muet = trav / "muet.mp4"
    total = enchainer(fichiers, durees, r.get("transitions", ["fade", "smoothleft", "zoomin", "smoothup"]), muet)

    # 4. son
    whoosh, cum = [], durees[0]
    for k in range(1, len(durees)):
        whoosh.append(max(0.0, cum - TRANS - 0.15))
        cum = cum - TRANS + durees[k]
    voix_piste = None
    if avec_voix:
        # chaque phrase démarre au début de SON plan (après le fondu), silence entre les deux
        voix_piste = trav / "voix.wav"
        entrees, fc, debut = [], [], 0.0
        for i, f in enumerate(fichiers_voix):
            entrees += ["-i", str(f)]
            fc.append(f"[{i}:a]aresample=48000,adelay={int((debut + 0.35) * 1000)}|{int((debut + 0.35) * 1000)}[p{i}]")
            debut = debut + durees[i] - TRANS
        fc.append(f"{''.join(f'[p{i}]' for i in range(len(fichiers_voix)))}amix=inputs={len(fichiers_voix)}:normalize=0[a]")
        run(["ffmpeg", "-y", *entrees, "-filter_complex", ";".join(fc), "-map", "[a]", "-t", f"{total:.3f}", str(voix_piste)])
    musique = MUSIQUES / r["musique"]
    dest = out / f"{cle}-{'voix' if avec_voix else 'musique'}.mp4"
    sonoriser(muet, total, musique, r.get("musique_debut", 0), voix_piste, whoosh, dest)
    print(f"  sonie {ajuster_sonie(dest):.1f} LUFS")

    # 5. description + fiche
    auteurs = []
    for c in credits:
        if c["auteur"] not in auteurs:
            auteurs.append(c["auteur"])
    index = json.loads((MUSIQUES / "index.json").read_text(encoding="utf-8"))
    morceau = next(m for m in (index.get("morceaux") or [v for v in index.values() if isinstance(v, list)][0])
                   if m["fichier"] == r["musique"])
    lien = f"https://diako.fonenako.mg{r['lien']}?utm_source=facebook&utm_medium=reel&utm_campaign=reels-lieux&utm_content={cle}"
    desc = "\n\n".join([r["description"], f"👉 {r['cta']} : {lien}",
                        "📷 Photos : " + " · ".join(auteurs) + " — Wikimedia Commons, licences libres (détail sur chaque image)",
                        # CC BY (Incompetech) : la formule EXACTE de l'auteur ; Mixkit : titre et auteur
                        "🎵 Musique : " + (morceau["attribution_texte"] if morceau.get("attribution_requise")
                                           else f"{morceau['titre']} — {morceau['auteur']} ({morceau['licence']})"),
                        " ".join(r["hashtags"])])
    (out / "description.txt").write_text(desc + "\n", encoding="utf-8")
    (out / "fiche.json").write_text(json.dumps({
        "cle": cle, "lieu": r["lieu"], "date": r.get("date"), "heure": r.get("heure", "20:00"),
        "fichier": dest.name, "duree_s": round(total, 2), "lien": r["lien"], "photos": credits,
        "musique": morceau, "voix": f"{VOIX} {VITESSE}" if avec_voix else None, "sources": r.get("sources", []),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{dest.name}  {total:.1f} s")
    return dest


def main() -> int:
    a = sys.argv[1:]
    reels = {r["cle"]: r for r in json.loads((ICI / "reels.json").read_text(encoding="utf-8"))["reels"]}
    cles = [x for x in a if not x.startswith("--")] or list(reels)
    variantes = [v for v, drap in ((False, "--musique"), (True, "--voix")) if drap in a] or [False, True]
    for cle in cles:
        for v in variantes:
            print(f"{cle} ({'voix' if v else 'musique seule'})", flush=True)
            fabriquer(reels[cle], v)
    return 0


if __name__ == "__main__":
    sys.exit(main())
