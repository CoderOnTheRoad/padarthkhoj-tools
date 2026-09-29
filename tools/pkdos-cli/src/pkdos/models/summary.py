from dataclasses import dataclass, field
from typing import List


@dataclass(slots=True)
class Orbital:
    name: str


@dataclass(slots=True)
class AtomSummary:
    atom_number: int
    species: str
    orbitals: List[str] = field(default_factory=list)
