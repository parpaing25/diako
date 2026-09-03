"""Réglages communs aux tests du bot Diako.

Ces tests tournent… depuis une session Claude. Sans ce détour, le garde du
03/09 (« pas de tournée automatique tant qu'une session tourne sur ce PC »)
verrait les marqueurs RÉELS de ~/.claude/sessions-actives/ et suspendrait
chaque collecte simulée. Le garde a ses propres tests, qui remplacent
`active` à leur tour.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot import session_claude  # noqa: E402


@pytest.fixture(autouse=True)
def aucune_session_claude(monkeypatch):
    monkeypatch.setattr(session_claude, "active", lambda *_a, **_k: None)
