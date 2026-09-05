"""Retirer des cartes ce qui n'est pas un plat, et les prix invraisemblables.

🔴 CE QU'ON A VU SUR LE SITE, le 04/09/2026. La fiche « Vanila Hotel & Spa Nosy
   Be » annonçait **« À partir de 300 000 Ar le plat »**. Le montant venait d'une
   ligne de carte nommée « Adult rate » : le forfait journée d'un hôtel-spa, lu
   comme une assiette. La base promeut la ligne de carte la moins chère en prix
   d'appel de la fiche — une erreur de lecture devient donc le prix affiché en
   tête de page, sur un site dont toute la promesse est « les vrais tarifs ».

MESURE. Sur les 72 lignes de carte tarifées de Diako : médiane 25 000 Ar, et le
plus cher plat RÉEL est un « Grand Buffet Complet » à 80 000 Ar. Au-dessus, tout
était faux — « frites » à 250 000 Ar, « Prix » à 400 000 Ar. Quatre lignes
s'appelaient littéralement « Prix ».

TROIS TRAITEMENTS, ET PAS UN SEUL :
  · SUPPRIMER les lignes dont le nom ne dit rien du tout (« Prix », « Tarif »,
    « Adult rate ») : elles ne portent aucune information qu'on perdrait.
    Vérifié le 04/09/2026 : aucune table de commande ni de panier n'existe dans
    Diako, supprimer une ligne de carte n'engage rien en aval.
  · EFFACER LE PRIX, sans toucher au plat, quand le montant dépasse le plafond
    mesuré. Le nom reste sur la carte, le montant faux disparaît.
  · SIGNALER, sans y toucher, les lignes qui portent un vrai tarif rangé au
    mauvais endroit — « Journée » et « Demi-journée » chez Hôtel Henintsoa
    Bypass sont des tarifs de CHAMBRE, pas des plats. Les supprimer perdrait une
    information juste ; leur place est dans `room_types`, et ce déplacement se
    décide, il ne s'improvise pas.

Le garde-fou est posé en amont dans `analyse_llm.plats_depuis_carte` : cet outil
ne sert qu'à rattraper ce qui est déjà en base.

    python outils/nettoyer_cartes.py            # à blanc, n'écrit rien
    python outils/nettoyer_cartes.py --ecrire   # nettoie pour de bon
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from bot import diako  # noqa: E402
from bot.analyse_llm import PRIX_PLAT_MAX  # noqa: E402

# Des mots qui n'apprennent RIEN : les retirer ne perd aucune information.
# Volontairement plus court que `analyse_llm.ETIQUETTES_DE_PRIX`, qui sert à
# refuser un nom de plat à la lecture : « Journée » n'est pas un plat, mais la
# ligne « Journée · 70 000 Ar » porte un tarif vrai qu'on ne jette pas.
SANS_INFORMATION = ("prix", "tarif", "tarifs", "prix unitaire", "montant",
                    "total", "menu", "pack", "offre", "promo",
                    "adult rate", "child rate")
# Un vrai tarif, rangé au mauvais endroit. On le montre, on n'y touche pas.
A_DEPLACER = ("journee", "journée", "demi journee", "demi-journée",
              "demi journée", "forfait", "nuitee", "nuitée")

_VIDES = ", ".join("'" + m.replace("'", "''") + "'" for m in SANS_INFORMATION)
_DEPLACER = ", ".join("'" + m.replace("'", "''") + "'" for m in A_DEPLACER)
_NOM = "lower(btrim(m.name, ' :.-'))"
_JOINTURE = ("FROM public.menu_items m JOIN public.pages p ON p.id = m.page_id")


def _lire(condition: str) -> list[dict]:
    return diako.executer_sql(
        f"SELECT m.id::text, m.name, m.price_ar, p.name AS fiche {_JOINTURE} "
        f"WHERE {condition} ORDER BY m.price_ar DESC NULLS LAST"
    )


def main() -> int:
    lecture = argparse.ArgumentParser(description=__doc__)
    lecture.add_argument("--ecrire", action="store_true",
                         help="nettoie pour de bon (sans lui, rien n'est écrit)")
    args = lecture.parse_args()

    vides = _lire(f"{_NOM} IN ({_VIDES})")
    cheres = _lire(f"m.price_ar > {PRIX_PLAT_MAX} AND {_NOM} NOT IN ({_VIDES}) "
                   f"AND {_NOM} NOT IN ({_DEPLACER})")
    deplacer = _lire(f"{_NOM} IN ({_DEPLACER})")

    print(f"Plafond d'un plat : {PRIX_PLAT_MAX} Ar (mesuré — le plus cher plat réel "
          f"de Diako est un buffet à 80 000 Ar).\n")

    print(f"{len(vides)} ligne(s) à SUPPRIMER — le nom n'apprend rien :")
    for l in vides:
        print(f"  {str(l['price_ar'] or '—'):>8} Ar · « {str(l['name'])[:24]:24} » "
              f"· {str(l['fiche'])[:34]}")

    print(f"\n{len(cheres)} prix à EFFACER — le plat reste, le montant tombe :")
    for l in cheres:
        print(f"  {l['price_ar']:>8} Ar · « {str(l['name'])[:24]:24} » "
              f"· {str(l['fiche'])[:34]}")

    print(f"\n{len(deplacer)} ligne(s) SIGNALÉE(S) — vrai tarif, mauvaise table "
          f"(à porter dans les chambres, décision d'Andry) :")
    for l in deplacer:
        print(f"  {str(l['price_ar'] or '—'):>8} Ar · « {str(l['name'])[:24]:24} » "
              f"· {str(l['fiche'])[:34]}")

    if not args.ecrire:
        print("\nÀ blanc : rien n'a été écrit. Relancer avec --ecrire pour nettoyer.")
        return 0
    if not vides and not cheres:
        print("\nRien à nettoyer.")
        return 0

    ordres = []
    if vides:
        ids = ", ".join(f"'{l['id']}'::uuid" for l in vides)
        ordres.append(f"DELETE FROM public.menu_items WHERE id IN ({ids});")
    if cheres:
        ids = ", ".join(f"'{l['id']}'::uuid" for l in cheres)
        ordres.append(f"UPDATE public.menu_items SET price_ar = NULL WHERE id IN ({ids});")
    diako.executer_sql("\n".join(ordres), proprietaire=True)

    reste = diako.executer_sql(
        f"SELECT count(*) AS n {_JOINTURE} WHERE {_NOM} IN ({_VIDES}) "
        f"OR (m.price_ar > {PRIX_PLAT_MAX} AND {_NOM} NOT IN ({_DEPLACER}))"
    )
    n = int(reste[0]["n"]) if reste else -1
    print(f"\nNettoyé. Lignes fautives restantes : {n}.")
    return 0 if n == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
