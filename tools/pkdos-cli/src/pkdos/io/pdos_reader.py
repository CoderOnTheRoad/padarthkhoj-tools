from __future__ import annotations

from pathlib import Path
from typing import List

import numpy as np


def _read_numeric_data(path: Path) -> tuple[np.ndarray, list[str] | None]:
    with path.open("r", encoding="utf-8") as handle:
        lines = [line.strip() for line in handle if line.strip() and not line.lstrip().startswith("#")]

    if not lines:
        raise ValueError(f"No PDOS data found in {path}")

    first_line = lines[0]
    tokens = first_line.split()
    headers: list[str] | None = None
    if len(tokens) > 0 and not any(token.replace(".", "", 1).replace("-", "", 1).replace("+", "", 1).isdigit() for token in tokens):
        headers = [token.lower() for token in tokens]
        data_lines = lines[1:]
    else:
        data_lines = lines

    if not data_lines:
        raise ValueError(f"No numeric data found in {path}")

    data = np.loadtxt(data_lines, ndmin=2)
    return data, headers


def read_pdos_file(path: str | Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Read a PDOS file with energy and numeric columns for spin-polarized or non-polarized data."""
    pdos_path = Path(path)
    data, headers = _read_numeric_data(pdos_path)

    if data.shape[1] < 2:
        raise ValueError(f"Expected at least 2 columns in {pdos_path}")

    if headers is not None:
        header_lookup = {header: index for index, header in enumerate(headers)}
        energy_index = header_lookup.get("energy")
        ldos_up_index = header_lookup.get("ldos_up")
        ldos_down_index = header_lookup.get("ldos_down")
        if energy_index is None or ldos_up_index is None:
            raise ValueError(f"Could not locate energy and ldos_up columns in {pdos_path}")
        energy = data[:, energy_index]
        ldos_up = data[:, ldos_up_index]
        ldos_down = data[:, ldos_down_index] if ldos_down_index is not None else ldos_up.copy()
        pdos_columns = [index for index in range(data.shape[1]) if index not in {energy_index, ldos_up_index, ldos_down_index}]
        pdos_matrix = data[:, pdos_columns] if pdos_columns else np.empty((energy.size, 0), dtype=float)
        return energy, ldos_up, ldos_down, pdos_matrix

    energy = data[:, 0]
    n_columns = data.shape[1]

    if n_columns == 2:
        ldos_up = data[:, 1]
        ldos_down = ldos_up.copy()
        pdos_matrix = np.empty((energy.size, 0), dtype=float)
    elif n_columns == 3:
        ldos_up = data[:, 1]
        ldos_down = data[:, 1].copy()
        pdos_matrix = data[:, 2:]
    elif n_columns == 4:
        ldos_up = data[:, 1]
        ldos_down = data[:, 2]
        pdos_matrix = data[:, 3:]
    else:
        ldos_up = data[:, 1]
        ldos_down = data[:, 2]
        pdos_matrix = data[:, 3:]

    return energy, ldos_up, ldos_down, pdos_matrix
