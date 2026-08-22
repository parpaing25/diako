"""Note de 0 à 100 par trouvaille, pour trier la récolte.

Le score du bot immobilier répondait à « est-elle bonne à publier ? ». Ici il
répond à une question de plus, et c'est elle qui compte : **est-ce que ça
comble un trou de Diako ?**

La différence n'est pas cosmétique. Le site porte 3 356 fiches d'établissement
dont **aucune n'a de photo**, et 4 lignes de carte pour 1 862 restaurants. Une
publication qui apporte huit plats chiffrés à un restaurant vide vaut
infiniment plus qu'une belle photo de plus sur une fiche déjà complète. Le
poste `apport` mesure exactement ça, en regardant l'état RÉEL de la fiche visée
(cache du référentiel : a-t-elle une photo ? un téléphone ? une carte ?).

Chaque point est justifié dans `details`, pour que l'interface puisse dire
POURQUOI une trouvaille est mal notée. Un score opaque ne sert à trier
qu'une fois.
"""
from __future__ import annotations

# Barèmes par genre : tous font 100. Ce qui compte pour un événement (sa date)
# n'a aucun sens pour une carte (ses plats).
BAREMES = {
    "etablissement": {"lieu": 15, "fiche": 15, "photos": 20, "apport": 25,
                      "prix": 10, "contact": 10, "lecture": 5},
    "carte":         {"lieu": 10, "fiche": 20, "photos": 10, "apport": 30,
                      "plats": 25, "lecture": 5},
    "evenement":     {"lieu": 15, "date": 25, "photos": 20, "apport": 20,
                      "detail": 15, "lecture": 5},
    "recit":         {"lieu": 25, "photos": 30, "apport": 20, "texte": 20,
                      "lecture": 5},
}


def _photos(nb: int, plafond: int) -> tuple[int, str]:
    if nb == 0:
        return 0, "aucune photo"
    if nb == 1:
        return round(plafond * 0.35), "1 seule photo"
    if nb <= 3:
        return round(plafond * 0.65), f"{nb} photos"
    if nb <= 6:
        return round(plafond * 0.9), f"{nb} photos"
    return plafond, f"{nb} photos"


def _lieu(t: dict, plafond: int) -> tuple[int, str]:
    if t.get("lieu_id"):
        return plafond, f"lieu reconnu ({t.get('lieu_nom')})"
    if t.get("lieu_texte"):
        return round(plafond * 0.4), f"lieu cité mais hors référentiel ({t['lieu_texte']})"
    return 0, "aucun lieu — la fiche serait introuvable"


def _fiche(t: dict, plafond: int) -> tuple[int, str]:
    """Rattachement à l'annuaire. Une carte sans fiche n'a nulle part où aller."""
    if t.get("page_id"):
        note = t.get("page_score") or 0
        if note >= 0.78:
            return plafond, f"rattachée à « {t.get('page_nom')} » ({note:.0%})"
        return round(plafond * 0.7), f"rattachement à confirmer ({note:.0%})"
    if t.get("nom_etab"):
        candidats = t.get("page_candidats") or []
        if candidats:
            return round(plafond * 0.5), f"{len(candidats)} fiche(s) candidate(s) à départager"
        return round(plafond * 0.6), "établissement absent de l'annuaire — fiche à créer"
    return 0, "aucun établissement identifié"


def _apport(t: dict, plafond: int) -> tuple[int, str]:
    """Ce que ça comble VRAIMENT sur le site.

    ⚠ On lit l'état de la fiche visée, pas une intention. Une photo de plus sur
      une fiche déjà illustrée ne vaut pas une première photo sur une fiche qui
      n'en a aucune.
    """
    etat = t.get("_etat_fiche") or {}
    gains, motifs = 0, []
    nb_photos = len([p for p in (t.get("photos") or []) if p.get("garder", 1)])
    nb_plats = len([l for l in (t.get("lignes_carte") or []) if l.get("garder", 1)])
    nb_chambres = len([
        c for c in (t.get("lignes_chambre") or [])
        if c.get("garder", 1) and c.get("prix_ar")
    ])

    if t.get("page_id"):
        if not etat.get("a_photo") and nb_photos:
            gains += 40
            motifs.append("première photo de la fiche")
        if not etat.get("a_tel") and t.get("telephone"):
            gains += 25
            motifs.append("premier numéro de la fiche")
        if not etat.get("nb_carte") and nb_plats:
            gains += 45
            motifs.append(f"première carte de la fiche ({nb_plats} plats)")
        elif nb_plats:
            gains += 15
            motifs.append(f"{nb_plats} plats de plus")
        # ⭐ 1 442 hôtels de Diako n'ont AUCUN tarif. Un premier prix de chambre
        #   vaut autant qu'une première carte : c'est ce qui rend la fiche
        #   utilisable pour choisir où dormir.
        if not etat.get("nb_chambre") and nb_chambres:
            gains += 45
            motifs.append(f"premiers tarifs de la fiche ({nb_chambres} chambres)")
        elif nb_chambres:
            gains += 20
            motifs.append(f"{nb_chambres} tarifs de chambre à jour")
        if t.get("prix_ar"):
            gains += 10
            motifs.append("prix relevé")
    else:
        # Fiche à créer : elle naîtra avec ce qu'on lui apporte.
        if nb_photos:
            gains += 30
            motifs.append("nouvelle fiche illustrée")
        if t.get("telephone"):
            gains += 20
            motifs.append("avec contact")
        if nb_plats:
            gains += 25
            motifs.append(f"avec sa carte ({nb_plats} plats)")
        if nb_chambres:
            gains += 25
            motifs.append(f"avec ses tarifs ({nb_chambres} chambres)")
        if t.get("resume"):
            gains += 10
            motifs.append("avec une présentation")

    if t.get("genre") == "recit":
        gains = 60 if nb_photos >= 3 else (35 if nb_photos else 0)
        motifs = ["récit illustré" if nb_photos >= 3 else
                  ("récit avec photo" if nb_photos else "récit sans photo")]

    points = min(plafond, round(plafond * gains / 100))
    return points, ", ".join(motifs) if motifs else "n'ajoute rien de neuf au site"


