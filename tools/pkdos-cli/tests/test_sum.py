from pathlib import Path

import numpy as np
import pandas as pd

from pkdos.analysis.summation import sum_orbitals
from pkdos.commands.sum import _sum_selected_files, collect_matching_pdos_files, sum_selected_files


def test_sum_orbitals_writes_expected_columns(tmp_path: Path) -> None:
    energy = np.array([-0.5, 0.0])
    ldos_up = np.array([1.0, 2.0])
    ldos_down = np.array([0.5, 1.0])
    pdos_matrix = np.array([[0.1, 0.2], [0.3, 0.4]])

    result = sum_orbitals(energy, ldos_up, ldos_down, pdos_matrix, orbital="s")

    assert isinstance(result, pd.DataFrame)
    assert list(result.columns) == ["Energy", "Total_LDOS_up", "Total_LDOS_down", "Total_s_up", "Total_s_down"]
    assert result.shape[0] == 2


def test_collect_matching_pdos_files_filters_by_atom_and_orbital(tmp_path: Path) -> None:
    (tmp_path / "sample.pdos_atm#1(Fe)_wfc#1(s)").write_text("", encoding="utf-8")
    (tmp_path / "sample2.pdos_atm#2(C)_wfc#1(p)").write_text("", encoding="utf-8")

    matches = collect_matching_pdos_files(tmp_path, atom_numbers=[1], orbital="s")

    assert len(matches) == 1
    assert "atm#1" in matches[0].name


def test_sum_orbitals_uses_single_column_for_s_orbital() -> None:
    energy = np.array([-0.5, 0.0])
    ldos_up = np.array([1.0, 2.0])
    ldos_down = np.array([1.0, 2.0])
    pdos_matrix = np.array([[0.1], [0.2]])

    result = sum_orbitals(energy, ldos_up, ldos_down, pdos_matrix, orbital="s")

    assert result.loc[0, "Total_s_up"] == 0.1
    assert result.loc[0, "Total_s_down"] == 0.1


def test_sum_selected_files_sums_across_multiple_inputs(tmp_path: Path) -> None:
    (tmp_path / "a.pdos_atm#1(Fe)_wfc#1(s)").write_text("-0.5 1 2 0.1 0.2\n0.0 2 3 0.3 0.4\n", encoding="utf-8")
    (tmp_path / "b.pdos_atm#2(C)_wfc#1(s)").write_text("-0.5 3 4 0.5 0.6\n0.0 4 5 0.7 0.8\n", encoding="utf-8")

    result = sum_selected_files(tmp_path, orbital="s", fermi_energy=0.0)

    assert result is not None
    assert result.loc[0, "Total_LDOS_up"] == 4.0
    assert result.loc[1, "Total_LDOS_up"] == 6.0
    assert result.loc[0, "Total_s_up"] == 0.6
    assert result.loc[1, "Total_s_up"] == 1.0


def test_sum_selected_files_uses_explicit_subset(tmp_path: Path) -> None:
    first = tmp_path / "a.pdos_atm#1(Fe)_wfc#1(s)"
    second = tmp_path / "b.pdos_atm#2(C)_wfc#1(s)"
    first.write_text("-0.5 1 2 0.1 0.2\n0.0 2 3 0.3 0.4\n", encoding="utf-8")
    second.write_text("-0.5 3 4 0.5 0.6\n0.0 4 5 0.7 0.8\n", encoding="utf-8")

    result = _sum_selected_files([first], orbital="s", fermi_energy=0.0)

    assert result is not None
    assert result.loc[0, "Total_LDOS_up"] == 1.0
    assert result.loc[1, "Total_LDOS_up"] == 2.0
    assert result.loc[0, "Total_s_up"] == 0.1
    assert result.loc[1, "Total_s_up"] == 0.3
