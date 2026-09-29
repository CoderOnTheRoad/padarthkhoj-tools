from pathlib import Path

from pkdos.parsers.summary_parser import SummaryParser


def test_parser_builds_atoms_and_orbitals(tmp_path: Path) -> None:
    summary_file = tmp_path / "pkdos_summary.txt"
    summary_file.write_text(
        "atom_number\tspecies\torbitals\n"
        "1\tFe\ts,p\n"
        "2\tC\ts\n",
        encoding="utf-8",
    )

    atoms = SummaryParser.parse(summary_file)

    assert len(atoms) == 2
    assert atoms[0].atom_number == 1
    assert atoms[0].species == "Fe"
    assert atoms[0].orbitals == ["s", "p"]
