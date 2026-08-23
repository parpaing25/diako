"""Ce qu'une trouvaille remplit AILLEURS que dans sa table principale.

🔴 LE DÉFAUT QUE CE MODULE CORRIGE. Jusqu'ici, un récit sur Nosy Komba partait
   sur le fil — et la destination Nosy Komba restait sans photo. Une agence qui
   raconte « Ampefy, 2 jours, 180 km, 350 000 Ar » devenait une fiche
   d'établissement, et le circuit se perdait. Mesuré le 23/08/2026, c'est
   énorme :

     · 18 334 destinations, **91 avec une photo** ;
     · 2 521 sites et parcs, **226 avec une photo** ;
     · 95 plats, **33 avec une photo** ;
     · **0 circuit** en base, alors que les agences n'écrivent que ça ;
     · 0 activité.

   Une publication ne sert pas un seul écran. La même photo de Nosy Komba
   illustre le récit ET la destination ; le même texte d'agence donne la fiche
   ET son circuit. C'est le principe de ce module : **on ne publie pas une
   fois, on range partout où ça manque.**

⚠ ON NE REMPLACE JAMAIS. Chaque écriture est conditionnée à `IS NULL` côté
  base : une destination déjà illustrée garde sa photo, un plat déjà
  photographié aussi. Le bot comble, il ne réécrit pas.

⚠ L'ATTRIBUTION EST OBLIGATOIRE. `places`, `attractions` et `dishes` portent
  toutes les trois un triplet crédit / licence / source. Une photo posée sans
  lui n'est pas une image gratuite — c'est une infraction silencieuse. Les
  migrations 0049, 0082, 0096 et 0104 ont déjà tranché ce point pour Commons ;
  la même règle vaut pour Facebook.
"""
from __future__ import annotations

from . import base as bdd
from . import diako, redaction
from .config import SITE

LICENCE = "Publication Facebook — reprise avec attribution"


def _txt(valeur) -> str:
    if valeur is None or valeur == "":
        return "NULL"
    return "'" + str(valeur).replace("'", "''") + "'"


# ── Ce qu'on POURRAIT remplir ───────────────────────────────────────────────
def apports(t: dict) -> list[dict]:
    """Ce que cette trouvaille peut combler ailleurs. Lecture seule.

    Rend une liste de {cible, quoi, id, nom, pret} que le panneau affiche avant
    publication — pour qu'on voie ce qu'on gagne, et pas seulement ce qu'on
    publie.
    """
    liste: list[dict] = []
    photos = [p for p in (t.get("photos") or []) if p.get("garder", 1)]
    a_photo = bool(photos)

    # ① La destination. C'est le trou le plus large du site.
    if t.get("lieu_id") and a_photo:
        lieux = [l for l in bdd.referentiel("ref_lieux") if l["id"] == t["lieu_id"]]
        if lieux:
            liste.append({
                "cible": "places", "id": t["lieu_id"], "nom": lieux[0]["nom"],
                "quoi": "photo de la destination",
                # Le cache ne porte pas `cover_url` pour les lieux : on
                # vérifiera au moment d'écrire, la base tranche.
                "pret": True,
            })

    # ② Le site ou le parc dont parle le texte.
    site = t.get("_site") or diako.rapprocher_site(t.get("texte") or "", t.get("lieu_id"))
    if site and a_photo and not site.get("a_photo"):
        liste.append({
            "cible": "attractions", "id": site["id"], "nom": site["nom"],
            "quoi": "photo du site", "pret": True,
        })

    # ③ Le plat. Seulement quand la trouvaille parle d'UN plat identifié :
    #    associer une photo au hasard à un plat serait pire que rien.
    if t.get("plat_id") and a_photo:
        liste.append({
            "cible": "dishes", "id": t["plat_id"], "nom": t.get("plat_nom") or "",
            "quoi": "photo du plat", "pret": True,
        })

    # ④ Les circuits d'une agence.
    circuits = [c for c in (t.get("lignes_circuit") or []) if c.get("garder", 1)]
    if circuits:
        liste.append({
            "cible": "tours", "id": t.get("page_id"), "nom": t.get("page_nom") or "",
            "quoi": f"{len(circuits)} circuit(s)",
            # Un circuit a besoin d'une fiche d'agence pour exister.
            "pret": bool(t.get("page_id")),
        })
    return liste


# ── Ce qu'on écrit ──────────────────────────────────────────────────────────
def _sql_photo(table: str, colonne: str, identifiant: str, url: str,
               credit: str, source: str) -> str:
    """Pose une photo SEULEMENT si la colonne est vide, avec son attribution."""
    prefixe = "photo" if table == "dishes" else "cover"
    return (
        f"UPDATE public.{table} SET {colonne} = {_txt(url)}, "
        f"{prefixe}_credit = {_txt(credit[:200])}, "
        f"{prefixe}_licence = {_txt(LICENCE)}, "
        f"{prefixe}_source = {_txt(source)} "
        f"WHERE id = {_txt(identifiant)}::uuid AND {colonne} IS NULL;"
    )


