from __future__ import annotations

from typing import Dict, List, Sequence

import numpy as np
import pandas as pd


def validate_energy_grid(energy: np.ndarray, reference_energy: np.ndarray, context: str = "") -> None:
    """Ensure that energy grids match before summation."""
    if energy.shape != reference_energy.shape:
        raise ValueError(f"Different number of energy points in {context}")
    if not np.allclose(energy, reference_energy):
        raise ValueError(f"Incompatible energy grid in {context}")


def _ensure_column_values(energy: np.ndarray, pdos_matrix: np.ndarray, index: int) -> np.ndarray:
    if pdos_matrix.ndim == 1:
        return np.zeros_like(energy, dtype=float)
    if pdos_matrix.shape[1] > index:
        return pdos_matrix[:, index]
    return np.zeros_like(energy, dtype=float)


def _orbital_column_map(orbital: str, pdos_matrix: np.ndarray) -> Dict[str, np.ndarray]:
    """Map orbital labels to available PDOS columns when possible."""
    if orbital == "s":
        return {
            "Total_s_up": _ensure_column_values(np.zeros_like(ldos_up := np.zeros(1), dtype=float), pdos_matrix, 0),
            "Total_s_down": _ensure_column_values(np.zeros_like(ldos_up), pdos_matrix, 1),
        }
    if orbital == "p":
        return {
            "pz_up": _ensure_column_values(np.zeros(1), pdos_matrix, 0),
            "pz_down": _ensure_column_values(np.zeros(1), pdos_matrix, 1),
            "px_up": _ensure_column_values(np.zeros(1), pdos_matrix, 2),
            "px_down": _ensure_column_values(np.zeros(1), pdos_matrix, 3),
            "py_up": _ensure_column_values(np.zeros(1), pdos_matrix, 4),
            "py_down": _ensure_column_values(np.zeros(1), pdos_matrix, 5),
        }
    if orbital == "d":
        return {
            "dz2": _ensure_column_values(np.zeros(1), pdos_matrix, 0),
            "dzx": _ensure_column_values(np.zeros(1), pdos_matrix, 1),
            "dzy": _ensure_column_values(np.zeros(1), pdos_matrix, 2),
            "dx2-y2": _ensure_column_values(np.zeros(1), pdos_matrix, 3),
            "dxy": _ensure_column_values(np.zeros(1), pdos_matrix, 4),
        }
    return {}


def sum_orbitals(
    energy: np.ndarray,
    ldos_up: np.ndarray,
    ldos_down: np.ndarray,
    pdos_matrix: np.ndarray,
    orbital: str,
) -> pd.DataFrame:
    """Create a DataFrame with summed LDOS and PDOS values for a chosen orbital."""
    if orbital == "s":
        columns = ["Energy", "Total_LDOS_up", "Total_LDOS_down", "Total_s_up", "Total_s_down"]
        total_s_up = _ensure_column_values(energy, pdos_matrix, 0)
        total_s_down = total_s_up if pdos_matrix.shape[1] <= 1 else _ensure_column_values(energy, pdos_matrix, 1)
        values = [energy, ldos_up, ldos_down, total_s_up, total_s_down]
    elif orbital == "p":
        columns = ["Energy", "Total_LDOS_up", "Total_LDOS_down", "pz_up", "pz_down", "px_up", "px_down", "py_up", "py_down"]
        values = [energy, ldos_up, ldos_down]
        values.extend([_ensure_column_values(energy, pdos_matrix, idx) for idx in range(6)])
    elif orbital == "d":
        columns = ["Energy", "Total_LDOS_up", "Total_LDOS_down", "dz2", "dzx", "dzy", "dx2-y2", "dxy"]
        values = [energy, ldos_up, ldos_down]
        values.extend([_ensure_column_values(energy, pdos_matrix, idx) for idx in range(5)])
    else:
        columns = ["Energy", "Total_LDOS_up", "Total_LDOS_down", "Total_f_up", "Total_f_down"]
        values = [energy, ldos_up, ldos_down, _ensure_column_values(energy, pdos_matrix, 0), _ensure_column_values(energy, pdos_matrix, 1)]

    return pd.DataFrame(np.column_stack(values), columns=columns)
