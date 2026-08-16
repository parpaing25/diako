# -*- coding: utf-8 -*-
"""
CE QUE L'ŒIL A REFUSÉ APRÈS QUE LES FILTRES ONT DIT OUI.

🔴 CE FICHIER EST LA PREUVE QU'AUCUN FILTRE TEXTUEL NE SUFFIT. Les 50 photos
   retenues avaient passé trois garde-fous — mot entier, rebut, signal
   « nourriture » — et 17 étaient quand même fausses. Elles n'ont été vues que
   parce qu'on a REGARDÉ les vignettes, une par une, sur quatre planches.

⚠ ET UNE PHOTO FAUSSE SUR UN PLAT NE SE REPÈRE PLUS JAMAIS. Personne ne va
  contester que cette assiette-là soit du ravitoto : le visiteur ne connaît pas
  le plat, c'est même pour ça qu'il consulte l'atlas. Le site deviendrait faux
  en silence. La case vide, elle, se voit et se corrige.

Le motif est écrit à côté de chaque slug pour que le prochain passage ne les
repropose pas sans savoir pourquoi ils avaient sauté.
"""

REFUSES = {
    # ── Sans aucun rapport ────────────────────────────────────────────────
    "bonbon-anglais": "une bouteille de soda en plastique",
    "cafe-malgache": "une salle de réunion en noir et blanc",
    "carpe": "une photo de groupe (conférence)",
    "poulet-grille": "des poulets crus et plumés sur un plateau",
    "ramanonaka": "une scène de rue avec des seaux",
    "trondro-gasy": "un étal de marché sous parasols, aucun poisson visible",
    "camaron": "des beignets en friture, pas une écrevisse",

    # ── Le sujet n'est pas identifiable ───────────────────────────────────
    "crabe": "des mains et un tuyau d'eau, sujet indéchiffrable",
    "salade-de-fruits": "un étal de fruits, pas une salade",
    "mofo-sakay": "un stand de rue générique, le beignet n'est pas identifiable",
    "sambos": "le même stand générique que mofo-sakay",
    "thb": "la devanture d'une boutique, pas la boisson",
    "capitaine": "du riz et une viande indéterminée (attiéké ivoirien)",
    "anamalaho": "quelqu'un qui découpe des tomates, la brède n'y est pas",

    # ── Ce n'est pas une photographie ─────────────────────────────────────
    "espadon": "un dessin au trait sur fond blanc, pas une photo",

    # ── Doublons : la même image pour deux plats différents ───────────────
    # ⚠ Garder la même photo sur deux fiches rend le choix ARBITRAIRE et fait
    #   croire à deux plats identiques. On la laisse au plat le plus précis.
    "koba-ravina": "même image que « koba »",
    "voanjobory-henakisoa": "même image que « voanjobory »",
}
