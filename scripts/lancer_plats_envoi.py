# -*- coding: utf-8 -*-
"""
ÉTAPE 2 — ENVOYER, puis écrire la migration.

Télécharge chaque image retenue ET vue, la ramène à 1600 px, l'envoie sur
o2switch, et écrit `supabase/migrations/0101_photos_des_plats.sql`.

⚠ AUCUNE ÉCRITURE EN BASE ICI. Le script produit un fichier SQL relu et appliqué
  par le propriétaire — jamais un script qui parle à la production.

⚠ L'ATTRIBUTION VOYAGE AVEC L'IMAGE. `photo_credit`, `photo_licence` et
  `photo_source` sont posés dans le MÊME UPDATE que `photo_url` : une photo
  CC BY-SA sans son auteur n'est pas gratuite, elle est en infraction.
"""
import io, json, os, re, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photos_archives import preparer, envoyer
from photos_plats import AGENT
from plats_refuses import REFUSES
from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
retenus = json.load(io.open(os.path.join(RACINE, "plats_retenus.json"), encoding="utf-8"))
garde = [x for x in retenus if x["slug"] not in REFUSES]
print(f"{len(retenus)} retenus par les filtres — {len(REFUSES)} refusés à l'œil "
      f"— {len(garde)} à poser\n")

faits, rates = [], []
for i, x in enumerate(garde, 1):
    try:
        req = urllib.request.Request(x["url"], headers={"User-Agent": AGENT})
        brut = urllib.request.urlopen(req, timeout=180).read()
        tmp = os.path.join(os.environ.get("TEMP", "."), "plat_tmp.jpg")
        with Image.open(io.BytesIO(brut)) as im:
            im.convert("RGB").save(tmp, "JPEG", quality=92)
        oct_, dim = preparer(tmp)
        rep = envoyer(oct_, f"plats/{x['slug']}.jpg")
        faits.append({"slug": x["slug"], "url": rep["url"], "auteur": x["auteur"],
                      "licence": x["licence"], "page": x["page"]})
        print(f"  {i:3}/{len(garde)} {x['slug'][:28]:30} {dim[0]}x{dim[1]} "
              f"{len(oct_)//1024:4} Ko  {x['licence'][:16]}", flush=True)
    except Exception as e:
        rates.append((x["slug"], str(e)[:110]))
        print(f"  {i:3}/{len(garde)} ECHEC {x['slug']} : {str(e)[:110]}", flush=True)
    time.sleep(0.4)

io.open(os.path.join(RACINE, "plats_envoyees.json"), "w", encoding="utf-8").write(
    json.dumps(faits, ensure_ascii=False, indent=1))


def sql(s):
    """Échappement SQL. ⚠ Les noms d'auteurs de Commons contiennent des
    apostrophes (« O'Brien ») et des guillemets : un doublement manquant, et la
    migration ne passe pas — ou pire, elle passe autrement."""
    return "'" + str(s).replace("'", "''") + "'" if s is not None else "null"


lignes = []
for f in faits:
    # ⚠ Un auteur de Commons arrive parfois avec du HTML résiduel et des
    #   espaces multiples : on aplatit, sinon le crédit s'affiche en charabia.
    auteur = re.sub(r"\s+", " ", (f["auteur"] or "")).strip()[:200]
    lignes.append(
        f"  update public.dishes set photo_url = {sql(f['url'])}, "
        f"photo_credit = {sql(auteur)}, photo_licence = {sql(f['licence'])}, "
        f"photo_source = {sql(f['page'])} where slug = {sql(f['slug'])};")

mig = os.path.join(RACINE, "supabase/migrations/0101_photos_des_plats.sql")
io.open(mig, "w", encoding="utf-8", newline="\n").write(
    "-- " + "=" * 74 + "\n"
    "-- 0101 — LES PHOTOS DES PLATS, AVEC LEUR ATTRIBUTION\n"
    "--\n"
    "-- 🔴 L'ATLAS DES PLATS AFFICHAIT 95 RECTANGLES GRIS. `photo_url` était nul sur\n"
    "--    95 lignes sur 95, alors que la page est faite de vignettes.\n"
    "--\n"
    "-- ⚠ SOURCE : WIKIMEDIA COMMONS, moissonné par scripts/photos_plats.py, images\n"
    "--   réhébergées sur o2switch (jamais Supabase Storage : facteur 17 sur\n"
    "--   l'egress). Les trois colonnes d'attribution de 0096 sont posées dans le\n"
    "--   MÊME update : une photo CC BY-SA sans son auteur n'est pas gratuite.\n"
    "--\n"
    "-- 🔴 CE QUI N'EST PAS ICI, ET POURQUOI. Les filtres textuels avaient retenu 50\n"
    "--    images ; 17 étaient fausses et n'ont été démasquées qu'en REGARDANT les\n"
    "--    vignettes : une bouteille de soda pour « bonbon anglais », une photo de\n"
    "--    groupe pour « carpe », des poulets crus pour « poulet grillé », un dessin\n"
    "--    au trait pour « espadon », et deux paires de doublons. Les motifs sont\n"
    "--    dans scripts/plats_refuses.py. Les plats non couverts gardent une case\n"
    "--    VIDE : une photo fausse sur un plat ne se repère plus jamais, puisque le\n"
    "--    visiteur consulte justement l'atlas pour découvrir le plat.\n"
    "-- " + "=" * 74 + "\n\n"
    "do $$\nbegin\n" + "\n".join(lignes) + "\nend $$;\n\n"
    "-- ⚠ L'ASSERTION PORTE SUR L'ATTRIBUTION, PAS SUR LE COMPTE. Une photo posée\n"
    "--   sans auteur ni licence serait une infraction silencieuse : mieux vaut que\n"
    "--   la migration échoue ici.\n"
    "do $$\ndeclare n int;\nbegin\n"
    "  select count(*) into n from public.dishes\n"
    "   where photo_url is not null\n"
    "     and (photo_credit is null or photo_licence is null or photo_source is null);\n"
    "  if n > 0 then\n"
    "    raise exception 'ATTRIBUTION MANQUANTE sur % plat(s) : une photo Commons "
    "sans auteur ni licence ne peut pas etre publiee', n;\n"
    "  end if;\nend $$;\n")

print(f"\nTERMINE : {len(faits)} posées, {len(rates)} en échec")
print("migration :", mig)
for s, m in rates:
    print("   ", s, "—", m)