def _sql_circuits(t: dict, circuits: list[dict]) -> str:
    """Les circuits d'une agence -> `tours` + `tour_prices`.

    ⚠ `duration_days` est un ENTIER filtrable, jamais du texte (migration
      0007) : un circuit sans durée lisible n'entre pas. « 8 jours » écrit à la
      main ne se filtre pas, et c'est la durée qui fait chercher un circuit.
    """
    valides = [c for c in circuits if c.get("titre") and (c.get("jours") or 0) > 0]
    if not valides or not t.get("page_id"):
        return ""

    corps = [f"  v_page uuid := {_txt(t['page_id'])}::uuid;", "  v_tour uuid;"]
    instructions = []
    for circuit in valides:
        slug = _slug_circuit(t, circuit)
        transports = circuit.get("transports") or []
        instructions.append(
            f"  SELECT id INTO v_tour FROM public.tours WHERE slug = {_txt(slug)};\n"
            f"  IF v_tour IS NULL THEN\n"
            f"    INSERT INTO public.tours (page_id, slug, title, summary, description,"
            f" duration_days, duration_nights, start_place_id, transports, photos)\n"
            f"    VALUES (v_page, {_txt(slug)}, {_txt(circuit['titre'][:160])},"
            f" {_txt((circuit.get('resume') or '')[:280] or None)},"
            f" {_txt(circuit.get('resume'))},"
            f" {int(circuit['jours'])},"
            f" {int(circuit['nuits']) if circuit.get('nuits') else 'NULL'},"
            f" {(_txt(circuit['depart_id']) + '::uuid') if circuit.get('depart_id') else 'NULL'},"
            f" {_tableau(transports)}, '{{}}'::text[])\n"
            f"    RETURNING id INTO v_tour;\n"
            f"  END IF;"
        )
        if circuit.get("prix_ar"):
            instructions.append(
                f"  INSERT INTO public.tour_prices (tour_id, base_pax, price_ar, price_unit)"
                f" VALUES (v_tour,"
                f" {int(circuit['base_personnes']) if circuit.get('base_personnes') else 'NULL'},"
                f" {int(circuit['prix_ar'])},"
                f" {_txt(circuit.get('prix_unite') or 'personne')});"
            )
    return ("DO $$\nDECLARE\n" + "\n".join(corps) + "\nBEGIN\n"
            + "\n".join(instructions) + "\nEND $$;")


def _tableau(valeurs: list[str]) -> str:
    if not valeurs:
        return "'{}'::text[]"
    dedans = ", ".join("'" + str(v).replace("'", "''") + "'" for v in valeurs)
    return f"ARRAY[{dedans}]::text[]"


def _slug_circuit(t: dict, circuit: dict) -> str:
    from .publication import _slug

    morceaux = [circuit["titre"], str(circuit.get("jours") or ""), (t.get("page_nom") or "")]
    return _slug(" ".join(m for m in morceaux if m))[:60]


def appliquer(t: dict, medias: list[dict]) -> dict:
    """Écrit tout ce qui peut l'être ailleurs. Rend ce qui a été posé.

    `medias` sont les photos DÉJÀ envoyées sur o2switch par la publication
    principale : on ne les renvoie pas une seconde fois, on réutilise leurs
    adresses. Envoyer deux fois la même image doublerait l'espace disque pour
    rien.
    """
    if not medias and not t.get("lignes_circuit"):
        return {}

    couverture = medias[0]["url"] if medias else None
    credit = (t.get("auteur") or t.get("source_nom") or "Facebook").strip()
    provenance = t.get("permalien") or t.get("site_web") or SITE
    requetes, poses = [], {}

    site = t.get("_site") or diako.rapprocher_site(
        t.get("texte") or "", t.get("lieu_id")
    )

    if couverture and t.get("lieu_id"):
        requetes.append(_sql_photo("places", "cover_url", t["lieu_id"],
                                   couverture, credit, provenance))
        poses["destination"] = t.get("lieu_nom") or t["lieu_id"]

    if couverture and site and not site.get("a_photo"):
        requetes.append(_sql_photo("attractions", "cover_url", site["id"],
                                   couverture, credit, provenance))
        poses["site"] = site["nom"]

    if couverture and t.get("plat_id"):
        requetes.append(_sql_photo("dishes", "photo_url", t["plat_id"],
                                   couverture, credit, provenance))
        poses["plat"] = t.get("plat_nom") or t["plat_id"]

    circuits = bdd.circuits_a_publier(t["id"])
    sql_circuits = _sql_circuits(t, circuits)
    if sql_circuits:
        requetes.append(sql_circuits)
        poses["circuits"] = len([c for c in circuits if (c.get("jours") or 0) > 0])

    if not requetes:
        return {}

    # ⚠ UN ÉCHEC ICI NE DOIT PAS DÉFAIRE LA PUBLICATION PRINCIPALE. La fiche est
    #   déjà en ligne ; si la photo de la destination ne passe pas, on le dit et
    #   on continue. L'inverse — perdre une fiche publiée à cause d'un
    #   enrichissement — serait absurde.
    try:
        diako.executer_sql("\n".join(requetes))
    except Exception as e:
        bdd.logguer(f"Enrichissement partiel ou raté : {e}", "avert")
        return {}

    if poses:
        detail = ", ".join(
            f"{quoi} « {valeur} »" if isinstance(valeur, str) else f"{valeur} {quoi}"
            for quoi, valeur in poses.items()
        )
        bdd.logguer(f"Rempli au passage : {detail}.", "succes")
    return poses


def resume_texte(poses: dict) -> str:
    """La phrase que l'interface affiche après une publication."""
    if not poses:
        return ""
    return redaction.nettoyer(", ".join(f"{k} : {v}" for k, v in poses.items()))
