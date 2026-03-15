# Generated from JSON Schemas. Do not edit by hand.
#
# NOTE: action_envelope.py and the action_envelope/ package share the same
# name.  Python resolves the package (directory) first, so we use importlib
# to load the .py module file explicitly when we need ActionEnvelope.

import importlib.util as _ilu
import pathlib as _pathlib
import sys as _sys

def _load_module_from_file(name: str, path: str) -> object:
    spec = _ilu.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {path}")
    mod = _ilu.module_from_spec(spec)
    _sys.modules[name] = mod
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod

_here = _pathlib.Path(__file__).parent
_ae_mod = _load_module_from_file(
    "authensor.generated._action_envelope_file",
    str(_here / "action_envelope.py"),
)
ActionEnvelope = _ae_mod.ActionEnvelope  # type: ignore[attr-defined]

from .action_receipt import ActionReceipt
from .decision import Decision
from .policy import Policy

__all__ = ['ActionEnvelope', 'ActionReceipt', 'Decision', 'Policy']
