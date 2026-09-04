"""Publication d'une trouvaille vers Diako.

Chaîne : redimension 1600 px q86 -> envoi o2switch (pacing 3 s) -> écriture SQL
via l'API Management. Les photos ne vont JAMAIS sur Supabase Storage : c'est ce
seul point qui fait la différence entre ~70 Ko et ~1,2 Mo d'egress par visite.

QUATRE DESTINATIONS, selon le genre de la trouvaille :

  · établissement rattaché  -> UPDATE public.pages **sans jamais écraser**
  · établissement nouveau   -> INSERT public.pages (+ équipements, + carte)
  · carte                   -> INSERT public.menu_sections / menu_items / menu_photos
  · événement               -> INSERT public.events
  · récit                   -> INSERT public.posts (compte Diako) + post_mentions

🔴 LA RÈGLE QUI GOUVERNE TOUT : ON N'ÉCRASE PAS. Les 3 356 fiches viennent
   d'imports (OSM, office du tourisme, Wikivoyage) ; certaines portent déjà un
   téléphone ou une description soignée. Une écriture de bot qui remplace une
   donnée humaine est une perte silencieuse. Toutes les colonnes passent donc
   par `coalesce(existant, nouveau)` — le bot ne remplit que les trous.
"""
from __future__ import annotations

import io
import json
import re
import subprocess
import tempfile
import time
import unicodedata
import uuid
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

from . import base as bdd
from . import diako, enrichissement, redaction
from .config import (
    API_UPLOAD,
    AUTEUR_DIAKO,
    DOSSIER_TROUVAILLES,
    SITE,
    charger,
    cle_upload,
)

BOCAL = Path(tempfile.gettempdir()) / "o2s-diako-bot.jar"


class ErreurPublication(Exception):
    pass


# ── Photos ──────────────────────────────────────────────────────────────────
def _preparer(chemin: Path, cfg: dict) -> tuple[bytes, tuple[int, int]]:
    """Redimensionne et compresse. Le serveur fabrique ensuite 480/960/1600."""
    with Image.open(chemin) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        cote_max = int(cfg.get("cote_photo_max", 1600))
        if max(img.size) > cote_max:
            img.thumbnail((cote_max, cote_max), Image.LANCZOS)
        tampon = io.BytesIO()
        img.save(tampon, "JPEG", quality=int(cfg.get("qualite_photo", 86)),
                 optimize=True, progressive=True)
        return tampon.getvalue(), img.size


def _envoyer(octets: bytes, dossier_distant: str, nom_distant: str, cle: str) -> dict:
    """Envoi multipart. Le serveur rend l'URL publique et ses variantes.

    🔴 POURQUOI CURL ET PAS `requests`. o2switch place « Tiger Protect » devant
       le site : le premier POST reçoit un 307 assorti d'un cookie `o2s-chl`, et
       seule la requête qui rejoue ce cookie atteint PHP. Sans bocal à cookies,
       on obtient un 406 ou une réponse vide — jamais une erreur qui nomme la
       cause. (Leçon de scripts/photos_archives.py.)

    ⚠ PAS DE `--post307` : cette option n'existe pas, curl la refuse et rend une
      sortie VIDE — un échec muet difficile à distinguer d'un serveur muet.
    """
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as fichier:
        fichier.write(octets)
        temporaire = fichier.name
    try:
        processus = subprocess.run(
            ["curl", "-s", "-S", "-L", "--post301", "--post302", "--post303",
             "-c", str(BOCAL), "-b", str(BOCAL), "--max-time", "180",
             "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
             "-H", "X-API-Key: " + cle,
             "-F", "folder=" + dossier_distant,
             "-F", "filename=" + nom_distant,
             "-F", "file=@" + temporaire.replace("\\", "/") + ";type=image/jpeg",
             API_UPLOAD],
            capture_output=True, timeout=300,
        )
        sortie = processus.stdout.decode("utf-8", "replace").strip()
        if not sortie.startswith("{"):
            raise ErreurPublication(
                f"Envoi refusé ({nom_distant}) — curl {processus.returncode} : "
                f"{processus.stderr.decode('utf-8', 'replace').strip()[:200]} | {sortie[:200]}"
            )
        reponse = json.loads(sortie)
        if not reponse.get("success") or not reponse.get("url"):
            raise ErreurPublication(
                f"Envoi refusé ({nom_distant}) : {reponse.get('error', 'échec inconnu')}"
            )
        return reponse
    finally:
        try:
            Path(temporaire).unlink()
        except OSError:
            pass


def _slug(texte: str, longueur: int = 60) -> str:
    """Identifiant d'URL. Le serveur d'envoi refuse tout hors [A-Za-z0-9._/-]."""
    sans = "".join(
        c for c in unicodedata.normalize("NFD", texte or "")
        if unicodedata.category(c) != "Mn"
    )
    propre = re.sub(r"[^a-zA-Z0-9]+", "-", sans).strip("-").lower()
    return (propre or "sans-nom")[:longueur].strip("-")


def envoyer_photos(t: dict, dossier_distant: str, prefixe: str,
                   rappel=None, seulement_la_carte: bool = False) -> list[dict]:
    """Envoie les photos gardées et rend [{url, w, h}].

    ⚠ LE JOURNAL EST RÉÉCRIT APRÈS CHAQUE PHOTO. Une coupure au milieu d'un lot
      ne doit pas tout faire recommencer — ni, surtout, créer des doublons de
      fichiers sur le serveur.
    """
    cfg = charger()
    cle = cle_upload()
    dossier = DOSSIER_TROUVAILLES.parent / t["dossier"]
    journal = dossier / "_photos_envoyees.json"
    deja: dict = json.loads(journal.read_text(encoding="utf-8")) if journal.exists() else {}

    photos = bdd.photos_a_publier(t["id"])
    # ⚠ PAS DE REPLI SUR « toutes les photos » quand aucune n'est libre. Une
    #   fiche dont la seule image est la photo d'une carte papier ne doit PAS
    #   prendre cette carte en couverture : mieux vaut une fiche sans photo
    #   qu'une fiche illustrée par un menu illisible en vignette.
    if seulement_la_carte:
        photos = [p for p in photos if p.get("est_la_carte")]
    else:
        photos = [p for p in photos if not p.get("est_la_carte")]
    if not photos:
        return []

    envoyees: list[dict] = []
    for rang, photo in enumerate(photos, start=1):
        nom_distant = f"{prefixe}/{rang:02d}.jpg"
        if nom_distant in deja:
            envoyees.append(deja[nom_distant])
            continue
        source = dossier / photo["fichier"]
        if not source.exists():
            bdd.logguer(f"Photo introuvable sur le disque : {source.name}", "avert")
            continue
        octets, taille = _preparer(source, cfg)
        reponse = _envoyer(octets, dossier_distant, nom_distant, cle)
        media = {"url": reponse["url"], "w": taille[0], "h": taille[1]}
        envoyees.append(media)
        deja[nom_distant] = media
        journal.write_text(json.dumps(deja, ensure_ascii=False, indent=2), encoding="utf-8")
        bdd.modifier_photo(photo["id"], url_o2=reponse["url"])
        if rappel:
            rappel(rang, len(photos))
        time.sleep(float(cfg["pause_entre_envois_photos"]))
    return envoyees


