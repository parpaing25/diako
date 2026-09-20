"""Le registre des compétences — ce que le bot sait faire.

Une compétence est une fonction Python DÉCLARÉE ici, avec sa description et
ses paramètres. Le registre sert à trois choses à la fois :

  · le cerveau la propose au modèle comme un outil (appel d'outil) ;
  · la commande `/aide` l'affiche à Andry, avec ses exemples ;
  · la file de validation sait si elle sort en public et doit être confirmée.

⚠ UNE COMPÉTENCE NE PARLE JAMAIS À TELEGRAM. Elle rend un `Resultat` ; c'est
  le cerveau qui met en forme. Sans cette règle, rien n'est testable sans jeton.

⚠ TOUT CE QUI SORT EN PUBLIC est `publique=True` : publication, réponse à un
  commentaire ou à un message, déploiement du site, écriture en base. Andry
  clique dans Telegram avant que ça parte. C'est sa consigne du 18/09/2026
  (« je fabrique tout, il clique »), transposée au bot.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from . import config


@dataclass
class Resultat:
    """Ce que rend une compétence. `texte` est destiné à Andry, tel quel."""

    texte: str
    ok: bool = True
    images: list[Path] = field(default_factory=list)
    donnees: dict[str, Any] = field(default_factory=dict)
    # Des boutons à proposer après coup (ex. « Programmer », « Voir la file »).
    suites: list[dict[str, str]] = field(default_factory=list)


@dataclass
class Competence:
    nom: str
    titre: str
    description: str
    fonction: Callable[..., Resultat]
    parametres: dict[str, str] = field(default_factory=dict)
    obligatoires: tuple[str, ...] = ()
    publique: bool = False
    exemples: tuple[str, ...] = ()
    famille: str = "divers"

    def schema(self) -> dict:
        """La description au format « outil » attendu par les modèles."""
        return {
            "name": self.nom,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    nom: {"type": "string", "description": desc}
                    for nom, desc in self.parametres.items()
                },
                "required": list(self.obligatoires),
            },
        }


REGISTRE: dict[str, Competence] = {}


def competence(
    nom: str,
    titre: str,
    description: str,
    *,
    parametres: dict[str, str] | None = None,
    obligatoires: tuple[str, ...] = (),
    publique: bool = False,
    exemples: tuple[str, ...] = (),
    famille: str = "divers",
) -> Callable[[Callable[..., Resultat]], Callable[..., Resultat]]:
    """Déclare une compétence. À poser sur la fonction qui fait le travail."""

    def enveloppe(fonction: Callable[..., Resultat]) -> Callable[..., Resultat]:
        REGISTRE[nom] = Competence(
            nom=nom,
            titre=titre,
            description=description,
            fonction=fonction,
            parametres=parametres or {},
            obligatoires=obligatoires,
            publique=publique,
            exemples=exemples,
            famille=famille,
        )
        return fonction

    return enveloppe


def demande_validation(nom: str) -> bool:
    """Vrai si cette compétence doit être confirmée par un clic d'Andry."""
    comp = REGISTRE.get(nom)
    if comp is None:
        return True  # l'inconnu se confirme toujours
    if not comp.publique:
        return False
    # Fermée par défaut : on ne saute la confirmation que si Andry a nommé
    # cette compétence dans « validation_levee ».
    return nom not in config.charger().get("validation_levee", [])


def executer(nom: str, arguments: dict[str, Any]) -> Resultat:
    """Lance une compétence en filtrant les arguments qu'elle ne connaît pas.

    ⚠ LE MODÈLE INVENTE DES PARAMÈTRES. Passer son dictionnaire tel quel à la
      fonction lève un TypeError qui ressemble à une panne du bot ; on n'en
      garde que ce qui est déclaré, et on refuse ce qui manque.
    """
    comp = REGISTRE.get(nom)
    if comp is None:
        return Resultat(texte=f"Compétence inconnue : {nom}", ok=False)
    connus = {k: v for k, v in (arguments or {}).items() if k in comp.parametres}
    manquants = [p for p in comp.obligatoires if not connus.get(p)]
    if manquants:
        return Resultat(
            texte=f"Il me manque : {', '.join(manquants)} (compétence {nom}).", ok=False
        )
    try:
        return comp.fonction(**connus)
    except Exception as e:  # une compétence qui tombe ne tue pas le bot
        return Resultat(texte=f"Échec de « {comp.titre} » : {e}", ok=False,
                        donnees={"exception": type(e).__name__})


def charger_toutes() -> None:
    """Importe les modules de compétences. Un module absent n'empêche rien."""
    # « redaction » est importé par « atelier », mais on le nomme quand même :
    # un module qui ne tient qu'à l'import d'un autre disparaît le jour où
    # cette ligne-là bouge, et la compétence s'évapore sans erreur.
    for module in ("meta", "site", "redaction", "photos", "atelier", "collecte", "general"):
        try:
            __import__(f"{__package__}.{module}")
        except Exception as e:  # noqa: BLE001 — on veut la liste, pas un plantage
            print(f"[competences] {module} non chargé : {type(e).__name__} {e}")


def par_famille() -> dict[str, list[Competence]]:
    familles: dict[str, list[Competence]] = {}
    for comp in REGISTRE.values():
        familles.setdefault(comp.famille, []).append(comp)
    for liste in familles.values():
        liste.sort(key=lambda c: c.nom)
    return familles
