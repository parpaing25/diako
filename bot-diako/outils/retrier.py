# -*- coding: utf-8 -*-
"""Repasse au modèle les trouvailles qu'il n'a jamais vues.

🔴 POURQUOI CET OUTIL EXISTE. Le 06/09/2026 la passerelle LiteLLM est tombée
   entre 14 h 59 et 15 h 05. Le bot a continué de collecter — et comme la
   relecture par le modèle était « optionnelle », tout est parti dans « à
   trier » comme si ç'avait été trié. S'y sont retrouvés une promotion CANAL+,
   une piscine hors-sol, un cric de voiture, un ordinateur portable, un club de
   karaté français et une liste de certificats humanitaires.

   Or le modèle sait parfaitement les écarter : interrogé sur ces mêmes textes,
   il répond `genre = "rien"` avec **97 à 98 % de confiance, en six secondes**.
   Ce n'est donc pas un problème de jugement, c'est un problème de tuyau.

⚠ CE QUE CET OUTIL NE TOUCHE JAMAIS :
    · les trouvailles **publiées** — elles sont en ligne, le tri est derrière ;
    · celles que vous avez **rejetées** à la main — votre verdict fait foi ;
    · le genre d'une trouvaille **validée** : on ne défait pas votre décision,
      on signale seulement si le modèle la juge hors sujet.

Usage (PowerShell) :
    python outils\\retrier.py                      # à blanc, 40 trouvailles
    python outils\\retrier.py --limite 300         # à blanc, plus large
    python outils\\retrier.py --limite 300 --ecrire   # applique
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import analyse_llm, base  # noqa: E402
from bot.config import charger  # noqa: E402

# On ne retrie que ce qui attend encore une décision.
STATUTS = ("a_trier", "incomplete", "validee")


def a_retrier(limite: int) -> list[dict]:
    """Les trouvailles jamais lues par le modèle, les mieux notées d'abord.

    ⚠ L'ordre compte : à six secondes l'appel, on ne finira pas 3 500
      trouvailles d'un coup. Autant commencer par celles qui sont sous les yeux
      — celles que le tri fait remonter en tête.
    """
    trous = ",".join("?" for _ in STATUTS)
    with base._verrou, base.connexion() as cx:
        lignes = cx.execute(
            f"SELECT id, titre, genre, statut, score, texte FROM trouvailles "
            f"WHERE lu_par_llm = 0 AND statut IN ({trous}) "
            f"AND coalesce(texte,'') <> '' "
            f"ORDER BY score DESC, collecte_le DESC LIMIT ?",
            (*STATUTS, limite),
        ).fetchall()
    return [dict(l) for l in lignes]


def main() -> int:
    analyseur = argparse.ArgumentParser(description="Repasser les trouvailles au modèle")
    analyseur.add_argument("--limite", type=int, default=40)
    analyseur.add_argument("--ecrire", action="store_true",
                           help="applique les décisions ; sans lui, essai à blanc")
    arguments = analyseur.parse_args()

    base.initialiser()
    cfg = charger()

    # ⚠ ON VÉRIFIE QUE LE MODÈLE RÉPOND AVANT DE COMMENCER. Lancer 300 appels
    #   contre une passerelle éteinte donnerait 300 échecs et zéro information —
    #   exactement la panne qu'on est en train de réparer.
    try:
        analyse_llm.relire("Bonjour", cfg)
    except analyse_llm.LLMIndisponible as e:
        print(f"Le modèle ne répond pas ({e}).")
        print("Rien n'a été fait. Relancez quand la passerelle sera revenue.")
        return 1

    lot = a_retrier(arguments.limite)
    with base._verrou, base.connexion() as cx:
        reste = cx.execute(
            "SELECT COUNT(*) n FROM trouvailles WHERE lu_par_llm = 0 "
            f"AND statut IN ({','.join('?' for _ in STATUTS)})", STATUTS
        ).fetchone()["n"]

    mode = "ÉCRITURE" if arguments.ecrire else "ESSAI À BLANC (rien ne change)"
    print(f"{mode} — {len(lot)} trouvaille(s) sur {reste} jamais lues par le modèle")
    print("=" * 76)

    hors_sujet, gardees, echecs, requalifiees = [], 0, 0, 0
    debut = time.time()
    for rang, t in enumerate(lot, start=1):
        try:
            lecture = analyse_llm.relire(t["texte"], cfg)
        except analyse_llm.LLMIndisponible as e:
            echecs += 1
            if echecs >= 5:
                print(f"\nCinq échecs d'affilée ({e}) — on s'arrête là.")
                break
            continue

        genre = lecture.get("genre")
        titre = (t["titre"] or "")[:46]
        if genre == "rien":
            hors_sujet.append(t)
            print(f"  {rang:3}. HORS SUJET  {titre:48} (confiance {lecture.get('confiance')})")
            if arguments.ecrire:
                base.modifier(t["id"], {
                    "statut": "rejetee",
                    "lu_par_llm": 1,
                    "llm_confiance": lecture.get("confiance"),
                    "note": "Écartée au rattrapage : le modèle la juge hors sujet.",
                })
        else:
            gardees += 1
            change = genre and genre != t["genre"]
            if change:
                requalifiees += 1
            print(f"  {rang:3}. garde       {titre:48} {t['genre']}"
                  + (f" -> {genre}" if change else ""))
            if arguments.ecrire:
                champs = {"lu_par_llm": 1, "llm_confiance": lecture.get("confiance")}
                # On requalifie le genre, mais JAMAIS le statut d'une trouvaille
                # déjà validée : c'est une décision humaine.
                if change and t["statut"] != "validee":
                    champs["genre"] = genre
                base.modifier(t["id"], champs)

    duree = time.time() - debut
    print("=" * 76)
    print(f"{len(hors_sujet)} hors sujet · {gardees} gardées · {requalifiees} requalifiées"
          f" · {echecs} échec(s) — {duree:.0f} s")
    if not arguments.ecrire and hors_sujet:
        print()
        print("Rien n'a été modifié. Pour appliquer :")
        print(f"    python outils\\retrier.py --limite {arguments.limite} --ecrire")
    if arguments.ecrire and hors_sujet:
        base.logguer(
            f"Rattrapage : {len(hors_sujet)} trouvaille(s) écartée(s) par le modèle, "
            f"{gardees} gardée(s).", "succes",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