# ── Écriture SQL ────────────────────────────────────────────────────────────
def _txt(valeur) -> str:
    if valeur is None or valeur == "":
        return "NULL"
    return "'" + str(valeur).replace("'", "''") + "'"


def _num(valeur) -> str:
    if valeur in (None, ""):
        return "NULL"
    try:
        return str(int(float(str(valeur).replace(" ", "").replace(" ", ""))))
    except (TypeError, ValueError):
        # Une valeur illisible ne fait pas échouer la publication entière.
        return "NULL"


def _bool(valeur) -> str:
    return "true" if valeur else "false"


def _tableau(valeurs: list[str], type_sql: str = "text") -> str:
    if not valeurs:
        return f"'{{}}'::{type_sql}[]"
    dedans = ", ".join("'" + str(v).replace("'", "''") + "'" for v in valeurs)
    return f"ARRAY[{dedans}]::{type_sql}[]"


def _jsonb(valeur) -> str:
    return "'" + json.dumps(valeur, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def _url(valeur) -> str:
    """Une adresse web, ou NULL. Jamais autre chose.

    🔴 `pages.website` ET `pages.facebook` PORTENT UNE CONTRAINTE : elles
       doivent commencer par `http://` ou `https://`. Le modèle rend volontiers
       « www.excursion-djema-forest.com » tout court, et l'INSERT ENTIER
       échouait alors sur `pages_website_http` — la fiche, ses photos et sa
       carte partaient avec. Vu trois fois en production le 23/08/2026.

    ⚠ Une valeur qui n'est pas une adresse (une adresse e-mail, un numéro, un
      nom de page) est écartée plutôt que préfixée : « https://Chez Mariette »
      passerait la contrainte tout en étant faux.
    """
    texte = (str(valeur or "")).strip()
    if not texte:
        return "NULL"
    if texte.startswith(("http://", "https://")):
        propre = texte
    elif re.match(r"^[\w.-]+\.[a-z]{2,}(/|$)", texte, re.I):
        propre = "https://" + texte
    else:
        return "NULL"
    return _txt(propre[:400])


# 🔴 LES TROIS TABLES N'ACCEPTENT PAS LES MÊMES UNITÉS, et la contrainte ne
#    pardonne pas : `posts.price_unit` refuse « plat » (il veut « portion »),
#    `menu_items.price_unit` refuse « personne ». Découvert en jouant les
#    INSERT dans une transaction annulée avant la première publication — c'est
#    exactement à ça que sert cet essai à blanc.
UNITES_POST = {
    "nuit": "nuit", "plat": "portion", "portion": "portion", "personne": "personne",
    "jour": "jour", "chambre": "chambre", "circuit": "personne", "entree": "entree",
    "groupe": "groupe", "vehicule": "vehicule", "trajet": "trajet",
}
UNITES_CARTE = {"portion", "2_personnes", "kg", "part", "verre"}


def _unite_post(unite: str | None) -> str | None:
    return UNITES_POST.get((unite or "").strip().lower())


def _unite_carte(unite: str | None) -> str:
    propre = (unite or "").strip().lower()
    return propre if propre in UNITES_CARTE else "portion"


def _slug_libre(table: str, propose: str) -> str:
    """Un slug qui n'existe pas encore. Deux « Chez Mariette » sont fréquents."""
    propose = propose or "fiche"
    lignes = diako.executer_sql(
        f"SELECT slug FROM public.{table} WHERE slug = {_txt(propose)} "
        f"OR slug LIKE {_txt(propose + '-%')}"
    )
    pris = {l["slug"] for l in lignes}
    if propose not in pris:
        return propose
    for suffixe in range(2, 60):
        candidat = f"{propose}-{suffixe}"
        if candidat not in pris:
            return candidat
    return f"{propose}-{uuid.uuid4().hex[:6]}"


# ── Fiche d'établissement ───────────────────────────────────────────────────
def _sql_creer_page(t: dict, page_id: str, slug: str, medias: list[dict]) -> str:
    couverture = medias[0]["url"] if medias else None
    galerie = [m["url"] for m in medias[1:]]
    colonnes = {
        "id": f"{_txt(page_id)}::uuid",
        "slug": _txt(slug),
        "name": _txt(t.get("nom_etab")),
        "categories": _tableau(t.get("categories") or []),
        "short_desc": _txt((t.get("resume") or "")[:280]),
        "long_desc": _txt(t.get("presentation")),
        "place_id": f"{_txt(t.get('lieu_id'))}::uuid" if t.get("lieu_id") else "NULL",
        "address": _txt(t.get("adresse")),
        "landmark": _txt(t.get("repere")),
        "phone": _txt(t.get("telephone")),
        "whatsapp": _txt(t.get("whatsapp")),
        "email": _txt(t.get("email")),
        "website": _url(t.get("site_web")),
        "facebook": _url(t.get("page_facebook")),
        "cover_url": _txt(couverture),
        "gallery": _jsonb(galerie),
        "source": _txt(redaction.source_pour_base(t)),
        "is_published": _bool(charger().get("publier_directement", True)),
    }
    return (
        f"INSERT INTO public.pages ({', '.join(colonnes)}) "
        f"VALUES ({', '.join(colonnes.values())});"
    )


def _sql_completer_page(t: dict, page_id: str, medias: list[dict]) -> str:
    """UPDATE qui ne remplit QUE les trous.

    ⚠ Chaque colonne passe par `coalesce` ou par une condition explicite. Sans
      ça, une fiche renseignée par l'office du tourisme d'Ampefy serait écrasée
      par une lecture de publication Facebook.
    """
    couverture = medias[0]["url"] if medias else None
    galerie = [m["url"] for m in medias[1:]] if medias else []
    source = redaction.source_pour_base(t)

    # 🔴 UNE COLONNE DONT ON N'A RIEN À DIRE N'ENTRE PAS DANS LE `SET`.
    #    `coalesce(phone, NULL)` est inoffensif, mais
    #    `short_desc = CASE WHEN length(short_desc) < 20 THEN NULL ELSE … END`
    #    EFFACERAIT une description de quinze caractères posée à la main. Le
    #    « on n'écrase pas » se joue ici, pas dans le commentaire.
    morceaux = []
    for colonne, valeur, formate in (
        ("phone", t.get("telephone"), _txt),
        ("whatsapp", t.get("whatsapp"), _txt),
        ("email", t.get("email"), _txt),
        # ⚠ `website` et `facebook` passent par `_url` : la base refuse une
        #   adresse sans `http://`, et l'UPDATE entier échouerait avec elle.
        ("website", t.get("site_web"), _url),
        ("facebook", t.get("page_facebook"), _url),
        ("address", t.get("adresse"), _txt),
        ("landmark", t.get("repere"), _txt),
    ):
        if not valeur:
            continue
        pose = formate(valeur)
        if pose == "NULL":
            continue
        morceaux.append(f"{colonne} = coalesce({colonne}, {pose})")

    if t.get("lieu_id"):
        morceaux.append(f"place_id = coalesce(place_id, {_txt(t['lieu_id'])}::uuid)")

    # 🔴 SEULEMENT SI C'EST VIDE. L'ancien seuil « moins de 20 caractères »
    #    REMPLAÇAIT une description courte posée à la main (« Chez Mariette »,
    #    « Lodge d'Ampefy ») par le résumé du modèle, sans rien dire — c'est
    #    exactement la perte silencieuse que le commentaire au-dessus interdit.
    if (t.get("resume") or "").strip():
        morceaux.append(
            f"short_desc = CASE WHEN coalesce(length(trim(short_desc)), 0) = 0 "
            f"THEN {_txt(t['resume'][:280])} ELSE short_desc END"
        )
    if (t.get("presentation") or "").strip():
        morceaux.append(
            f"long_desc = CASE WHEN coalesce(length(trim(long_desc)), 0) = 0 "
            f"THEN {_txt(t['presentation'])} ELSE long_desc END"
        )

    # `source` s'ajoute, elle ne remplace pas : la provenance d'origine reste.
    morceaux.append(
        f"source = CASE WHEN source IS NULL THEN {_txt(source)} "
        f"WHEN position('Facebook' in source) > 0 THEN source "
        f"ELSE source || ' · ' || {_txt(source)} END"
    )
    if couverture:
        morceaux.append(f"cover_url = coalesce(cover_url, {_txt(couverture)})")
    if galerie:
        # La galerie s'allonge, sans jamais reprendre une URL déjà présente.
        morceaux.append(
            f"gallery = gallery || (SELECT coalesce(jsonb_agg(u), '[]'::jsonb) "
            f"FROM jsonb_array_elements({_jsonb(galerie)}) u "
            f"WHERE NOT (gallery @> jsonb_build_array(u)))"
        )
    if t.get("categories"):
        # Les catégories s'ajoutent : un hôtel qui se révèle aussi restaurant
        # doit apparaître dans les deux recherches.
        morceaux.append(
            f"categories = ARRAY(SELECT DISTINCT unnest(categories || "
            f"{_tableau(t['categories'])}))"
        )
    return f"UPDATE public.pages SET {', '.join(morceaux)} WHERE id = {_txt(page_id)}::uuid;"


def _sql_equipements(page_id: str, codes: list[str]) -> str:
    """Les équipements reconnus, filtrés par la table `amenities`.

    ⚠ Un code inventé serait refusé par la clé étrangère et ferait échouer TOUTE
      la transaction : on ne pose que ceux qui existent réellement.
    """
    if not codes:
        return ""
    return (
        f"INSERT INTO public.page_amenities (page_id, code) "
        f"SELECT {_txt(page_id)}::uuid, c FROM unnest({_tableau(codes)}) c "
        f"WHERE EXISTS (SELECT 1 FROM public.amenities a WHERE a.code = c) "
        f"ON CONFLICT DO NOTHING;"
    )


def _sql_carte(page_id: str, lignes: list[dict], releve_le: str) -> str:
    """Les lignes de carte, rangées sous leurs sections.

    ⚠ `releve_le` n'est pas décoratif : sur Diako, un prix sans date de relevé
      est un prix qui ment dès qu'il vieillit. La colonne existe pour ça.
    """
    if not lignes:
        return ""
    sections = []
    for ligne in lignes:
        nom = (ligne.get("section") or "").strip()
        if nom and nom not in sections:
            sections.append(nom)

    corps = [f"  v_page uuid := {_txt(page_id)}::uuid;", "  v_sec uuid;"]
    instructions = []
    for rang, section in enumerate(sections, start=1):
        instructions.append(
            f"  SELECT id INTO v_sec FROM public.menu_sections "
            f"WHERE page_id = v_page AND name = {_txt(section)} LIMIT 1;\n"
            f"  IF v_sec IS NULL THEN\n"
            f"    INSERT INTO public.menu_sections (page_id, name, sort_order) "
            f"VALUES (v_page, {_txt(section)}, {rang}) RETURNING id INTO v_sec;\n"
            f"  END IF;"
        )
        for ordre, ligne in enumerate(
            [l for l in lignes if (l.get("section") or "").strip() == section], start=1
        ):
            instructions.append(_insert_plat(ligne, "v_sec", ordre, releve_le))

    sans_section = [l for l in lignes if not (l.get("section") or "").strip()]
    for ordre, ligne in enumerate(sans_section, start=1):
        instructions.append(_insert_plat(ligne, "NULL", ordre, releve_le))

    # Balise de bloc nommée : un « $$ » dans un nom de plat ou de chambre
    # fermerait un bloc `DO $$` avant l'heure et perdrait tout le lot.
    return ("DO $diako_bot$\nDECLARE\n" + "\n".join(corps) + "\nBEGIN\n"
            + "\n".join(instructions) + "\nEND $diako_bot$;")


def _insert_plat(ligne: dict, section_sql: str, ordre: int, releve_le: str) -> str:
    return (
        f"  INSERT INTO public.menu_items (page_id, section_id, name, dish_id, "
        f"description, price_ar, price_unit, releve_le, sort_order) VALUES "
        f"(v_page, {section_sql}, {_txt(ligne['nom'])}, "
        f"{(_txt(ligne['plat_id']) + '::uuid') if ligne.get('plat_id') else 'NULL'}, "
        f"{_txt(ligne.get('description'))}, {_num(ligne.get('prix_ar'))}, "
        f"{_txt(_unite_carte(ligne.get('unite')))}, {_txt(releve_le)}::date, {ordre});"
    )


def _sql_chambres(page_id: str, lignes: list[dict], releve_le: str) -> str:
    """Les types de chambre, et leurs tarifs de saison quand le site en donne.

    🔴 `room_types.base_price_ar` EST `NOT NULL` : une chambre sans prix ne
       s'insère pas. On l'écarte au lieu de lui inventer un tarif — c'est
       exactement le cas que la règle « aucune donnée inventée » vise.

    ⚠ UN HÔTEL N'A PAS *UN* PRIX (migration 0007). Deux lignes portant le même
      nom de chambre ne sont pas un doublon : ce sont deux saisons. On crée
      alors UN type de chambre, au prix le plus bas, et autant de
      `season_rates` que de saisons nommées. Les fondre en deux chambres
      distinctes ferait apparaître « Bungalow vue mer » deux fois sur la fiche.
    """
    chiffrees = [l for l in lignes if l.get("prix_ar")]
    if not chiffrees:
        return ""

    groupes: dict[str, list[dict]] = {}
    for ligne in chiffrees:
        groupes.setdefault(ligne["nom"].strip().lower(), []).append(ligne)

    corps = [f"  v_page uuid := {_txt(page_id)}::uuid;", "  v_chambre uuid;"]
    instructions = []
    for rang, (_, lot) in enumerate(groupes.items(), start=1):
        reference = min(lot, key=lambda l: l["prix_ar"])
        unite = "personne" if reference.get("unite") == "personne" else "chambre"
        instructions.append(
            f"  INSERT INTO public.room_types (page_id, name, description, max_adults,"
            f" private_bath, hot_water, view, base_price_ar, price_unit, releve_le,"
            f" sort_order) VALUES (v_page, {_txt(reference['nom'])},"
            f" {_txt(reference.get('description'))}, {_num(reference.get('capacite'))},"
            f" {_bool(reference.get('sdb_privee', True))},"
            f" {_bool(reference.get('eau_chaude'))}, {_txt(reference.get('vue'))},"
            f" {_num(reference['prix_ar'])}, {_txt(unite)}, {_txt(releve_le)}::date,"
            f" {rang}) RETURNING id INTO v_chambre;"
        )
        saisons = [l for l in lot if (l.get("saison") or "").strip()]
        for saison in saisons:
            instructions.append(
                f"  INSERT INTO public.season_rates (room_type_id, season_label,"
                f" price_ar, price_unit, checked_at) VALUES (v_chambre,"
                f" {_txt(saison['saison'][:120])}, {_num(saison['prix_ar'])},"
                f" {_txt('personne' if saison.get('unite') == 'personne' else 'chambre')},"
                f" {_txt(releve_le)}::timestamptz);"
            )

    # Balise de bloc nommée : un « $$ » dans un nom de plat ou de chambre
    # fermerait un bloc `DO $$` avant l'heure et perdrait tout le lot.
    return ("DO $diako_bot$\nDECLARE\n" + "\n".join(corps) + "\nBEGIN\n"
            + "\n".join(instructions) + "\nEND $diako_bot$;")


# Les valeurs de la contrainte `vehicle_offers_vehicle_type` (migration 0114).
# Un type hors liste ferait échouer l'INSERT ENTIER : on le ramène à 'autre'.
TYPES_VEHICULE_SQL = {"4x4", "berline", "citadine", "minibus", "van", "moto",
                      "quad", "bateau", "velo", "camion", "autre"}


def _sql_vehicules(t: dict, page_id: str, lignes: list[dict], releve_le: str) -> str:
    """La grille d'un loueur -> `public.vehicle_offers`.

    ⚠ `price_day_ar` est NULLABLE en prod (contrairement aux chambres) : une
      offre sans prix mais avec un modèle ou une note entre quand même — c'est
      une fiche de flotte, pas un tarif inventé. `price_on` ne part QU'AVEC un
      prix : dater un tarif absent ne veut rien dire.

    ⚠ `with_driver` a un défaut en base (true). Quand le texte ne dit rien, on
      écrit DEFAULT et on laisse la base trancher — écrire `true` nous-mêmes
      serait affirmer ce qu'on n'a pas lu.
    """
    gardees = [l for l in lignes
               if l.get("prix_jour_ar") or l.get("modele") or l.get("note_prix")]
    if not gardees:
        return ""
    source = redaction.source_pour_base(t)
    requetes = []
    for rang, ligne in enumerate(gardees, start=1):
        type_v = (ligne.get("type_vehicule") or "autre").strip().lower()
        if type_v not in TYPES_VEHICULE_SQL:
            type_v = "autre"
        avec = ligne.get("avec_chauffeur")
        carburant = ligne.get("carburant_inclus")
        prix = ligne.get("prix_jour_ar")
        requetes.append(
            f"INSERT INTO public.vehicle_offers (page_id, vehicle_type, model,"
            f" seats, with_driver, fuel_included, km_included_per_day,"
            f" price_day_ar, price_note, deposit_ar, price_on, source,"
            f" sort_order) VALUES ({_txt(page_id)}::uuid, {_txt(type_v)},"
            f" {_txt(ligne.get('modele'))}, {_num(ligne.get('places'))},"
            f" {'DEFAULT' if avec is None else _bool(avec)},"
            f" {'NULL' if carburant is None else _bool(carburant)},"
            f" {_num(ligne.get('km_par_jour'))}, {_num(prix)},"
            f" {_txt(ligne.get('note_prix'))}, {_num(ligne.get('caution_ar'))},"
            f" {(_txt(releve_le) + '::date') if prix else 'NULL'},"
            f" {_txt(source)}, {rang});"
        )
    return "\n".join(requetes)


def _sql_photos_de_carte(page_id: str, medias: list[dict]) -> str:
    """La carte photographiée, gardée telle quelle.

    Mode dégradé indispensable et assumé par le schéma : photographier une carte
    prend trente secondes, la saisir prend une soirée. Les deux coexistent.
    """
    if not medias:
        return ""
    valeurs = ", ".join(
        f"({_txt(page_id)}::uuid, {_txt(m['url'])}, {rang})"
        for rang, m in enumerate(medias, start=1)
    )
    return f"INSERT INTO public.menu_photos (page_id, url, sort_order) VALUES {valeurs};"


# ── Événement ───────────────────────────────────────────────────────────────
def _sql_evenement(t: dict, evt_id: str, slug: str, medias: list[dict]) -> str:
    debut = t.get("evt_debut")
    mois = []
    if debut:
        try:
            mois = [int(debut[5:7])]
        except ValueError:
            mois = []
    colonnes = {
        "id": f"{_txt(evt_id)}::uuid",
        "slug": _txt(slug),
        "title": _txt(t.get("titre")),
        "kind": _txt(t.get("evt_genre") or "culturel"),
        "place_id": f"{_txt(t.get('lieu_id'))}::uuid" if t.get("lieu_id") else "NULL",
        "page_id": f"{_txt(t.get('page_id'))}::uuid" if t.get("page_id") else "NULL",
        "starts_on": f"{_txt(debut)}::date",
        "ends_on": f"{_txt(t.get('evt_fin'))}::date" if t.get("evt_fin") else "NULL",
        "yearly": _bool(t.get("evt_recurrent")),
        "recurrent": _bool(t.get("evt_recurrent")),
        "mois": _tableau([str(m) for m in mois], "smallint"),
        "summary": _txt(redaction.resume_evenement(t)),
        "description": _txt(redaction.nettoyer(t.get("texte") or "")[:3000]),
        "poster_url": _txt(medias[0]["url"] if medias else None),
        "poster_credit": _txt((t.get("auteur") or t.get("source_nom") or "")[:200]),
        "poster_licence": _txt("Publication Facebook — reprise avec attribution"),
        "poster_source": _txt(t.get("permalien")),
        "price_ar": _num(t.get("prix_ar")),
        "price_unit": _txt(_unite_post(t.get("prix_unite"))
                           or ("personne" if t.get("prix_ar") else None)),
        "organizer": _txt(t.get("organisateur")),
        "lieu_libre": _txt(t.get("lieu_texte")),
        "source": _txt(redaction.source_pour_base(t)),
        # ⚠ « incertaine » pour tout ce qui vient de Facebook : une date lue
        #   dans une publication n'a pas la valeur d'un calendrier officiel, et
        #   le site affiche cette nuance. Avant le 02/09/2026 le code écrivait
        #   « certaine » dès qu'il y avait une date — c'est-à-dire toujours,
        #   puisque la date est obligatoire pour publier.
        "confiance": _txt("certaine" if t.get("source_genre") == "site" else "incertaine"),
        "is_published": _bool(charger().get("publier_directement", True)),
    }
    return (
        f"INSERT INTO public.events ({', '.join(colonnes)}) "
        f"VALUES ({', '.join(colonnes.values())});"
    )


# ── Récit ───────────────────────────────────────────────────────────────────
def _sql_recit(t: dict, post_id: str, medias: list[dict]) -> str:
    # ⚠ LE PRIX NE VOYAGE JAMAIS SEUL, et la base l'impose (contrainte
    #   `posts_prix_complet`). Un montant dont on n'a pas su lire l'unité n'est
    #   pas publiable : on le laisse tomber plutôt que d'inventer « par
    #   personne ». Le montant reste visible dans le bot, pour reprise à la main.
    unite = _unite_post(t.get("prix_unite"))
    montant = t.get("prix_ar") if unite else None
    if t.get("prix_ar") and not unite:
        bdd.logguer(
            f"Prix de {t['prix_ar']} Ar non publié : unité inconnue. Le récit part "
            "sans prix — complétez l'unité et republiez si besoin.", "avert",
        )

    colonnes = {
        "id": f"{_txt(post_id)}::uuid",
        "author_id": f"{_txt(AUTEUR_DIAKO)}::uuid",
        "kind": _txt(t.get("post_genre") or "recit"),
        "body": _txt(t.get("corps")),
        "media": _jsonb([{"url": m["url"], "w": m["w"], "h": m["h"]} for m in medias]),
        # Les trois tags de Diako : lieu · établissement · plat.
        "place": _txt(t.get("lieu_nom") or t.get("lieu_texte")),
        "place_id": f"{_txt(t.get('lieu_id'))}::uuid" if t.get("lieu_id") else "NULL",
        "dish": _txt(t.get("plat_nom")),
        "dish_id": f"{_txt(t.get('plat_id'))}::uuid" if t.get("plat_id") else "NULL",
        "page_name": _txt(t.get("page_nom") or t.get("nom_etab")),
        # Le prix ne voyage jamais seul : montant + unité + date de relevé.
        "price_ar": _num(montant),
        "price_unit": _txt(unite),
        "price_on": f"{_txt(t.get('prix_vu_le'))}::date"
        if (t.get("prix_vu_le") and montant) else "NULL",
        # `publier_directement` gouverne aussi les récits : « hidden » (la
        # contrainte n'a pas de brouillon) tant qu'on ne veut pas les voir.
        "status": _txt("published" if charger().get("publier_directement", True) else "hidden"),
        "visibilite": _txt("public"),
    }
    sql = (
        f"INSERT INTO public.posts ({', '.join(colonnes)}) "
        f"VALUES ({', '.join(colonnes.values())});"
    )
    if t.get("page_id"):
        sql += (
            f"\nINSERT INTO public.post_mentions (post_id, page_id) VALUES "
            f"({_txt(post_id)}::uuid, {_txt(t['page_id'])}::uuid) ON CONFLICT DO NOTHING;"
        )
    return sql


# ── Orchestration ───────────────────────────────────────────────────────────
EXIGENCES = {
    # ⚠ Une carte SANS fiche rattachée peut désormais créer la sienne, comme
    #   un établissement : 46 cartes lues (473 lignes) dormaient faute de
    #   rattachement, alors que le nom et le lieu étaient là (02/09/2026).
    "carte": (),
    "evenement": (("titre", "titre"), ("evt_debut", "date de début")),
    "recit": (("corps", "texte du récit"),),
}


def completer_lieu(t: dict) -> bool:
    """Hérite le lieu du rattachement (fiche ou site) et l'ENREGISTRE.

    ⭐ LE REPLI VAUT AUSSI POUR CE QUI EST DÉJÀ EN BASE. 85 trouvailles
       collectées AVANT le repli dorment en « incomplète » avec pour seul
       manque le lieu — alors que leur fiche ou leur parc rattaché le connaît.
       Rejouer la collecte ne les rattraperait pas ; ce contrôle, appelé à
       chaque vérification de publication, si.

    Le lieu hérité est écrit dans la trouvaille (traçé dans le journal), le
    badge « lieu ? » retiré, et une « incomplète » que plus rien ne bloque
    redevient « à trier ». Rend True si un lieu a été hérité.
    """
    if t.get("lieu_id"):
        return False
    repli = diako.lieu_par_repli(t)
    if not repli:
        return False

    t["lieu_id"], t["lieu_nom"], t["lieu_score"] = repli["id"], repli["nom"], None
    champs = {"lieu_id": repli["id"], "lieu_nom": repli["nom"], "lieu_score": None}

    # Le manque « lieu » n'en est plus un ; et si c'était le seul bloquant,
    # le statut « incomplète » ne se justifie plus.
    manques = [m for m in (t.get("manques") or []) if m != "lieu"]
    if manques != (t.get("manques") or []):
        t["manques"] = manques
        champs["manques"] = manques
        bloquants_restants = [m for m in manques
                              if m in ("lieu", "établissement", "date", "photo")]
        if t.get("statut") == "incomplete" and not bloquants_restants:
            t["statut"] = "a_trier"
            champs["statut"] = "a_trier"

    if t.get("id"):
        bdd.modifier(t["id"], champs)
    bdd.logguer(
        f"Lieu hérité de {repli['origine']} : « {repli['nom'] or repli['id']} » "
        f"— trouvaille débloquée.", "info",
    )
    return True


def manque_pour_publier(t: dict) -> list[str]:
    """Ce qui bloque, exprimé comme l'interface l'affiche — avant le clic.

    ⚠ LES EXIGENCES DIFFÈRENT SELON QU'ON CRÉE OU QU'ON COMPLÈTE. Créer une
      fiche sans lieu la rend introuvable : c'est bloquant. Compléter une fiche
      existante avec une photo, alors que son lieu est déjà posé en base, ne
      l'est pas — l'exiger empêcherait le geste le plus utile du bot.
    """
    # Le repli du lieu se tente AVANT de compter les manques : une trouvaille
    # rattachée à une fiche ou à un parc connaît son lieu par héritage.
    completer_lieu(t)
    genre = t.get("genre") or "recit"
    manques = [
        libelle for champ, libelle in EXIGENCES.get(genre, ()) if not t.get(champ)
    ]
    if genre in ("etablissement", "carte") and not t.get("page_id"):
        if not t.get("nom_etab"):
            manques.append("nom de l'établissement")
        if not t.get("lieu_id"):
            manques.append("lieu du référentiel")
    if genre == "carte" and not bdd.lignes_a_publier(t["id"]):
        manques.append("au moins un plat")
    if genre == "evenement":
        debut = t.get("evt_debut") or ""
        try:
            jour_debut = date.fromisoformat(debut[:10])
        except ValueError:
            jour_debut = None
            manques.append("date de début lisible")
        fin = t.get("evt_fin") or ""
        try:
            jour_fin = date.fromisoformat(fin[:10]) if fin else None
        except ValueError:
            jour_fin = None
        # Un événement passé ne se publie pas — sauf s'il revient chaque année.
        dernier = jour_fin or jour_debut
        if dernier and dernier < date.today() and not t.get("evt_recurrent"):
            manques.append("date déjà passée (ou cochez « revient chaque année »)")
    if genre == "recit":
        # Même filtre qu'à l'envoi : une photo marquée « carte » ne part pas en
        # galerie, donc ne compte pas comme photo du récit.
        libres = [p for p in bdd.photos_a_publier(t["id"]) if not p.get("est_la_carte")]
        if not libres:
            manques.append("au moins une photo")
    return manques


def publier(tid: str, rappel=None) -> dict:
    """Publie une trouvaille de bout en bout. Renvoie {table, id, lien}."""
    cfg = charger()
    t = bdd.trouvaille(tid)
    if not t:
        raise ErreurPublication("Trouvaille introuvable.")
    # ⚠ « Déjà publiée » se juge sur le LIEN, pas sur `cible_id` seul : un
    #   doublon d'événement portait l'identifiant de son jumeau dans
    #   `cible_id`, et une fois requalifié à la main il rendait « Déjà
    #   publiée : None » — sans issue depuis l'interface (14 lignes le 02/09/2026).
    if t.get("lien_diako") or t.get("statut") == "publiee":
        raise ErreurPublication(f"Déjà publiée : {t.get('lien_diako') or 'lien inconnu'}")

    manques = manque_pour_publier(t)
    if manques:
        raise ErreurPublication("À compléter avant publication : " + ", ".join(manques))

    genre = t["genre"]
    if genre in ("etablissement", "carte"):
        resultat = _publier_etablissement(t, cfg, rappel)
    elif genre == "evenement":
        resultat = _publier_evenement(t, rappel)
    elif genre == "recit":
        resultat = _publier_recit(t, rappel)
    else:
        raise ErreurPublication(f"Genre inconnu : {genre}")

    bdd.modifier(tid, {
        "statut": "publiee",
        "cible_table": resultat["table"],
        "cible_id": resultat["id"],
        "lien_diako": resultat["lien"],
        "publie_a": bdd.maintenant(),
    })

    # 🔴 ON RELIT CE QU'ON VIENT D'ÉCRIRE — sur TOUTES les voies (clic, lot,
    #    automate), pas seulement sur la route du bouton. Et on regarde si la
    #    ligne est VISIBLE : 333 fiches « publiées » étaient invisibles
    #    (`is_published = false` forcé par un déclencheur) sans qu'aucune
    #    vérification ne le dise.
    try:
        controle = verifier(resultat["table"], resultat["id"])
    except Exception as e:
        controle = {"trouve": None, "erreur": str(e)[:160]}
    if controle.get("trouve") is False:
        bdd.modifier(tid, {"note": "⚠ Écriture annoncée mais ligne introuvable en base."})
        bdd.logguer(
            f"⚠ Publication annoncée mais la ligne {resultat['table']}/{resultat['id'][:8]} "
            "est introuvable en base — à vérifier à la main.", "erreur",
        )
    elif controle.get("trouve") and cfg.get("publier_directement", True):
        visible = controle.get("is_published", controle.get("status") == "published")
        if visible is False:
            bdd.modifier(tid, {"note": "⚠ Écrite mais NON VISIBLE sur le site (is_published = false)."})
            bdd.logguer(
                f"⚠ {resultat['table']}/{resultat['id'][:8]} écrite mais non visible : "
                "is_published est resté à false. Le compte propriétaire n'a pas été "
                "reconnu par le déclencheur.", "erreur",
            )
    resultat["controle"] = controle

    # ⭐ ON NE PUBLIE PAS UNE FOIS, ON RANGE PARTOUT OÙ ÇA MANQUE. Un récit sur
    #   Nosy Komba partait sur le fil et laissait la destination sans photo ;
    #   une agence devenait une fiche et son circuit se perdait. Les mêmes
    #   photos, déjà envoyées, servent maintenant aussi la destination, le site
    #   et le plat — sans jamais écraser ce qui existe.
    # ⭐ LA SOURCE QUI A DONNÉ CETTE TROUVAILLE VIENT DE FAIRE SES PREUVES.
    #   Une publication en ligne vaut mieux que n'importe quel pronostic sur le
    #   nombre de membres d'un groupe : c'est ce compteur qui fait remonter les
    #   bonnes sources dans « Nouvelles sources ».
    if t.get("origine_cle"):
        bdd.compter_publication_source(t["origine_cle"])

    resultat["apports"] = enrichissement.appliquer(
        t, resultat.get("medias") or []
    )
    diako.oublier_cache()
    bdd.logguer(f"Publiée sur Diako : {resultat['lien']}", "succes")
    return resultat


def _publier_etablissement(t: dict, cfg: dict, rappel) -> dict:
    nouvelle = not t.get("page_id")
    page_id = t.get("page_id") or str(uuid.uuid4())
    if nouvelle:
        propose = _slug(f"{t.get('nom_etab')} {t.get('lieu_nom') or ''}".strip())
        slug = _slug_libre("pages", propose)
    else:
        # Le slug de la fiche visée est déjà dans le cache du référentiel : il
        # sert à ranger les photos sous un chemin lisible plutôt que sous un
        # morceau d'uuid.
        connues = [f for f in bdd.referentiel("ref_pages") if f["id"] == page_id]
        slug = (connues[0].get("slug") if connues else None) or page_id[:8]
    prefixe = _slug(slug)

    bdd.logguer(f"Publication de « {t.get('nom_etab') or t.get('titre')} » — photos…", "info")
    medias = envoyer_photos(t, "pages", f"fiches/{prefixe}", rappel)
    photos_carte = envoyer_photos(t, "pages", f"cartes/{prefixe}", rappel,
                                  seulement_la_carte=True)

    lignes = bdd.lignes_a_publier(t["id"])
    if not nouvelle and lignes:
        # Une carte se complète, elle ne se duplique pas : ce qui est déjà saisi
        # sur la fiche est retiré du lot.
        deja = diako.carte_deja_la(page_id, [l["nom"] for l in lignes])
        if deja:
            bdd.logguer(
                f"{len(deja)} plat(s) déjà présent(s) sur la fiche — non réinsérés.", "info"
            )
        lignes = [l for l in lignes if l["nom"] not in deja]

    chambres = bdd.chambres_a_publier(t["id"])
    remplacements = []
    if not nouvelle and chambres:
        # Une grille de tarifs se remplace, elle ne s'empile pas : republier le
        # site six mois plus tard doit corriger les prix, pas créer « Bungalow
        # vue mer » une deuxième fois. On retire les types de même nom, et leurs
        # tarifs de saison partent avec (ON DELETE CASCADE).
        # 🔴 ON NE RETIRE QUE CE QU'ON VA REPOSER : une chambre relue SANS prix
        #    n'est pas réinsérée (`_sql_chambres` l'écarte) — la supprimer
        #    effaçait un tarif existant, peut-être saisi à la main, sans rien
        #    remettre. 21 chambres sans prix étaient armées le 02/09/2026.
        #    Et le DELETE part DANS LE MÊME LOT que l'INSERT : un échec du lot
        #    ne laisse plus la fiche sans ses chambres.
        noms = [c["nom"] for c in chambres if c.get("prix_ar")]
        if noms:
            remplacements.append(
                f"DELETE FROM public.room_types WHERE page_id = {_txt(page_id)}::uuid "
                f"AND lower(name) = ANY({_tableau([n.strip().lower() for n in noms])});"
            )

    vehicules = bdd.vehicules_a_publier(t["id"])
    if not nouvelle and vehicules:
        # Une grille de loueur se REMPLACE, comme celle des chambres : relire la
        # même page six mois plus tard doit corriger le prix du « 4x4 Hilux »,
        # pas en empiler un deuxième. Même type + même modèle = même offre.
        # Même règle que les chambres : on ne retire que ce qu'on repose.
        cles = [
            f"{(v.get('type_vehicule') or 'autre').strip().lower()}"
            f"|{(v.get('modele') or '').strip().lower()}"
            for v in vehicules
            if v.get("prix_jour_ar") or v.get("modele") or v.get("note_prix")
        ]
        if cles:
            remplacements.append(
                f"DELETE FROM public.vehicle_offers WHERE page_id = {_txt(page_id)}::uuid "
                f"AND vehicle_type || '|' || lower(coalesce(model, '')) = "
                f"ANY({_tableau(sorted(set(cles)))});"
            )

    # ⚠ LE DERNIER RECOURS EST LA DATE DE COLLECTE, PLUS CELLE DU JOUR. Les
    #   colonnes `releve_le` de `menu_items`, `room_types` et `vehicle_offers`
    #   n'acceptent pas NULL : il faut bien une date. Mais « aujourd'hui »
    #   affirmait que le tarif venait d'être publié, alors que la publication
    #   peut dater de 2019 ; `collecte_le` dit seulement « c'est le jour où le
    #   bot a lu ce texte », ce qui est vrai. Depuis le 24/08/2026,
    #   `date_post` est vide quand la date de publication est inconnue.
    releve_le = (t.get("prix_vu_le") or t.get("date_post")
                 or (t.get("collecte_le") or "")[:10] or date.today().isoformat())
    requetes = [
        _sql_creer_page(t, page_id, slug, medias) if nouvelle
        else _sql_completer_page(t, page_id, medias),
        _sql_equipements(page_id, t.get("equipements") or []),
        _sql_carte(page_id, lignes, releve_le),
        *remplacements,
        _sql_chambres(page_id, chambres, releve_le),
        _sql_vehicules(t, page_id, vehicules, releve_le),
        _sql_photos_de_carte(page_id, photos_carte),
    ]
    diako.executer_sql("\n".join(r for r in requetes if r), proprietaire=True)
    if remplacements:
        bdd.logguer(
            "Grille de tarifs remplacée par les tarifs relevés aujourd'hui "
            "(chambres et véhicules de même nom).", "info",
        )

    if nouvelle:
        # 🔴 LA FICHE ENTRE AU RÉFÉRENTIEL TOUT DE SUITE. Sans cette ligne, le
        #    cache local ne la connaît qu'au prochain rechargement, douze heures
        #    plus tard : la publication suivante du même établissement ne la
        #    trouve pas et en crée une deuxième. Mesuré le 04/09/2026 sur les
        #    334 fiches écrites depuis le 16/08 — 250 noms distincts seulement,
        #    « Hotel Restaurant Dera » 25 fois, « Hôtel de la Mer » 17 fois.
        bdd.ajouter_au_referentiel("ref_pages", {
            "id": page_id,
            "nom": t.get("nom_etab") or "",
            "jeu": diako.jeu(t.get("nom_etab") or ""),
            "slug": slug,
            # Même écriture que le chargement en masse (`p.categories::text`),
            # pour que le cache ne porte pas deux formats : « {hotel,restaurant} ».
            # Les huit catégories admises sont des identifiants sans virgule ni
            # espace, la jointure simple suffit.
            "categories": "{" + ",".join(t.get("categories") or []) + "}",
            "lieu_id": t.get("lieu_id"),
            "lieu_nom": t.get("lieu_nom"),
            "telephone": t.get("telephone"),
            "cover_url": medias[0]["url"] if medias else None,
            "site_web": t.get("site_web"),
            "nb_carte": len(lignes),
            "nb_chambre": len(chambres),
        })
        lien = f"{SITE}/pro/{slug}"
    else:
        lignes_slug = diako.executer_sql(
            f"SELECT slug FROM public.pages WHERE id = {_txt(page_id)}::uuid"
        )
        slug = lignes_slug[0]["slug"] if lignes_slug else page_id
        lien = f"{SITE}/pro/{slug}"

    bdd.logguer(
        ("Fiche créée" if nouvelle else "Fiche complétée")
        + f" : {len(medias)} photo(s), {len(lignes)} plat(s), "
        + f"{len([c for c in chambres if c.get('prix_ar')])} chambre(s) tarifée(s)"
        + (f", {len(vehicules)} offre(s) de véhicule" if vehicules else "")
        + ".",
        "succes",
    )
    return {"table": "pages", "id": page_id, "lien": lien, "photos": len(medias),
            "plats": len(lignes), "chambres": len(chambres),
            "vehicules": len(vehicules), "medias": medias}


def _publier_evenement(t: dict, rappel) -> dict:
    # ⚠ LE CALENDRIER SE RELIT AU MOMENT DE PUBLIER, pas seulement à la
    #   collecte : quatre trouvailles distinctes visaient le même « Tiakaly
    #   Food Festival » — publiées à la suite, elles auraient fait quatre
    #   événements (02/09/2026).
    jumeau, comment = diako.evenement_deja_la(t.get("titre") or "", t.get("evt_debut"))
    if jumeau:
        bdd.modifier(t["id"], {"statut": "doublon", "doublon_de": f"events:{jumeau}",
                               "note": f"Déjà au calendrier de Diako : {comment}."})
        raise ErreurPublication(f"Déjà au calendrier de Diako : {comment} — classée doublon.")
    evt_id = str(uuid.uuid4())
    slug = _slug_libre("events", _slug(f"{t.get('titre')} {t.get('evt_debut') or ''}"))
    medias = envoyer_photos(t, "pages", f"evenements/{_slug(slug)}", rappel)
    diako.executer_sql(_sql_evenement(t, evt_id, slug, medias), proprietaire=True)
    return {"table": "events", "id": evt_id, "lien": f"{SITE}/evenements",
            "photos": len(medias), "medias": medias}


def _publier_recit(t: dict, rappel) -> dict:
    post_id = str(uuid.uuid4())
    # ⚠ PRÉFIXE STABLE, dérivé de la trouvaille : avec un horodatage, une
    #   reprise après échec renvoyait toutes les photos sous un nouveau chemin
    #   et laissait les précédentes orphelines sur o2switch.
    medias = envoyer_photos(t, "posts", f"{AUTEUR_DIAKO}/{t['id'][:8]}", rappel)
    if not medias:
        raise ErreurPublication("Aucune photo n'a pu être envoyée — récit non publié.")
    diako.executer_sql(_sql_recit(t, post_id, medias), proprietaire=True)
    return {"table": "posts", "id": post_id, "lien": f"{SITE}/post/{post_id}",
            "photos": len(medias), "medias": medias}


# ── Vérification ────────────────────────────────────────────────────────────
def verifier(table: str, identifiant: str) -> dict:
    """Relit la ligne écrite. Une publication non vérifiée n'est pas une publication.

    ⚠ `redeploy.sh` a déjà menti sur ce projet : un script qui annonce « fait »
      sans relire n'apprend rien. Ici on relit, et on rend ce qu'on a vu.
    """
    if table == "pages":
        lignes = diako.executer_sql(
            f"SELECT is_published, cover_url IS NOT NULL AS a_photo, "
            f"jsonb_array_length(gallery) AS galerie, completeness, "
            f"(SELECT count(*) FROM public.menu_items m WHERE m.page_id = p.id) AS carte "
            f"FROM public.pages p WHERE id = {_txt(identifiant)}::uuid"
        )
    elif table == "events":
        lignes = diako.executer_sql(
            f"SELECT is_published, poster_url IS NOT NULL AS a_photo, starts_on::text "
            f"FROM public.events WHERE id = {_txt(identifiant)}::uuid"
        )
    else:
        lignes = diako.executer_sql(
            f"SELECT status, visibilite, jsonb_array_length(media) AS photos "
            f"FROM public.posts WHERE id = {_txt(identifiant)}::uuid"
        )
    if not lignes:
        return {"trouve": False}
    return {"trouve": True, **lignes[0]}
