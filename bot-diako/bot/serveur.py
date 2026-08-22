"""Serveur local du bot : API JSON + interface web.

Tout tourne sur la machine d'Andry, sur 127.0.0.1 : rien n'est exposé au
réseau. Les tâches longues (collecte, publication) partent dans un fil séparé
et rendent la main tout de suite ; l'interface suit l'avancement via /api/etat.
"""
from __future__ import annotations

import threading
import webbrowser
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import analyse_llm, base, diako
from . import planificateur as plan
from . import publication, redaction
from . import score as notation
from .collecteur import (
    analyser_source,
    collecteur,
    oublier_session,
    session_enregistree,
)
from .config import DOSSIER_TROUVAILLES, RACINE, charger, enregistrer

WEB = RACINE / "web"

app = FastAPI(title="Bot collecte Diako", docs_url=None, redoc_url=None)

# État des tâches de fond, lu par l'interface toutes les deux secondes.
tache = {"type": None, "actif": False, "message": "", "detail": ""}


def _lancer(type_tache: str, fonction) -> bool:
    if tache["actif"]:
        return False
    tache.update({"type": type_tache, "actif": True, "message": "", "detail": ""})

    def enveloppe():
        try:
            fonction()
        except Exception as e:
            base.logguer(f"{type_tache} : {e}", "erreur")
            tache["message"] = str(e)
        finally:
            tache["actif"] = False

    threading.Thread(target=enveloppe, daemon=True).start()
    return True


# ── Modèles d'entrée ────────────────────────────────────────────────────────
class SourceEntree(BaseModel):
    nom: str = ""
    url: str


class ChampsEntree(BaseModel):
    champs: dict


class ConfigEntree(BaseModel):
    config: dict


class LigneEntree(BaseModel):
    nom: str = ""
    prix_ar: int | None = None
    description: str | None = None
    section: str | None = None


# ── Interface ───────────────────────────────────────────────────────────────
@app.get("/")
def accueil():
    """Sert l'interface, avec une empreinte sur les fichiers statiques.

    Sans ça le navigateur garde son ancien CSS : une correction d'affichage
    peut rester invisible des heures.
    """
    page = (WEB / "index.html").read_text(encoding="utf-8")
    for fichier in ("style.css", "app.js"):
        empreinte = int((WEB / fichier).stat().st_mtime)
        page = page.replace(f"/static/{fichier}", f"/static/{fichier}?v={empreinte}")
    return HTMLResponse(page)


@app.get("/photo/{tid}/{fichier}")
def photo(tid: str, fichier: str):
    """Sert une photo collectée. Le nom de fichier est contraint, pas de remontée."""
    t = base.trouvaille(tid)
    if not t or not t.get("dossier"):
        raise HTTPException(404, "Trouvaille inconnue")
    nom = Path(fichier).name
    chemin = (DOSSIER_TROUVAILLES.parent / t["dossier"] / nom).resolve()
    if not chemin.is_file() or DOSSIER_TROUVAILLES.resolve() not in chemin.parents:
        raise HTTPException(404, "Photo introuvable")
    return FileResponse(chemin)


# ── État et journal ─────────────────────────────────────────────────────────
@app.get("/api/etat")
def etat():
    config = charger()
    try:
        trous = diako.manques()
    except Exception:
        trous = {}
    return {
        "compteurs": base.compteurs(),
        "collecte": collecteur.etat,
        "tache": tache,
        "journal": base.lire_journal(60),
        "session_fb": session_enregistree(),
        "sources_actives": len(base.sources(actives_seulement=True)),
        "planning": plan.bilan_du_jour(config),
        "manques": trous,
        "referentiel": {
            **base.taille_referentiel(),
            "age_heures": round(diako.age_referentiel(), 1),
        },
    }


# ── Sources ─────────────────────────────────────────────────────────────────
@app.get("/api/sources")
def liste_sources():
    return base.sources()


