# -*- coding: utf-8 -*-
"""
CE QUE L'ŒIL A REFUSÉ SUR LES AFFICHES D'ÉVÉNEMENTS.

⚠ MÊME LEÇON QUE POUR LES PLATS, SUR UN AUTRE SUJET. Les filtres avaient retenu
  20 images ; six ne montraient pas ce que la carte annonce. Aucune n'aurait été
  détectée sans regarder les planches-contact — toutes portaient un nom de
  fichier crédible, un auteur, une licence et de bonnes dimensions.

⚠ ET DEUX D'ENTRE ELLES SONT DU TYPE LE PLUS DANGEREUX : pas fausses au point de
  choquer, juste hors sujet. Un cirque de grès pour une cérémonie royale, une
  vue satellite pour une saison des pluies : personne ne signalerait, et la
  carte mentirait tranquillement.
"""

REFUSES = {
    "Fitampoha du Menabe":
        "le Cirque Rouge, une formation de grès près de Mahajanga — rien à voir "
        "avec le bain des reliques royales à Belo-sur-Tsiribihina",
    "Grande moisson du riz (vary be)":
        "la photo d'une PAGE D'ALBUM d'archives, pas d'une moisson",
    "Saison de reproduction des oiseaux endémiques":
        "un pigeon photographié au ZOO DE ZURICH — ni sauvage, ni à Madagascar",
    "Saison des pluies (été austral)":
        "une vue satellite de l'île : abstraite, elle ne montre aucune pluie",
    "Alahamady Be, le Nouvel An malgache":
        "une cour de terre battue vue de loin — le lieu est juste, mais rien "
        "n'y évoque le Nouvel An",
    "Festival des Baleines de Sainte-Marie":
        "la MÊME photo que « Saison des baleines à bosse » — deux cartes "
        "identiques feraient croire à un doublon dans le calendrier ; la baleine "
        "reste sur la saison, qui couvre cinq mois au lieu d'un",
}
