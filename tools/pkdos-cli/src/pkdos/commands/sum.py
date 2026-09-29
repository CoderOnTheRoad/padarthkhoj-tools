from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, List

import numpy as np
import pandas as pd

from pkdos.analysis.summation import sum_orbitals, validate_energy_grid
from pkdos.config import SUMMARY_FILENAME
from pkdos.io.pdos_reader import read_pdos_file
from pkdos.parsers.summary_parser import SummaryParser

_ORBITAL_NAMES = {"s": "s", "p": "p", "d": "d", "f": "f"}


def collect_matching_pdos_files(directory: str | Path, atom_numbers: Iterable[int] | None = None, orbital: str | None = None) -> List[Path]:
    """Collect PDOS files matching the requested atoms and orbital."""
    target_dir = Path(directory)
    if not target_dir.exists():
        return []

    pattern = re.compile(r"pdos_atm#(?P<atom>\d+)\((?P<species>[^)]*)\)_wfc#\d+\((?P<orbital>[^)]*)\)")
    matches: List[Path] = []
    selected_atoms = set(atom_numbers or [])
    for path in sorted(target_dir.iterdir()):
        if not path.is_file():
            continue
        match = pattern.search(path.name)
        if not match:
            continue
        atom_number = int(match.group("atom"))
        requested_orbital = match.group("orbital")
        if selected_atoms and atom_number not in selected_atoms:
            continue
        if orbital and requested_orbital != orbital:
            continue
        matches.append(path)
    return matches


def _prompt_for_fermi_energy() -> float:
    value = input("Fermi energy [0]: ").strip() or "0"
    return float(value)


def _write_output(dataframe: pd.DataFrame, filename: str) -> None:
    dataframe.to_csv(filename, index=False)
    print(f"Wrote {filename}")


def sum_selected_files(directory: str | Path, orbital: str, fermi_energy: float) -> pd.DataFrame | None:
    """Sum PDOS values across matching files for the selected orbital."""
    target_dir = Path(directory)
    files = collect_matching_pdos_files(target_dir, orbital=orbital)
    if not files:
        print("No matching PDOS files found.")
        return None

    frames: List[pd.DataFrame] = []
    reference_energy: np.ndarray | None = None
    for path in files:
        energy, ldos_up, ldos_down, pdos_matrix = read_pdos_file(path)
        shifted_energy = energy - fermi_energy
        if reference_energy is None:
            reference_energy = shifted_energy
        else:
            validate_energy_grid(shifted_energy, reference_energy, context=path.name)
        frames.append(sum_orbitals(shifted_energy, ldos_up, ldos_down, pdos_matrix, orbital=orbital))

    if not frames:
        return None

    aggregated = frames[0][["Energy"]].copy()
    for column in frames[0].columns[1:]:
        aggregated[column] = frames[0][column].astype(float).to_numpy()

    for frame in frames[1:]:
        for column in frame.columns[1:]:
            aggregated[column] = aggregated[column].astype(float).to_numpy() + frame[column].astype(float).to_numpy()

    return aggregated


def _sum_selected_files(files: List[Path], orbital: str, fermi_energy: float) -> pd.DataFrame | None:
    if not files:
        print("No matching PDOS files found.")
        return None

    if not all(path.exists() for path in files):
        print("One or more selected PDOS files do not exist.")
        return None

    try:
        frames: List[pd.DataFrame] = []
        reference_energy: np.ndarray | None = None
        for path in files:
            energy, ldos_up, ldos_down, pdos_matrix = read_pdos_file(path)
            shifted_energy = energy - fermi_energy
            if reference_energy is None:
                reference_energy = shifted_energy
            else:
                validate_energy_grid(shifted_energy, reference_energy, context=path.name)
            frames.append(sum_orbitals(shifted_energy, ldos_up, ldos_down, pdos_matrix, orbital=orbital))

        if not frames:
            return None

        aggregated = frames[0][["Energy"]].copy()
        for column in frames[0].columns[1:]:
            aggregated[column] = frames[0][column].astype(float).to_numpy()
        for frame in frames[1:]:
            for column in frame.columns[1:]:
                aggregated[column] = aggregated[column].astype(float).to_numpy() + frame[column].astype(float).to_numpy()
        return aggregated
    except ValueError as exc:
        print(f"Error: {exc}")
        return None


