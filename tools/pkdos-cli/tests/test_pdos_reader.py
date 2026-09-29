from pathlib import Path

import numpy as np

from pkdos.io.pdos_reader import read_pdos_file


def test_read_pdos_file_parses_numeric_data(tmp_path: Path) -> None:
    pdos_file = tmp_path / "sample.pdos"
    pdos_file.write_text(
        "# comment\n"
        "-0.5 0.1 0.2 0.3 0.4\n"
        "0.0 0.2 0.3 0.4 0.5\n",
        encoding="utf-8",
    )

    energy, ldos_up, ldos_down, pdos_matrix = read_pdos_file(pdos_file)

    assert np.allclose(energy, np.array([-0.5, 0.0]))
    assert np.allclose(ldos_up, np.array([0.1, 0.2]))
    assert np.allclose(ldos_down, np.array([0.2, 0.3]))
    assert pdos_matrix.shape == (2, 2)


def test_read_pdos_file_supports_non_spin_polarized_data(tmp_path: Path) -> None:
    pdos_file = tmp_path / "sample_nonspin.pdos"
    pdos_file.write_text(
        "-0.5 0.1 0.3\n"
        "0.0 0.2 0.4\n",
        encoding="utf-8",
    )

    energy, ldos_up, ldos_down, pdos_matrix = read_pdos_file(pdos_file)

    assert np.allclose(energy, np.array([-0.5, 0.0]))
    assert np.allclose(ldos_up, np.array([0.1, 0.2]))
    assert np.allclose(ldos_down, np.array([0.1, 0.2]))
    assert pdos_matrix.shape == (2, 1)


def test_read_pdos_file_supports_realistic_spin_layout(tmp_path: Path) -> None:
    pdos_file = tmp_path / "sample_realistic.pdos"
    pdos_file.write_text(
        "-0.5 0.1 0.2 0.3 0.4\n"
        "0.0 0.2 0.3 0.4 0.5\n",
        encoding="utf-8",
    )

    energy, ldos_up, ldos_down, pdos_matrix = read_pdos_file(pdos_file)

    assert np.allclose(energy, np.array([-0.5, 0.0]))
    assert np.allclose(ldos_up, np.array([0.1, 0.2]))
    assert np.allclose(ldos_down, np.array([0.2, 0.3]))
    assert pdos_matrix.shape == (2, 2)


def test_read_pdos_file_supports_header_names(tmp_path: Path) -> None:
    pdos_file = tmp_path / "sample_header.pdos"
    pdos_file.write_text(
        "energy ldos_up ldos_down pdos\n"
        "-0.5 0.1 0.2 0.3\n"
        "0.0 0.2 0.3 0.4\n",
        encoding="utf-8",
    )

    energy, ldos_up, ldos_down, pdos_matrix = read_pdos_file(pdos_file)

    assert np.allclose(energy, np.array([-0.5, 0.0]))
    assert np.allclose(ldos_up, np.array([0.1, 0.2]))
    assert np.allclose(ldos_down, np.array([0.2, 0.3]))
    assert pdos_matrix.shape == (2, 1)