def _prix(t: dict, plafond: int) -> tuple[int, str]:
    if t.get("prix_ar") and t.get("prix_unite"):
        return plafond, "prix avec son unité"
    if t.get("prix_ar"):
        return round(plafond * 0.6), "prix sans unité claire"
    return 0, "pas de prix"


def _contact(t: dict, plafond: int) -> tuple[int, str]:
    tel = bool((t.get("telephone") or "").strip())
    autre = bool((t.get("whatsapp") or t.get("email") or t.get("site_web") or "").strip())
    if tel and autre:
        return plafond, "téléphone + autre moyen"
    if tel:
        return round(plafond * 0.8), "téléphone"
    if autre:
        return round(plafond * 0.4), "contact indirect seulement"
    return 0, "aucun moyen de joindre"


def _plats(t: dict, plafond: int) -> tuple[int, str]:
    lignes = [l for l in (t.get("lignes_carte") or []) if l.get("garder", 1)]
    chiffres = [l for l in lignes if l.get("prix_ar")]
    if not lignes:
        return 0, "aucun plat lu"
    if not chiffres:
        return round(plafond * 0.3), f"{len(lignes)} plats mais aucun prix"
    part = len(chiffres) / len(lignes)
    base = min(1.0, len(chiffres) / 8)
    return round(plafond * base * (0.6 + 0.4 * part)), \
        f"{len(chiffres)} plats chiffrés sur {len(lignes)}"


def _date(t: dict, plafond: int) -> tuple[int, str]:
    if t.get("evt_debut") and t.get("evt_fin"):
        return plafond, "dates de début et de fin"
    if t.get("evt_debut"):
        return round(plafond * 0.85), "date de début"
    if t.get("evt_recurrent"):
        return round(plafond * 0.4), "récurrent, sans date précise"
    return 0, "aucune date — ce n'est pas un événement publiable"


def _detail(t: dict, plafond: int) -> tuple[int, str]:
    gagnes, presents = 0, []
    if t.get("organisateur"):
        gagnes += 5
        presents.append("organisateur")
    if t.get("prix_ar"):
        gagnes += 5
        presents.append("entrée")
    if (t.get("resume") or "").strip():
        gagnes += 5
        presents.append("résumé")
    return min(plafond, gagnes), ", ".join(presents) if presents else "aucun détail"


def _texte(t: dict, plafond: int) -> tuple[int, str]:
    longueur = len((t.get("corps") or t.get("texte") or "").strip())
    if longueur >= 400:
        return plafond, "récit fourni"
    if longueur >= 150:
        return round(plafond * 0.6), "récit court"
    return round(plafond * 0.2), "texte très court"


def _lecture(t: dict, plafond: int) -> tuple[int, str]:
    if not t.get("lu_par_llm"):
        return round(plafond * 0.5), "lecture par règles seulement"
    confiance = t.get("llm_confiance")
    if confiance is None:
        return round(plafond * 0.7), "relue, sans indice de confiance"
    return round(plafond * min(1.0, confiance / 100)), f"relue, confiance {confiance}/100"


CALCULS = {
    "lieu": _lieu, "fiche": _fiche, "photos": None, "apport": _apport,
    "prix": _prix, "contact": _contact, "plats": _plats, "date": _date,
    "detail": _detail, "texte": _texte, "lecture": _lecture,
}


def calculer(t: dict, nb_photos: int | None = None) -> dict:
    """Renvoie {score, niveau, details:[...], alertes:[...]}."""
    if nb_photos is None:
        nb_photos = len([p for p in (t.get("photos") or []) if p.get("garder", 1)])

    bareme = BAREMES.get(t.get("genre") or "recit", BAREMES["recit"])
    briques = []
    for poste, plafond in bareme.items():
        if poste == "photos":
            points, motif = _photos(nb_photos, plafond)
        else:
            points, motif = CALCULS[poste](t, plafond)
        briques.append((poste, points, motif, plafond))

    score = sum(p for _, p, _, _ in briques)
    alertes: list[str] = []

    # Malus : ces cas donnent une trouvaille publiable mais douteuse.
    if t.get("genre") in ("etablissement", "carte") and not t.get("lieu_id"):
        score -= 10
        alertes.append("sans lieu du référentiel, la fiche n'apparaîtra dans aucune recherche")
    if t.get("genre") == "carte" and not t.get("page_id"):
        score = min(score, 30)
        alertes.append("une carte sans fiche d'établissement n'a nulle part où aller")
    if t.get("page_id") and (t.get("page_score") or 0) < 0.7:
        alertes.append(
            f"rapprochement incertain ({(t.get('page_score') or 0):.0%}) — à vérifier avant publication"
        )
    confiance = t.get("llm_confiance")
    if confiance is not None and confiance < 55:
        score -= 5
        alertes.append(f"lecture incertaine ({confiance}/100)")
    if t.get("llm_doute"):
        alertes.append(t["llm_doute"][:140])

    score = max(0, min(100, score))
    return {
        "score": score,
        "niveau": niveau(score),
        "details": [
            {"cle": cle, "points": points, "sur": plafond, "motif": motif}
            for cle, points, motif, plafond in briques
        ],
        "alertes": alertes,
    }


def niveau(score: int) -> str:
    if score >= 75:
        return "excellent"
    if score >= 55:
        return "bon"
    if score >= 35:
        return "moyen"
    return "faible"
