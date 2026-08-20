# -*- coding: utf-8 -*-
"""
ÉTAPE 2 — ENVOYER les affiches retenues ET VUES, puis écrire la migration.

⚠ AUCUNE ÉCRITURE EN BASE ICI : le script produit un `.sql` relu et appliqué
  séparément. L'attribution (auteur, licence, page) est posée dans le MÊME
  update que l'URL — colonnes de la migration 0104.
"""
import io, json, os, re, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from evenements_refuses import REFUSES
from photos_archives import envoyer, preparer
from photos_evenements import SANS_AFFICHE
from photos_plats import AGENT
from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
retenus = json.load(io.open(os.path.join(RACINE, "evenements_retenus.json"), encoding="utf-8"))
garde = [x for x in retenus if x["titre"] not in REFUSES]
print(f"{len(retenus)} retenus par les filtres — {len(REFUSES)} refuses a l'oeil "
      f"— {len(garde)} a poser\n")

faits, rates = [], []
for i, x in enumerate(garde, 1):
    try:
        req = urllib.request.Request(x["url"], headers={"User-Agent": AGENT})
        brut = urllib.request.urlopen(req, timeout=180).read()
        tmp = os.path.join(os.environ.get("TEMP", "."), "evt_tmp.jpg")
        with Image.open(io.BytesIO(brut)) as im:
            im.convert("RGB").save(tmp, "JPEG", quality=92)
        oct_, dim = preparer(tmp)
        nom = re.sub(r"[^a-z0-9]+", "-", x["titre"].lower()).strip("-")[:48]
        rep = envoyer(oct_, f"evenements/{nom}.jpg")
        faits.append({"id": x["id"], "titre": x["titre"], "url": rep["url"],
                      "auteur": x["auteur"], "licence": x["licence"], "page": x["page"]})
        print(f"  {i:3}/{len(garde)} {x['titre'][:42]:44} {dim[0]}x{dim[1]} "
              f"{len(oct_)//1024:4} Ko  {x['licence'][:16]}", flush=True)
    except Exception as e:
        rates.append((x["titre"], str(e)[:110]))
        print(f"  {i:3}/{len(garde)} ECHEC {x['titre'][:36]} : {str(e)[:90]}", flush=True)
    time.sleep(0.4)

io.open(os.path.join(RACINE, "evenements_envoyees.json"), "w", encoding="utf-8").write(
    json.dumps(faits, ensure_ascii=False, indent=1))


def sql(s):
    return "'" + str(s).replace("'", "''") + "'" if s is not None else "null"


lignes = []
for f in faits:
    auteur = re.sub(r"\s+", " ", (f["auteur"] or "")).strip()[:200]
    lignes.append(
        f"  update public.events set poster_url = {sql(f['url'])}, "
        f"poster_credit = {sql(auteur)}, poster_licence = {sql(f['licence'])}, "
        f"poster_source = {sql(f['page'])} where id = {sql(f['id'])}::uuid;")

mig = os.path.join(RACINE, "supabase/migrations/0105_affiches_des_evenements.sql")
io.open(mig, "w", encoding="utf-8", newline="\n").write(
    "-- " + "=" * 74 + "\n"
    "-- 0105 — LES AFFICHES DES EVENEMENTS, AVEC LEUR ATTRIBUTION\n"
    "--\n"
    "-- 🔴 /evenements AFFICHAIT 42 RECTANGLES GRIS. `poster_url` etait nul sur 42\n"
    "--    lignes sur 42, alors que l'ecran est une grille de cartes.\n"
    "--\n"
    "-- ⚠ UN RAPPROCHEMENT PAR TITRE NE POUVAIT PAS MARCHER, contrairement aux\n"
    "--   plats : « Assomption » ou « Fete du Travail » ne designent rien de\n"
    "--   malgache sur Commons. Le SUJET de chaque evenement a donc ete ecrit a la\n"
    "--   main (scripts/photos_evenements.py), en preferant les noms scientifiques,\n"
    "--   bien plus discriminants : « Adansonia grandidieri », « Megaptera\n"
    "--   novaeangliae », « Vanilla planifolia ».\n"
    "--\n"
    "-- 🔴 CE QUI RESTE VOLONTAIREMENT SANS AFFICHE. Vingt evenements ne sont pas\n"
    "--    illustres : les fetes generiques (Noel, Paques, Toussaint, Fete du\n"
    "--    Travail) parce qu'un sapin pris ailleurs n'apprend rien et laisse croire\n"
    "--    a une photo malgache, et les festivals recents parce que Commons n'a\n"
    "--    rien de libre. Six autres ont ete refusees A L'OEIL apres que les\n"
    "--    filtres les eurent acceptees : un cirque de gres pour une ceremonie\n"
    "--    royale, une page d'album d'archives pour une moisson, un pigeon du ZOO\n"
    "--    DE ZURICH pour des oiseaux endemiques sauvages. Motifs dans\n"
    "--    scripts/evenements_refuses.py.\n"
    "-- " + "=" * 74 + "\n\n"
    "do $$\nbegin\n" + "\n".join(lignes) + "\nend $$;\n\n"
    "-- ⚠ L'ASSERTION PORTE SUR L'ATTRIBUTION. Une affiche Commons sans auteur ni\n"
    "--   licence n'est pas une image gratuite, c'est une infraction silencieuse.\n"
    "do $$\ndeclare n int;\nbegin\n"
    "  select count(*) into n from public.events\n"
    "   where poster_url is not null\n"
    "     and (poster_credit is null or poster_licence is null or poster_source is null);\n"
    "  if n > 0 then\n"
    "    raise exception 'ATTRIBUTION MANQUANTE sur % affiche(s)', n;\n"
    "  end if;\n"
    "end $$;\n")

print(f"\nTERMINE : {len(faits)} posees, {len(rates)} en echec")
print(f"sans affiche assumee : {len(SANS_AFFICHE)} fetes generiques + {len(REFUSES)} refusees a l'oeil")
print("migration :", mig)
for t, m in rates:
    print("   ", t, "—", m)
