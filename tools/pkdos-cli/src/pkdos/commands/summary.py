from __future__ import annotations

import re
from pathlib import Path
from typing import List

from pkdos.config import SUMMARY_FILENAME

_PDOS_PATTERN = re.compile(r".+\.pdos_atm#\d+\([^)]*\)_wfc#\d+\([^)]*\)$")


def _is_pdos_file(path: Path) -> bool:
    return path.is_file() and bool(_PDOS_PATTERN.match(path.name))


def generate_summary(directory: str | Path | None = None) -> Path:
    """Scan a directory for PDOS-related files and write a summary report."""
    target_dir = Path(directory or ".").resolve()
    files = sorted([path for path in target_dir.iterdir() if _is_pdos_file(path)])

    records: List[tuple[int, str, str]] = []
    pattern = re.compile(r"pdos_atm#(?P<atom>\d+)\((?P<species>[^)]+)\)_wfc#(?P<wfc>\d+)\((?P<orbital>[^)]+)\)")

    for path in files:
        match = pattern.search(path.name)
        if not match:
            continue
        atom = int(match.group("atom"))
        species = match.group("species")
        orbital = match.group("orbital")
        records.append((atom, species, orbital))

    summary_path = target_dir / SUMMARY_FILENAME
    with summary_path.open("w", encoding="utf-8") as handle:
        handle.write("atom_number\tspecies\torbitals\n")
        grouped: dict[int, dict[str, set[str]]] = {}
        for atom, species, orbital in records:
            grouped.setdefault(atom, {}).setdefault(species, set())
            grouped[atom][species].add(orbital)

        for atom in sorted(grouped):
            species = sorted(grouped[atom].keys())[0]
            orbitals = sorted(grouped[atom][species])
            handle.write(f"{atom}\t{species}\t{','.join(orbitals)}\n")

    return summary_path
