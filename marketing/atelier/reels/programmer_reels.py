# -*- coding: utf-8 -*-
"""programmer_reels.py — programme les reels Di'ako (reels.json) sur la page, par l'API Reels.

    python marketing/atelier/reels/programmer_reels.py --a-blanc   # le plan, rien d'envoyé
    python marketing/atelier/reels/programmer_reels.py --un        # le PREMIER seulement, relu
    python marketing/atelier/reels/programmer_reels.py             # tous ceux qui entrent dans la fenêtre
    python marketing/atelier/reels/programmer_reels.py --controler # l'état relu chez Facebook

L'envoi d'un reel se fait en trois temps imposés par Meta :
  1. POST /{page}/video_reels upload_phase=start      → video_id + upload_url
  2. POST du fichier sur rupload.facebook.com          → en-têtes offset / file_size
  3. POST /{page}/video_reels upload_phase=finish, video_state=SCHEDULED + scheduled_publish_time

Gardes :
  · le fichier se DÉCODE en entier avant l'envoi (ffmpeg -v error), 1080×1920, 5 à 90 s :
    le 18/09, deux chaînes parallèles ont envoyé 3 vidéos illisibles à Facebook ;
  · VERROU (dossier créé atomiquement) : deux copies de ce script ne tournent jamais ensemble ;
  · journal programmes-reels.json : un reel déjà programmé n'est jamais renvoyé ;
  · relecture après envoi : heure programmée, non publié, description identique, et l'état
    de traitement de la vidéo (erreur = arrêt) ; au premier écart, on s'arrête ;
  · fenêtre : 15 min à 28,9 jours (Facebook a accepté 28,84 j le 19/09, refusé 29,4 j le 18/09).
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
SORTIE = ICI / "sortie"
JOURNAL = ICI / "programmes-reels.json"
VERROU = ICI / ".verrou-programmation"
PAGE = "108742855158464"                   # Di'ako = DiakoMDG — surtout pas 104126917813219
G = "https://graph.facebook.com/v21.0"
TANA = timezone(timedelta(hours=3))
FENETRE_MAX = timedelta(days=28.9)
FENETRE_MIN = timedelta(minutes=15)


def jeton() -> str:
    return (Path.home() / ".diako-secrets" / "fb_page_token_diako.txt").read_text(encoding="utf-8").strip()


def erreur(r: requests.Response) -> str:
    try:
        e = r.json().get("error", {})
        return f"HTTP {r.status_code} code {e.get('code')}/{e.get('error_subcode')} : {e.get('message')}"
    except Exception:
        return f"HTTP {r.status_code} {r.text[:200]}"


def controle_fichier(f: Path) -> str | None:
    """None si le fichier est bon, sinon la raison du refus."""
    if not f.exists():
        return "fichier absent"
    pr = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                         "stream=width,height:format=duration", "-of", "json", str(f)], capture_output=True, text=True)
    try:
        d = json.loads(pr.stdout)
        w, h = d["streams"][0]["width"], d["streams"][0]["height"]
        dur = float(d["format"]["duration"])
    except Exception:
        return "ffprobe illisible"
    if (w, h) != (1080, 1920):
        return f"format {w}×{h}, attendu 1080×1920"
    if not 5 <= dur <= 90:
        return f"durée {dur:.1f} s hors de 5-90 s"
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-f", "null", "-"], capture_output=True, text=True)
    if dec.returncode != 0 or dec.stderr.strip():
        return "décodage en erreur : " + dec.stderr.strip()[:200]
    return None


def quand_de(r: dict, heure_defaut: str) -> datetime:
    hh, mm = (r.get("heure") or heure_defaut).split(":")
    j = datetime.fromisoformat(r["date"])
    return datetime(j.year, j.month, j.day, int(hh), int(mm), tzinfo=TANA)


def relire(tok: str, vid: str) -> dict:
    v = requests.get(f"{G}/{vid}", timeout=60, params={
        "fields": "status,scheduled_publish_time,published,description,length", "access_token": tok})
    return v.json() if v.ok else {"erreur": erreur(v)}


def envoyer(tok: str, f: Path, description: str, quand: datetime) -> dict:
    r = requests.post(f"{G}/{PAGE}/video_reels", data={"upload_phase": "start", "access_token": tok}, timeout=120)
    if not r.ok:
        return {"etat": "REFUS start", "detail": erreur(r)}
    vid = r.json()["video_id"]
    url = r.json().get("upload_url") or f"https://rupload.facebook.com/video_upload/v21.0/{vid}"
    octets = f.read_bytes()
    u = requests.post(url, data=octets, timeout=900, headers={
        "Authorization": f"OAuth {tok}", "offset": "0", "file_size": str(len(octets)),
        "Content-Type": "application/octet-stream"})
    if not u.ok or not u.json().get("success", False):
        return {"etat": "REFUS envoi du fichier", "detail": erreur(u) if not u.ok else u.text[:200], "video_id": vid}
    fin = requests.post(f"{G}/{PAGE}/video_reels", timeout=120, data={
        "upload_phase": "finish", "video_id": vid, "video_state": "SCHEDULED",
        "scheduled_publish_time": str(int(quand.timestamp())), "description": description, "access_token": tok})
    if not fin.ok:
        return {"etat": "REFUS finish", "detail": erreur(fin), "video_id": vid}
    # relecture : Facebook traite la vidéo en arrière-plan ; on attend qu'il la déclare prête
    vj = {}
    for _ in range(40):
        time.sleep(15)
        vj = relire(tok, vid)
        st = (vj.get("status") or {})
        if st.get("video_status") in ("ready", "error") or (st.get("processing_phase") or {}).get("status") == "error":
            break
    st = vj.get("status") or {}
    sched = vj.get("scheduled_publish_time")
    if isinstance(sched, str) and not sched.isdigit():
        sched = int(datetime.fromisoformat(sched.replace("+0000", "+00:00")).timestamp())
    ok = (st.get("video_status") != "error" and (vj.get("description") or "").strip() == description.strip()
          and int(sched or 0) == int(quand.timestamp()) and vj.get("published") is False)
    return {"etat": "programmé" if ok else "ENVOYÉ mais relecture NON conforme — à vérifier", "video_id": vid,
            "quand": quand.isoformat(), "relu": {"statut": st, "heure": sched, "published": vj.get("published"),
                                                 "description_identique": (vj.get("description") or "").strip() == description.strip(),
                                                 "duree": vj.get("length")}}


def main() -> int:
    a = sys.argv[1:]
    conf = json.loads((ICI / "reels.json").read_text(encoding="utf-8"))
    heure = conf.get("heure", "20:00")
    tok = jeton()
    journal = json.loads(JOURNAL.read_text(encoding="utf-8")) if JOURNAL.exists() else {}

    if "--controler" in a:
        for cle, e in journal.items():
            vj = relire(tok, e["video_id"]) if e.get("video_id") else {}
            st = (vj.get("status") or {}).get("video_status")
            print(f"  {cle:18} {e.get('quand', '')[:16]}  {e.get('etat'):10}  statut={st}  publié={vj.get('published')}  "
                  f"heure={vj.get('scheduled_publish_time')}")
        return 0

    try:
        VERROU.mkdir()
    except FileExistsError:
        raise SystemExit(f"une autre copie tourne (verrou {VERROU.name}) — rien n'est envoyé")
    try:
        maintenant = datetime.now(TANA)
        faits, reportes, refus = 0, [], []
        for r in conf["reels"]:
            cle = r["cle"]
            f = SORTIE / cle / f"{cle}-musique.mp4"
            if journal.get(cle, {}).get("etat") == "programmé":
                print(f"déjà programmé  {cle}")
                continue
            quand = quand_de(r, heure)
            if quand - maintenant > FENETRE_MAX:
                reportes.append(cle)
                continue
            if quand - maintenant < FENETRE_MIN:
                refus.append((cle, "heure passée ou trop proche"))
                continue
            pb = controle_fichier(f)
            if pb:
                refus.append((cle, pb))
                break
            description = (SORTIE / cle / "description.txt").read_text(encoding="utf-8").strip()
            if "--a-blanc" in a:
                print(f"à blanc  {cle:18} {quand:%d/%m %H:%M} (+03)  {f.stat().st_size / 1e6:.1f} Mo  {len(description)} car.")
                continue
            res = envoyer(tok, f, description, quand)
            journal[cle] = {**res, "le": maintenant.isoformat(), "fichier": f.name}
            JOURNAL.write_text(json.dumps(journal, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{res['etat']:12} {cle:18} {quand:%d/%m %H:%M}  "
                  + (res.get("detail") or f"video {res.get('video_id')}  {res.get('relu')}"), flush=True)
            if res["etat"] != "programmé":
                refus.append((cle, res.get("detail") or res["etat"]))
                break
            faits += 1
            if "--un" in a:
                break
        print(f"\n{faits} programmé(s) ; {len(reportes)} hors fenêtre (plus tard) : " + ", ".join(reportes))
        for c, why in refus:
            print("  REFUS", c, "—", why)
        return 1 if refus else 0
    finally:
        VERROU.rmdir()


if __name__ == "__main__":
    sys.exit(main())