@app.post("/api/sources")
def creer_source(entree: SourceEntree):
    try:
        url, genre = analyser_source(entree.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    nom = entree.nom.strip()
    if not nom:
        if genre == "recherche":
            nom = "🔎 " + entree.url.strip()[:60]
        elif genre == "fil":
            nom = "Mon fil d'actualité"
        else:
            nom = url.rstrip("/").split("/")[-1].split("=")[-1]
    return base.ajouter_source(nom, url, genre)


@app.patch("/api/sources/{sid}")
def maj_source(sid: int, entree: ChampsEntree):
    base.modifier_source(sid, **entree.champs)
    return {"ok": True}


@app.delete("/api/sources/{sid}")
def effacer_source(sid: int):
    base.supprimer_source(sid)
    return {"ok": True}


@app.get("/api/suggestions")
def suggestions():
    """Des recherches à ajouter, déduites de ce qui manque VRAIMENT au site."""
    try:
        return diako.suggestions_de_recherche()
    except Exception as e:
        raise HTTPException(503, f"Référentiel injoignable : {e}")


# ── Trouvailles ─────────────────────────────────────────────────────────────
@app.get("/api/trouvailles")
def liste(statut: str = "a_trier", genre: str = "", source_id: int = 0,
          recherche: str = "", tri: str = "score"):
    return base.lister(
        statut=statut or None, genre=genre or None, source_id=source_id or None,
        recherche=recherche or None, tri=tri,
    )


@app.get("/api/trouvailles/{tid}")
def detail(tid: str):
    t = base.trouvaille(tid)
    if not t:
        raise HTTPException(404, "Trouvaille inconnue")
    t["bloquants"] = publication.manque_pour_publier(t)
    return t


@app.patch("/api/trouvailles/{tid}")
def maj(tid: str, entree: ChampsEntree):
    base.modifier(tid, entree.champs)
    t = base.trouvaille(tid)
    if not t:
        raise HTTPException(404, "Trouvaille inconnue")
    # Les textes se refont à chaque correction, sauf ceux écrits à la main
    # (ils arrivent alors dans les champs modifiés).
    auto = {}
    if "titre" not in entree.champs:
        auto["titre"] = redaction.titre(t)
    if "resume" not in entree.champs and not t.get("resume"):
        auto["resume"] = redaction.resume_fiche(t)
    if "presentation" not in entree.champs and t["genre"] == "etablissement":
        auto["presentation"] = redaction.presentation(t)
    if "corps" not in entree.champs and t["genre"] == "recit":
        auto["corps"] = redaction.corps_recit(t)
    note = notation.calculer(t)
    auto["score"], auto["niveau"] = note["score"], note["niveau"]
    base.modifier(tid, auto)
    return detail(tid)


@app.delete("/api/trouvailles/{tid}")
def effacer(tid: str):
    base.supprimer(tid)
    return {"ok": True}


@app.get("/api/trouvailles/{tid}/score")
def detail_score(tid: str):
    """Le détail du score : pourquoi cette trouvaille est notée comme ça."""
    t = base.trouvaille(tid)
    if not t:
        raise HTTPException(404, "Trouvaille inconnue")
    return notation.calculer(t)


@app.post("/api/trouvailles/{tid}/relire")
def relire(tid: str):
    """Repasse une trouvaille au modèle — utile après un échec de la passerelle."""
    t = base.trouvaille(tid)
    if not t:
        raise HTTPException(404, "Trouvaille inconnue")
    cfg = charger()
    try:
        lecture = analyse_llm.relire(t["texte"], cfg)
    except analyse_llm.LLMIndisponible as e:
        raise HTTPException(503, f"Relecture impossible : {e}")

    fusion = analyse_llm.fusionner({}, lecture)
    champs = {
        cle: valeur for cle, valeur in fusion.items()
        if cle in base.CHAMPS_EDITABLES and valeur not in (None, "", [])
    }
    champs["lu_par_llm"] = 1
    base.modifier(tid, champs)

    # Les plats relus remplacent ceux d'avant : les garder ferait des doublons.
    if fusion.get("lignes_carte"):
        for ligne in base.trouvaille(tid)["lignes_carte"]:
            base.supprimer_ligne_carte(ligne["id"])
        for rang, ligne in enumerate(fusion["lignes_carte"], start=1):
            plat = diako.rapprocher_plat(ligne["nom"])
            base.ajouter_ligne_carte(tid, dict(
                ligne, plat_id=plat["id"] if plat else None,
                plat_nom=plat["nom"] if plat else None), ordre=rang)

    base.logguer("Trouvaille relue par le modèle.", "succes")
    return maj(tid, ChampsEntree(champs={}))


@app.post("/api/trouvailles/{tid}/lire-carte")
def lire_carte(tid: str):
    """Fait transcrire les photos de cette trouvaille comme une carte."""
    t = base.trouvaille(tid)
    if not t:
        raise HTTPException(404, "Trouvaille inconnue")
    dossier = DOSSIER_TROUVAILLES.parent / t["dossier"]
    photos = [dossier / p["fichier"] for p in base.photos_a_publier(tid)]
    if not photos:
        raise HTTPException(400, "Aucune photo à lire.")
    try:
        lecture = analyse_llm.lire_carte(photos, charger())
    except analyse_llm.LLMIndisponible as e:
        raise HTTPException(503, f"Lecture impossible : {e}")

    plats = analyse_llm.plats_depuis_carte(lecture)
    if not plats:
        raise HTTPException(
            400,
            "Le modèle ne reconnaît pas de carte lisible sur ces photos"
            + (f" ({lecture.get('doute')})" if lecture.get("doute") else "") + ".",
        )
    for ligne in t["lignes_carte"]:
        base.supprimer_ligne_carte(ligne["id"])
    for rang, ligne in enumerate(plats, start=1):
        plat = diako.rapprocher_plat(ligne["nom"])
        base.ajouter_ligne_carte(tid, dict(
            ligne, plat_id=plat["id"] if plat else None,
            plat_nom=plat["nom"] if plat else None), ordre=rang)
    base.logguer(f"Carte lue sur photo : {len(plats)} plat(s).", "succes")
    return maj(tid, ChampsEntree(champs={"genre": "carte"}))


# ── Rapprochement ───────────────────────────────────────────────────────────
@app.get("/api/fiches")
def chercher_fiches(q: str = "", lieu_id: str = ""):
    """Cherche une fiche d'établissement dans l'annuaire, pour rattacher à la main."""
    if len(q.strip()) < 3:
        return []
    return diako.rapprocher_page(q, lieu_id or None, seuil=0.35, combien=12)


@app.get("/api/lieux")
def chercher_lieux(q: str = ""):
    """Cherche un lieu du référentiel (22 707 entrées)."""
    if len(q.strip()) < 3:
        return []
    resultats = []
    for lieu in base.referentiel("ref_lieux"):
        note = diako.similitude(q, lieu["nom"])
        if note >= 0.4:
            resultats.append({"id": lieu["id"], "nom": lieu["nom"],
                              "region": lieu.get("region"), "score": round(note, 3)})
    resultats.sort(key=lambda r: r["score"], reverse=True)
    return resultats[:12]


@app.post("/api/trouvailles/{tid}/rattacher")
def rattacher(tid: str, entree: ChampsEntree):
    """Rattache la trouvaille à une fiche existante, ou l'en détache.

    ⚠ C'est ici que se joue la qualité de l'annuaire. Un rattachement à côté
      pose une carte sur le mauvais restaurant, et personne ne vient corriger :
      le panneau montre le score et le lieu de chaque candidat pour que la
      décision se prenne à l'œil, pas au hasard.
    """
    page_id = (entree.champs or {}).get("page_id")
    if not page_id:
        base.modifier(tid, {"page_id": None, "page_nom": None, "page_score": None})
        return detail(tid)
    fiches = [f for f in base.referentiel("ref_pages") if f["id"] == page_id]
    if not fiches:
        raise HTTPException(404, "Fiche inconnue dans le référentiel local.")
    fiche = fiches[0]
    base.modifier(tid, {
        "page_id": fiche["id"], "page_nom": fiche["nom"], "page_score": 1.0,
    })
    return detail(tid)


@app.post("/api/trouvailles/{tid}/lieu")
def poser_lieu(tid: str, entree: ChampsEntree):
    lieu_id = (entree.champs or {}).get("lieu_id")
    if not lieu_id:
        base.modifier(tid, {"lieu_id": None, "lieu_nom": None, "lieu_score": None})
        return detail(tid)
    lieux = [l for l in base.referentiel("ref_lieux") if l["id"] == lieu_id]
    if not lieux:
        raise HTTPException(404, "Lieu inconnu dans le référentiel local.")
    base.modifier(tid, {"lieu_id": lieux[0]["id"], "lieu_nom": lieux[0]["nom"],
                        "lieu_score": 1.0})
    return detail(tid)


@app.post("/api/referentiel/recharger")
def recharger_referentiel():
    def travail():
        tailles = diako.rafraichir_referentiel(force=True)
        diako.oublier_cache()
        tache["message"] = (
            f"Référentiel rechargé : {tailles['ref_pages']} fiches, "
            f"{tailles['ref_lieux']} lieux."
        )

    if not _lancer("referentiel", travail):
        raise HTTPException(409, "Une tâche est déjà en cours.")
    return {"ok": True}


# ── Photos et lignes de carte ───────────────────────────────────────────────
@app.patch("/api/photos/{pid}")
def maj_photo(pid: int, entree: ChampsEntree):
    base.modifier_photo(pid, **entree.champs)
    return {"ok": True}


@app.post("/api/trouvailles/{tid}/couverture/{pid}")
def couverture(tid: str, pid: int):
    base.definir_couverture(tid, pid)
    return {"ok": True}


@app.post("/api/trouvailles/{tid}/lignes")
def ajouter_ligne(tid: str, entree: LigneEntree):
    if not entree.nom.strip():
        raise HTTPException(400, "Un plat sans nom ne sert à rien.")
    plat = diako.rapprocher_plat(entree.nom)
    base.ajouter_ligne_carte(tid, {
        "nom": entree.nom.strip(), "prix_ar": entree.prix_ar,
        "description": entree.description, "section": entree.section,
        "plat_id": plat["id"] if plat else None,
        "plat_nom": plat["nom"] if plat else None,
    }, ordre=999)
    return detail(tid)


@app.patch("/api/lignes/{lid}")
def maj_ligne(lid: int, entree: ChampsEntree):
    champs = dict(entree.champs)
    if champs.get("nom"):
        plat = diako.rapprocher_plat(champs["nom"])
        champs["plat_id"] = plat["id"] if plat else None
        champs["plat_nom"] = plat["nom"] if plat else None
    base.modifier_ligne_carte(lid, **champs)
    return {"ok": True}


@app.delete("/api/lignes/{lid}")
def effacer_ligne(lid: int):
    base.supprimer_ligne_carte(lid)
    return {"ok": True}


# ── Facebook ────────────────────────────────────────────────────────────────
@app.post("/api/facebook/connexion")
def connexion_facebook():
    collecteur.stop.clear()
    if not _lancer("connexion", collecteur.ouvrir_connexion):
        raise HTTPException(409, "Une tâche est déjà en cours.")
    return {"ok": True}


@app.delete("/api/facebook/session")
def deconnexion_facebook():
    if tache["actif"]:
        raise HTTPException(409, "Une tâche est en cours — attendez la fin.")
    oublier_session()
    return {"ok": True}


def _demarrer_collecte(reglages: dict | None = None) -> bool:
    """Point d'entrée unique : le bouton et le planificateur passent par là."""
    return _lancer("collecte", lambda: collecteur.collecter(None, reglages))


@app.post("/api/collecte/lancer")
def lancer_collecte():
    if not _demarrer_collecte():
        raise HTTPException(409, "Une collecte est déjà en cours.")
    return {"ok": True}


@app.post("/api/collecte/arreter")
def arreter_collecte():
    collecteur.stop.set()
    base.logguer(
        "Arrêt demandé — la collecte s'arrête après la publication en cours.", "avert"
    )
    return {"ok": True}


# ── Publication ─────────────────────────────────────────────────────────────
@app.post("/api/trouvailles/{tid}/publier")
def publier(tid: str):
    t = base.trouvaille(tid)
    if not t:
        raise HTTPException(404, "Trouvaille inconnue")
    manques = publication.manque_pour_publier(t)
    if manques:
        raise HTTPException(400, "À compléter avant publication : " + ", ".join(manques))

    def travail():
        def progression(rang, total):
            tache["detail"] = f"photo {rang}/{total}"

        resultat = publication.publier(tid, progression)
        controle = publication.verifier(resultat["table"], resultat["id"])
        if not controle.get("trouve"):
            base.logguer(
                "⚠ Publication annoncée mais la ligne est introuvable en base — "
                "à vérifier à la main.", "erreur",
            )
        tache["message"] = f"Publiée : {resultat['lien']}"

    if not _lancer("publication", travail):
        raise HTTPException(409, "Une tâche est déjà en cours.")
    return {"ok": True}


@app.post("/api/publier-lot")
def publier_lot():
    """Publie toutes les trouvailles marquées « validée », l'une après l'autre."""
    a_faire = [t["id"] for t in base.lister(statut="validee", limite=100)]
    if not a_faire:
        raise HTTPException(400, "Aucune trouvaille validée en attente.")

    def travail():
        reussies = 0
        for rang, tid in enumerate(a_faire, start=1):
            tache["detail"] = f"trouvaille {rang}/{len(a_faire)}"
            try:
                publication.publier(tid)
                reussies += 1
            except Exception as e:
                base.logguer(f"Publication refusée pour {tid[:8]} : {e}", "erreur")
        tache["message"] = f"{reussies}/{len(a_faire)} trouvaille(s) publiée(s)."

    if not _lancer("publication", travail):
        raise HTTPException(409, "Une tâche est déjà en cours.")
    return {"ok": True, "nombre": len(a_faire)}


# ── Réglages ────────────────────────────────────────────────────────────────
@app.get("/api/config")
def lire_config():
    return charger()


@app.put("/api/config")
def ecrire_config(entree: ConfigEntree):
    config = charger()
    config.update(entree.config)
    enregistrer(config)
    base.logguer("Réglages enregistrés.", "info")
    return config


@app.post("/api/llm/test")
def tester_llm():
    try:
        return analyse_llm.tester(charger())
    except analyse_llm.LLMIndisponible as e:
        raise HTTPException(503, str(e))


@app.exception_handler(publication.ErreurPublication)
def erreur_publication(_, exc):
    return JSONResponse({"detail": str(exc)}, status_code=400)


app.mount("/static", StaticFiles(directory=WEB), name="static")


def demarrer(port: int = 8757, ouvrir: bool = True) -> None:
    base.initialiser()
    config = charger()
    # Le planificateur vit tant que le serveur vit : garder cette fenêtre
    # ouverte, c'est ce qui fait tourner les collectes de 11 h et 18 h.
    plan.Planificateur(_demarrer_collecte, lambda: tache["actif"])
    if config.get("collecte_auto"):
        base.logguer(
            "Collectes automatiques : " + ", ".join(plan._heures(config))
            + f" — objectif {config.get('objectif_par_jour')} trouvailles/jour.",
            "info",
        )
    DOSSIER_TROUVAILLES.mkdir(parents=True, exist_ok=True)
    base.logguer("Bot de collecte Diako démarré.", "info")

    # Le référentiel se charge au démarrage, en tâche de fond : sans lui, aucun
    # rapprochement n'est possible et l'interface ne peut rien proposer.
    threading.Thread(
        target=lambda: _silencieux(diako.rafraichir_referentiel), daemon=True
    ).start()

    if ouvrir:
        threading.Timer(1.2, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


def _silencieux(fonction) -> None:
    try:
        fonction()
    except Exception as e:
        base.logguer(
            f"Référentiel Diako non chargé ({e}) — rechargez-le depuis le tableau "
            "de bord avant de publier.", "avert",
        )


if __name__ == "__main__":
    demarrer()