def _sum_all_orbitals(orbital: str, fermi_energy: float) -> None:
    result = sum_selected_files(Path("."), orbital=orbital, fermi_energy=fermi_energy)
    if result is None:
        return
    filename = f"tot_dos_{orbital}.csv"
    _write_output(result, filename)


def _sum_selected_atoms(fermi_energy: float) -> None:
    atoms_input = input("Atom numbers (comma-separated): ").strip()
    if not atoms_input:
        return
    atom_numbers = [int(part.strip()) for part in atoms_input.split(",") if part.strip()]
    orbital = input("Orbital (s/p/d/f): ").strip().lower()
    if orbital not in _ORBITAL_NAMES:
        print("Invalid orbital.")
        return

    summary = SummaryParser.parse(SUMMARY_FILENAME)
    available_atoms = {atom.atom_number: atom for atom in summary}
    missing = [atom for atom in atom_numbers if atom not in available_atoms]
    if missing:
        print(f"Atoms not found in summary: {missing}")
        return

    for atom_number in atom_numbers:
        atom = available_atoms[atom_number]
        if orbital not in atom.orbitals:
            print(f"Warning: atom {atom_number} lacks orbital {orbital}")
            response = input("Continue? [y/N]: ").strip().lower()
            if response not in {"y", "yes"}:
                return

    files = collect_matching_pdos_files(Path("."), atom_numbers=atom_numbers, orbital=orbital)
    result = _sum_selected_files(files, orbital, fermi_energy)
    if result is None:
        return
    label = "_".join(str(atom) for atom in atom_numbers)
    output_name = f"tot_dos_({label}).csv"
    _write_output(result, output_name)


def _sum_selected_species(fermi_energy: float) -> None:
    species_input = input("Species (comma-separated): ").strip()
    if not species_input:
        return
    species = [part.strip() for part in species_input.split(",") if part.strip()]
    orbital = input("Orbital (s/p/d/f): ").strip().lower()
    if orbital not in _ORBITAL_NAMES:
        print("Invalid orbital.")
        return

    summary = SummaryParser.parse(SUMMARY_FILENAME)
    available_species = {atom.species for atom in summary}
    missing = [name for name in species if name not in available_species]
    if missing:
        print(f"Species not found in summary: {missing}")
        return

    for name in species:
        atoms = [atom for atom in summary if atom.species == name]
        if not any(orbital in atom.orbitals for atom in atoms):
            print(f"Warning: species {name} lacks orbital {orbital}")
            response = input("Continue? [y/N]: ").strip().lower()
            if response not in {"y", "yes"}:
                return

    files = []
    for atom in summary:
        if atom.species in species:
            files.extend(collect_matching_pdos_files(Path("."), atom_numbers=[atom.atom_number], orbital=orbital))
    result = _sum_selected_files(files, orbital, fermi_energy)
    if result is None:
        return
    output_name = f"tot_dos_({'_'.join(species)}).csv"
    _write_output(result, output_name)


def run_sum_menu() -> None:
    """Display the interactive summation menu."""
    summary_path = Path(SUMMARY_FILENAME)
    if not summary_path.exists():
        print("pkdos_summary.txt not found. Run 'pkdos summary' first.")
        return

    while True:
        print("\n1. Sum all s")
        print("2. Sum all p")
        print("3. Sum all d")
        print("4. Sum all f")
        print("5. Sum selected atoms")
        print("6. Sum selected species")
        print("7. Exit")
        choice = input("Select an option: ").strip()
        if choice == "7":
            break
        if choice in {"1", "2", "3", "4"}:
            orbital = {"1": "s", "2": "p", "3": "d", "4": "f"}[choice]
            fermi_energy = _prompt_for_fermi_energy()
            _sum_all_orbitals(orbital, fermi_energy)
        elif choice == "5":
            fermi_energy = _prompt_for_fermi_energy()
            _sum_selected_atoms(fermi_energy)
        elif choice == "6":
            fermi_energy = _prompt_for_fermi_energy()
            _sum_selected_species(fermi_energy)
