# -*- coding: utf-8 -*-
"""programmer.py — programme la série Di'ako sur la page par l'API Graph
(jeton de page de ~/.diako-secrets), une publication à 4-5 photos à la fois.

    python marketing/atelier/programmer.py --a-blanc           # le plan, sans rien écrire
    python marketing/atelier/programmer.py --un                # la PREMIÈRE seulement, puis relecture
    python marketing/atelier/programmer.py                     # toutes celles qui entrent dans la fenêtre
    python marketing/atelier/programmer.py --controler         # ce que Facebook a réellement en file

Les gardes, toutes exigées :
  · une publication déjà en file chez Facebook (même début de texte) n'est jamais
    reprogrammée — on relit /scheduled_posts AVANT chaque envoi, pas seulement le journal ;
  · l'heure est celle de Madagascar (UTC+3), relue telle que Facebook l'a enregistrée ;
  · fenêtre : 10 min à 28 jours. Au-delà l'API refuse (mesuré le 18/09/2026 sur la série
    Tsena : 28,4 jours acceptés, 29,4 refusés) ; ces jours-là se programment le lendemain ;
  · une publication n'est déclarée programmée qu'après RELECTURE : texte identique,
    date identique, non publiée.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
# --sortie sortie2 : la série 2 (12 h). Chaque série a SON dossier et SON journal : on ne programme
# jamais « tout ce qui est dans l'intervalle » quand deux séries partagent les mêmes jours.
_SORTIE = sys.argv[sys.argv.index("--sortie") + 1] if "--sortie" in sys.argv else "sortie"
SORTIE = ICI / _SORTIE
JOURNAL = ICI / ("programmes.json" if _SORTIE == "sortie" else f"programmes-{_SORTIE}.json")
PAGE = "108742855158464"                    # Di'ako = DiakoMDG (14 K) — surtout pas 104126917813219
G = "https://graph.facebook.com/v21.0"
TANA = timezone(timedelta(hours=3))
FENETRE_MAX = timedelta(days=28)
FENETRE_MIN = timedelta(minutes=15)


def jeton() -> str:
    return (Path.home() / ".diako-secrets" / "fb_page_token_diako.txt").read_text(encoding="utf-8").strip()


def erreur(r: requests.Response) -> str:
    try:
        e = r.json().get("error", {})
        return f"HTTP {r.status_code} code {e.get('code')}/{e.get('error_subcode')} : {e.get('message')}"
    except Exception:
        return f"HTTP {r.status_code} {r.text[:200]}"


def en_file(tok: str) -> list[dict]:
    """Ce que Facebook a VRAIMENT en file de programmation — la seule vérité."""
    out, url = [], f"{G}/{PAGE}/scheduled_posts"
    params = {"fields": "id,message,scheduled_publish_time,is_published", "limit": 100, "access_token": tok}
    while url:
        r = requests.get(url, params=params, timeout=60)
        if not r.ok:
            raise SystemExit("lecture de la file impossible : " + erreur(r))
        d = r.json()
        out += d.get("data", [])
        url, params = d.get("paging", {}).get("next"), None
    return out


def heure_de(dossier: Path) -> datetime:
    f = json.loads((dossier / "fiche.json").read_text(encoding="utf-8"))
    hh, mm = f.get("heure", "18:00").split(":")
    j = datetime.fromisoformat(f["date"])
    return datetime(j.year, j.month, j.day, int(hh), int(mm), tzinfo=TANA)


def images_de(d: Path) -> list[Path]:
    return [d / "affiche-fil.png"] + sorted(d.glob("fil-[2-5].png"))


def lire_journal() -> dict:
    return json.loads(JOURNAL.read_text(encoding="utf-8")) if JOURNAL.exists() else {}


def ecrire_journal(j: dict) -> None:
    JOURNAL.write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")


def programmer_une(tok: str, d: Path, quand: datetime) -> dict:
    texte = (d / "brouillon.txt").read_text(encoding="utf-8").strip()
    ids = []
    for im in images_de(d):
        with open(im, "rb") as fh:
            r = requests.post(f"{G}/{PAGE}/photos", timeout=300,
                              data={"published": "false", "temporary": "true", "access_token": tok},
                              files={"source": (im.name, fh, "image/png")})
        if not r.ok:
            return {"etat": "REFUS photo " + im.name, "detail": erreur(r)}
        ids.append(r.json()["id"])
    data = {"message": texte, "published": "false", "scheduled_publish_time": str(int(quand.timestamp())),
            "access_token": tok}
    for i, pid in enumerate(ids):
        data[f"attached_media[{i}]"] = json.dumps({"media_fbid": pid})
    r = requests.post(f"{G}/{PAGE}/feed", data=data, timeout=120)
    if not r.ok:
        return {"etat": "REFUS publication", "detail": erreur(r), "photos": ids}
    post_id = r.json()["id"]
    # RELECTURE : texte, heure, non publiée
    v = requests.get(f"{G}/{post_id}", timeout=60, params={
        "fields": "message,scheduled_publish_time,is_published,attachments{subattachments{type}}",
        "access_token": tok})
    vj = v.json() if v.ok else {}
    sched = vj.get("scheduled_publish_time")
    if isinstance(sched, str) and not sched.isdigit():            # parfois rendue en date ISO
        sched = int(datetime.fromisoformat(sched.replace("+0000", "+00:00")).timestamp())
    # ⚠ Les photos se COMPTENT sur la publication relue, pas sur ce qu'on a envoyé : un
    #   attached_media mal formé donne une publication texte seul, acceptée sans erreur.
    album = ((vj.get("attachments") or {}).get("data") or [{}])[0]
    n_relu = len(((album.get("subattachments") or {}).get("data")) or [])
    ok = (vj.get("message", "").strip() == texte and int(sched or 0) == int(quand.timestamp())
          and vj.get("is_published") is False and n_relu == len(ids))
    return {"etat": "programmée" if ok else "ENVOYÉE mais relecture NON conforme — à vérifier",
            "post_id": post_id, "photos": n_relu, "quand": quand.isoformat(),
            "relu": {"texte_identique": vj.get("message", "").strip() == texte,
                     "heure": sched, "is_published": vj.get("is_published"),
                     "photos_envoyees": len(ids), "photos_relues": n_relu}}


def main() -> int:
    a = sys.argv[1:]
    tok = jeton()
    maintenant = datetime.now(TANA)
    dossiers = sorted(d for d in SORTIE.iterdir() if d.is_dir() and (d / "brouillon.txt").exists())
    file_fb = en_file(tok)
    debuts = {p.get("message", "")[:80] for p in file_fb}
    print(f"en file chez Facebook avant envoi : {len(file_fb)} publication(s)")

    if "--controler" in a:
        for p in sorted(file_fb, key=lambda x: str(x.get("scheduled_publish_time"))):
            print(" ", p.get("scheduled_publish_time"), "|", p.get("message", "")[:60].replace("\n", " "))
        return 0

    # --fenetre-jours N : élargir la borne prudente de 28 jours. La vraie limite de
    # Facebook est entre 28,4 j (accepté) et 29,4 j (refusé) — mesuré sur la série Tsena.
    # Un refus ne crée rien : on peut essayer au bord.
    global FENETRE_MAX
    if "--fenetre-jours" in a:
        FENETRE_MAX = timedelta(days=float(a[a.index("--fenetre-jours") + 1]))
    journal = lire_journal()
    faits, reportes, refuses = 0, [], []
    for d in dossiers:
        quand = heure_de(d)
        texte = (d / "brouillon.txt").read_text(encoding="utf-8").strip()
        if texte[:80] in debuts:
            print(f"déjà en file  {d.name}")
            continue
        if quand - maintenant > FENETRE_MAX:
            reportes.append(d.name)
            continue
        if quand - maintenant < FENETRE_MIN:
            refuses.append((d.name, "heure déjà passée ou trop proche"))
            continue
        n = len(images_de(d))
        if "--a-blanc" in a:
            print(f"à blanc       {d.name}  {quand:%d/%m %H:%M} (+03)  {n} images  {len(texte)} car.")
            continue
        r = programmer_une(tok, d, quand)
        journal[d.name] = {**r, "le": maintenant.isoformat()}
        ecrire_journal(journal)
        print(f"{r['etat']:12}  {d.name}  {quand:%d/%m %H:%M}  " + (r.get("detail") or f"{r.get('photos')} photos, {r.get('post_id')}"),
              flush=True)
        if r["etat"] == "programmée":
            faits += 1
            debuts.add(texte[:80])
        else:
            refuses.append((d.name, r.get("detail") or r["etat"]))
            break      # refus d'API OU relecture non conforme : on s'arrête, sinon l'erreur se répète 27 fois
        if "--un" in a:
            break
        time.sleep(2)
    print(f"\n{faits} programmée(s) ce passage ; {len(reportes)} hors fenêtre (à programmer plus tard) : "
          + ", ".join(reportes))
    for n, why in refuses:
        print("  REFUS", n, "—", why)
    return 1 if refuses else 0


if __name__ == "__main__":
    sys.exit(main())
