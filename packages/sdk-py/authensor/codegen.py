"""
Schema-driven model generation for the Python SDK.

Uses datamodel-code-generator (Pydantic v2) to turn JSON Schemas into
Pydantic models under authensor.generated.
"""

from __future__ import annotations

import subprocess
import sys
import shutil
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def generate_models() -> None:
    root = repo_root()
    schemas_dir = root / "packages" / "schemas" / "src"
    output_dir = Path(__file__).parent / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Clean existing generated files to avoid stale models
    for path in output_dir.glob("**/*"):
        if path.name == ".gitkeep":
            continue
        if path.is_file():
            path.unlink()
        elif path.is_dir():
            shutil.rmtree(path)

    schema_files = [
        "action-envelope.schema.json",
        "action-receipt.schema.json",
        "policy.schema.json",
    ]

    for schema_file in schema_files:
        cmd = [
            sys.executable,
            "-m",
            "datamodel_code_generator",
            "--input",
            str(schemas_dir / schema_file),
            "--input-file-type",
            "jsonschema",
            "--output",
            str(output_dir),
            "--module-split-mode",
            "single",
            "--target-python-version",
            "3.12",
            "--use-standard-collections",
            "--output-model-type",
            "pydantic_v2.BaseModel",
            "--disable-timestamp",
        ]
        subprocess.run(cmd, check=True)

    init_file = output_dir / "__init__.py"
    init_file.write_text(
        "# Generated from JSON Schemas. Do not edit by hand.\n"
        "from .action_envelope import ActionEnvelope\n"
        "from .action_receipt import ActionReceipt, Decision\n"
        "from .policy import Policy\n"
        "__all__ = ['ActionEnvelope', 'ActionReceipt', 'Decision', 'Policy']\n",
        encoding="utf-8",
    )


def main() -> None:
    generate_models()


if __name__ == "__main__":
    main()
