#!/usr/bin/env python
"""Rejoue le classement du 03/09/2026 sur les trouvailles en base, et nettoie.

Décision d'Andry (03/09/2026) : le fil porte le VÉCU des voyageurs, le
calendrier porte les événements malgaches qui ont un lieu, et ce qu'un
établissement dit de lui pour vendre (offres, menus de fête, vœux) nourrit sa
fiche — jamais le fil. Les ventes d'objets ne vont nulle part.

Ce script repasse `extraction.classer_avec_motif` (les règles d'aujourd'hui,
sans le modèle) sur ce qui est en base, et applique :

  · récit / événement → « rien »          : rejetée (locale), retirée du site
  · récit / événement → établissement     : la trouvaille redevient « à trier »
                                            comme fiche ; le récit ou
                                            l'événement est retiré du site
  · établissement → « rien » (vente…)     : rejetée ; la fiche créée (jamais
                                            visible, is_published=false) est
                                            listée dans data/pages-a-ne-pas-publier.txt
  · récit dont le sous-genre change       : posts.kind mis à jour

Rien n'est SUPPRIMÉ sur le site : un récit passe en `status='hidden'`, un
événement en `is_published=false`. Le retour arrière est un UPDATE.

Usage :
    python outils/reclasser.py                 # à blanc : montre, n'écrit rien
    python outils/reclasser.py --ecrire        # base locale
    python outils/reclasser.py --ecrire --site # + le site (au nom du compte Diako)
"""
from __future__ import annotations

import argparse
import collections
import sqlite3
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import base, diako, extraction  # noqa: E402
from bot.config import BASE, DOSSIER_DONNEES  # noqa: E402

STATUTS = ("a_trier", "validee", "incomplete", "publiee", "doublon")


def _lignes():
    cx = sqlite3.connect(f"file:{BASE}?mode=ro", uri=True)
    cx.row_factory = sqlite3.Row
    lignes = cx.execute(
        "SELECT t.*, (SELECT count(*) FROM photos p WHERE p.trouvaille_id = t.id AND p.garder = 1) AS nb_photos "
        "FROM trouvailles t WHERE statut IN (%s) AND source_genre != 'site'"
        % ",".join("?" * len(STATUTS)), STATUTS,
    ).fetchall()
    cx.close()
    return [dict(l) for l in lignes]


def decider(t: dict) -> dict | None:
    """Ce qu'il faut faire de cette trouvaille, ou None si rien ne change."""
    texte = t.get("texte") or ""
    auteur_page = t.get("source_nom") if t.get("source_genre") == "page" else None
    plats = extraction.lignes_de_carte(texte)
    dates = extraction.dates_evenement(texte, date.today())
    genre, motif = extraction.classer_avec_motif(texte, int(t.get("nb_photos") or 0),
                                                 plats, dates, auteur_page)
    ancien = t.get("genre")
    publiee = t.get("statut") == "publiee"

    if genre == ancien:
        if genre == "recit":
            nouveau_post = extraction.genre_de_post(texte)
            if nouveau_post != (t.get("post_genre") or "recit"):
                return {"action": "sous_genre", "post_genre": nouveau_post, "genre": genre,
                        "motif": motif, "publiee": publiee}
        return None
    if genre == "rien":
        return {"action": "rejeter", "genre": genre, "motif": motif, "publiee": publiee}
    if ancien in ("recit", "evenement") and genre in ("etablissement", "carte"):
        return {"action": "requalifier", "genre": genre, "motif": motif, "publiee": publiee}
    # ⚠ ON NE FAIT QUE DESCENDRE. Un genre décidé hier par le modèle
    #   (« établissement ») ne se rejoue pas par les seules règles : le rejeu
    #   sans modèle rendait « récit » pour 161 fiches, et c'est le rejeu qui
    #   aurait eu tort. Ce qui monte au fil ou au calendrier attend une
    #   collecte avec le modèle, ou un clic.
    return None


