# -*- coding: utf-8 -*-
"""verifier.py — contrôle la série Di'ako AVANT toute programmation.

    python marketing/atelier/verifier.py

Refuse (REFUS) ce qui ne doit jamais partir, signale (ALERTE) ce qui mérite un œil.
Code de sortie 0 seulement si aucune publication n'est refusée.

Ce qu'il contrôle, et pourquoi :
  · images : l'affiche + les photos, toutes en 1080×1350 — c'est ce que la garde
    « affiche » d'onglets.py attend ; 4 à 5 images (consigne d'Andry du 18/09/2026) ;
  · crédit : chaque photo a un auteur ET une licence (CC BY / BY-SA l'exigent) ;
  · une photo, une publication : aucune source Commons ne sert deux fois ;
  · le lien vers diako.fonenako.mg, avec son utm_content propre à la publication ;
  · aucun numéro de téléphone ni adresse mail dans le texte ;
  · la question fermée malgache porte la particule « ve » ;
  · deux publications ne commencent jamais pareil : onglets.py reconnaît un onglet
    au plus long début commun (incident Fonenako du 18/09/2026) ;
  · une publication par jour, sans trou ni doublon de date.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ICI = Path(__file__).resolve().parent
SORTIE = ICI / (sys.argv[sys.argv.index("--sortie") + 1] if "--sortie" in sys.argv else "sortie")
# les autres séries de la page : une photo déjà publiée par l'une ne repart pas dans l'autre
AUTRES_SERIES = [d for d in (ICI / "sortie", ICI / "sortie2") if d != SORTIE and d.exists()]
ICONES = {"📍", "🧭", "📖", "📅", "🎭", "🍲", "🎶", "📜", "🙏"}

TEL = re.compile(r"(?<!\d)(?:\+?261[\s.]?|0)3[2-9](?:[\s.]?\d){7}(?!\d)")
MAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
HORS_ALPHABET = re.compile(r"[cquwxç]", re.I)
# noms propres et mots étrangers admis dans les lignes malgaches
NOMS = {"mer", "d'émeraude", "boby", "pangalanes", "foulpointe", "lily", "masoala", "tsingy",
        "ankarana", "anosy", "andraikiba", "marojejy", "anjajavy", "katsepy", "mahajanga", "anakao",
        "ilafy", "ampefy", "lokobe", "tritriva", "andafiavaratra", "zafimaniry", "ravelobe", "nosy", "hara"}


def cle_photo(source: str) -> str:
    """Le NOM DU FICHIER Commons, normalisé : c'est lui qui identifie une photo.

    ⚠ La même photo arrive sous deux écritures : la base Diako garde
      `…/wiki/File:Ambohimanga_14.jpg`, commons.py écrit `…/wiki/File%3AAmbohimanga_14.jpg`.
      Comparées telles quelles, elles passent pour deux photos différentes, et le contrôle
      « une photo, une publication » laissait passer un doublon sans rien dire."""
    s = urllib.parse.unquote(source).replace(" ", "_")
    s = s.split("File:", 1)[-1] if "File:" in s else s.rsplit("/", 1)[-1]
    return s.lower()


def verifier() -> int:
    dossiers = sorted(d for d in SORTIE.iterdir() if d.is_dir() and re.match(r"\d{4}-\d{2}-\d{2}-", d.name))
    if not dossiers:
        print(f"aucune publication dans {SORTIE.name}/")
        return 1
    textes, sources_vues, refus, alertes = {}, {}, 0, 0
    for autre in AUTRES_SERIES:
        for fj in autre.glob("*/fiche.json"):
            for ph in json.loads(fj.read_text(encoding="utf-8")).get("photos", []):
                sources_vues[cle_photo(ph.get("source") or "")] = f"{autre.name}/{fj.parent.name[11:]}"
    jours = [date.fromisoformat(d.name[:10]) for d in dossiers]

    for d in dossiers:
        cle = d.name[11:]
        r, a = [], []
        # ── images ──
        images = [d / "affiche-fil.png"] + sorted(d.glob("fil-*.png"))
        images = [i for i in images if i.exists()]
        if not (d / "affiche-fil.png").exists():
            r.append("affiche absente")
        for i in images:
            if Image.open(i).size != (1080, 1350):
                r.append(f"{i.name} n'est pas en 1080×1350")
        if len(images) < 4:
            a.append(f"{len(images)} image(s) seulement (visé : 4 à 5)")
        if len(images) > 5:
            r.append(f"{len(images)} images (maximum 5)")
        # ── crédits et unicité des photos ──
        fiche = json.loads((d / "fiche.json").read_text(encoding="utf-8")) if (d / "fiche.json").exists() else {}
        for ph in fiche.get("photos", []):
            if not (ph.get("auteur") or "").strip() or not (ph.get("licence") or "").strip():
                r.append(f"photo #{ph.get('rang')} sans auteur ou sans licence")
            src = cle_photo(ph.get("source") or "")
            if src in sources_vues and sources_vues[src] != cle:
                r.append(f"photo #{ph.get('rang')} déjà utilisée par {sources_vues[src]}")
            elif src in sources_vues:
                r.append(f"photo #{ph.get('rang')} utilisée deux fois dans la même publication")
            sources_vues[src] = cle
        # ── texte ──
        f = d / "brouillon.txt"
        if not f.exists():
            r.append("brouillon.txt absent")
            texte = ""
        else:
            texte = f.read_text(encoding="utf-8").strip()
            textes[cle] = texte
            if texte.split(" ", 1)[0] not in ICONES:
                r.append("le texte ne commence pas par l'icône de sa rubrique suivie du titre")
            if f"https://diako.fonenako.mg/" not in texte:
                r.append("aucun lien vers diako.fonenako.mg")
            if f"utm_content={cle}" not in texte:
                r.append(f"le lien ne porte pas utm_content={cle}")
            if TEL.search(texte):
                r.append(f"numéro de téléphone : {TEL.search(texte).group(0)}")
            if MAIL.search(texte):
                r.append(f"adresse mail : {MAIL.search(texte).group(0)}")
            derniere = texte.splitlines()[-1].split()
            if not derniere or derniere[0] != "#Diako" or len(derniere) != 5 or not all(h.startswith("#") for h in derniere):
                r.append("la dernière ligne doit porter 5 hashtags, #Diako en tête")
            question = next((l for l in texte.splitlines() if "🙋" in l), "")
            if question.startswith("Efa ") and " ve " not in question:
                r.append("question fermée malgache sans la particule « ve »")
            mg_lignes = [texte.splitlines()[0].split(" — ", 1)[-1]]
            if SORTIE.name == "sortie":        # série 1 : la question est en malgache ; série 2 : en français
                mg_lignes.append(question)
            etrangers = sorted({w for l in mg_lignes for w in re.findall(r"[\w'’]+", l.lower())
                                if HORS_ALPHABET.search(w) and w.strip("'’") not in NOMS and not w.isdigit()})
            if etrangers:
                a.append(f"mots hors alphabet malgache dans le malgache : {', '.join(etrangers)}")
            if len(texte) > 2000:
                a.append(f"texte long : {len(texte)} caractères")
        etat = "REFUS" if r else ("ALERTE" if a else "OK")
        refus += bool(r)
        alertes += bool(a) and not r
        print(f"{etat:7} {d.name:40} {len(images)} img  " + " | ".join(r + a))

    # ── entre publications ──
    print()
    cles = list(textes)
    for i, x in enumerate(cles):
        for y in cles[i + 1:]:
            n = len(os.path.commonprefix([textes[x], textes[y]]))
            if n >= 60:
                print(f"REFUS   {x} et {y} commencent pareil sur {n} caractères — onglets.py les confondrait")
                refus += 1
    trous = [jours[0] + timedelta(days=k) for k in range((jours[-1] - jours[0]).days + 1)]
    manquants = [j for j in trous if j not in jours]
    doublons = sorted({j for j in jours if jours.count(j) > 1})
    if manquants:
        print("ALERTE  jours sans publication :", ", ".join(map(str, manquants)))
    if doublons:
        print("REFUS   deux publications le même jour :", ", ".join(map(str, doublons)))
        refus += 1
    print(f"\n{len(dossiers)} publications, du {jours[0]} au {jours[-1]} — "
          f"{refus} refusée(s), {alertes} en alerte")
    return 1 if refus else 0


if __name__ == "__main__":
    sys.exit(verifier())
