from __future__ import annotations

from pathlib import Path
from typing import List

from pkdos.models.summary import AtomSummary
from pkdos.utils.exceptions import SummaryFormatError


class SummaryParser:
    """Parse pkdos_summary.txt into structured atom objects."""

    @staticmethod
    def parse(path: str | Path) -> List[AtomSummary]:
        summary_path = Path(path)
        if not summary_path.exists():
            raise SummaryFormatError(f"Summary file not found: {summary_path}")

        atoms: List[AtomSummary] = []
        with summary_path.open("r", encoding="utf-8") as handle:
            lines = [line.strip() for line in handle if line.strip()]

        if not lines:
            raise SummaryFormatError("Summary file is empty")

        header = lines[0].split()
        if len(header) < 3 or header[0] != "atom_number":
            raise SummaryFormatError("Invalid summary header")

        for line in lines[1:]:
            parts = line.split()
            if len(parts) < 3:
                raise SummaryFormatError(f"Invalid summary row: {line}")
            atom_number = int(parts[0])
            species = parts[1]
            orbitals = [orbital for orbital in parts[2].split(",") if orbital]
            atoms.append(AtomSummary(atom_number=atom_number, species=species, orbitals=orbitals))

        return sorted(atoms, key=lambda atom: atom.atom_number)