def main() -> None:
    analyseur = argparse.ArgumentParser(description="Rejouer le classement et nettoyer")
    analyseur.add_argument("--ecrire", action="store_true")
    analyseur.add_argument("--site", action="store_true")
    options = analyseur.parse_args()

    lignes = _lignes()
    print(f"{len(lignes)} trouvaille(s) relues.")
    decisions = []
    for t in lignes:
        d = decider(t)
        if d:
            d["t"] = t
            decisions.append(d)

    compte = collections.Counter(
        (d["action"], d["t"]["genre"], d["genre"], "publiée" if d["publiee"] else "locale")
        for d in decisions
    )
    print("\n== Ce qui change ==")
    for cle, n in sorted(compte.items(), key=lambda x: -x[1]):
        print(f"  {n:4}  {cle[0]:12} {cle[1]:14} → {cle[2]:14} ({cle[3]})")
    motifs = collections.Counter(d["motif"] for d in decisions)
    print("\n== Pourquoi ==")
    for m, n in motifs.most_common():
        print(f"  {n:4}  {m}")
    print("\n== Exemples (publiées d'abord) ==")
    for d in sorted(decisions, key=lambda d: not d["publiee"])[:40]:
        t = d["t"]
        print(f"  [{t['statut']:10}] {t['genre']:13} → {d['genre']:13} · {d['motif'][:40]:40} · "
              f"{(t.get('titre') or t.get('nom_etab') or t['texte'][:50]).replace(chr(10), ' ')[:60]}")

    if not options.ecrire:
        print("\n(à blanc — rien n'a été écrit ; ajoutez --ecrire, et --site pour le site)")
        return

    # ── Base locale ────────────────────────────────────────────────────────
    aujourdhui = date.today().isoformat()
    a_masquer_posts, a_masquer_events, kinds, pages_exclues = [], [], [], []
    with base._verrou, base.connexion() as cx:
        for d in decisions:
            t = d["t"]
            tid = t["id"]
            cible_table, cible_id = t.get("cible_table"), t.get("cible_id")
            if d["action"] == "sous_genre":
                cx.execute("UPDATE trouvailles SET post_genre = ? WHERE id = ?", (d["post_genre"], tid))
                if d["publiee"] and cible_table == "posts" and cible_id:
                    kinds.append((cible_id, d["post_genre"]))
                continue
            if d["publiee"]:
                if cible_table == "posts" and cible_id:
                    a_masquer_posts.append(cible_id)
                elif cible_table == "events" and cible_id:
                    a_masquer_events.append(cible_id)
                elif cible_table == "pages" and cible_id:
                    pages_exclues.append(f"{cible_id}\t{t.get('nom_etab') or ''}\t{d['motif']}")
            if d["action"] == "rejeter":
                note = f"Hors sujet ({d['motif']})"
                if d["publiee"]:
                    note += f" — retirée du site le {aujourdhui}"
                cx.execute("UPDATE trouvailles SET statut = 'rejetee', note = ? WHERE id = ?", (note, tid))
            elif d["action"] == "requalifier":
                note = f"Requalifiée le {aujourdhui} : {d['motif']}"
                if d["publiee"]:
                    note += " — le récit/événement a été retiré du site ; à republier comme fiche si utile"
                cx.execute(
                    "UPDATE trouvailles SET genre = ?, statut = 'a_trier', note = ?, "
                    "titre_evt_conserve = NULL WHERE id = ?" if False else
                    "UPDATE trouvailles SET genre = ?, statut = 'a_trier', note = ?, "
                    "cible_table = NULL, cible_id = NULL, lien_diako = NULL, publie_a = NULL, "
                    "post_genre = NULL WHERE id = ?",
                    (d["genre"], note, tid),
                )
    print(f"\nBase locale : {len(decisions)} trouvaille(s) mise(s) à jour.")
    if pages_exclues:
        chemin = DOSSIER_DONNEES / "pages-a-ne-pas-publier.txt"
        chemin.write_text("\n".join(pages_exclues) + "\n", encoding="utf-8")
        print(f"{len(pages_exclues)} fiche(s) créée(s) à ne pas publier → {chemin}")

    if not options.site:
        print(f"Site : {len(a_masquer_posts)} récit(s) et {len(a_masquer_events)} événement(s) "
              f"seraient retirés, {len(kinds)} sous-genre(s) mis à jour — relancez avec --site.")
        return

    # ── Le site : masquer, jamais supprimer ────────────────────────────────
    def _tableau(ids):
        return "ARRAY[" + ", ".join("'" + i.replace("'", "''") + "'" for i in ids) + "]::uuid[]"

    requetes = []
    if a_masquer_posts:
        requetes.append(f"UPDATE public.posts SET status = 'hidden' WHERE id = ANY({_tableau(a_masquer_posts)}) AND status = 'published';")
    if a_masquer_events:
        requetes.append(f"UPDATE public.events SET is_published = false WHERE id = ANY({_tableau(a_masquer_events)});")
    for pid, kind in kinds:
        requetes.append(f"UPDATE public.posts SET kind = '{kind}' WHERE id = '{pid}'::uuid;")
    if not requetes:
        print("Site : rien à faire.")
        return
    diako.executer_sql("\n".join(requetes), proprietaire=True)
    # Contrôle : on relit ce qu'on a écrit.
    restes = diako.executer_sql(
        f"SELECT (SELECT count(*) FROM public.posts WHERE id = ANY({_tableau(a_masquer_posts or ['00000000-0000-0000-0000-000000000000'])}) AND status = 'published') AS posts_visibles, "
        f"(SELECT count(*) FROM public.events WHERE id = ANY({_tableau(a_masquer_events or ['00000000-0000-0000-0000-000000000000'])}) AND is_published) AS events_visibles"
    )
    print(f"Site : {len(a_masquer_posts)} récit(s) masqué(s), {len(a_masquer_events)} événement(s) "
          f"dépubliés, {len(kinds)} sous-genre(s) mis à jour. Contrôle après écriture : {restes}")
    base.logguer(
        f"Nettoyage du site ({aujourdhui}) : {len(a_masquer_posts)} récit(s) masqué(s), "
        f"{len(a_masquer_events)} événement(s) dépublié(s) — publicités, vœux de fête, "
        "voyages organisés et ventes d'objets. Rien n'est supprimé.", "avert",
    )


if __name__ == "__main__":
    main()
