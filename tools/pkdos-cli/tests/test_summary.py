from pathlib import Path

from pkdos.commands.summary import generate_summary


def test_generate_summary_writes_summary_file(tmp_path: Path) -> None:
    (tmp_path / "sample.pdos_atm#1(Fe)_wfc#1(s)").write_text("", encoding="utf-8")
    (tmp_path / "sample.pdos_atm#2(C)_wfc#1(p)").write_text("", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("ignore me", encoding="utf-8")

    summary_path = generate_summary(tmp_path)

    assert summary_path.exists()
    content = summary_path.read_text(encoding="utf-8")
    assert "atom_number" in content
    assert "Fe" in content
    assert "C" in content
