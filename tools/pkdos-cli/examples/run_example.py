from pathlib import Path

from pkdos.commands.summary import generate_summary
from pkdos.commands.sum import _sum_selected_files
from pkdos.io.pdos_reader import read_pdos_file


def main() -> None:
    example_dir = Path(__file__).resolve().parent
    project_dir = example_dir.parent

    sample_file = example_dir / "sample_pdos_multi_orbital.txt"
    summary_file = example_dir / "sample_summary.txt"
    output_file_s = project_dir / "tot_dos_s.csv"
    output_file_p = project_dir / "tot_dos_p.csv"
    output_file_d = project_dir / "tot_dos_d.csv"
    output_file_f = project_dir / "tot_dos_f.csv"

    if not sample_file.exists():
        raise FileNotFoundError(sample_file)
    if not summary_file.exists():
        raise FileNotFoundError(summary_file)

    target_file = project_dir / "sample.pdos_atm#1(Fe)_wfc#1(s)"
    target_file.write_text(sample_file.read_text(encoding="utf-8"), encoding="utf-8")
    summary_target = project_dir / "pkdos_summary.txt"
    summary_target.write_text(summary_file.read_text(encoding="utf-8"), encoding="utf-8")

    generate_summary(project_dir)
    result_s = _sum_selected_files([target_file], orbital="s", fermi_energy=0.0)
    if result_s is not None:
        result_s.to_csv(output_file_s, index=False)
        print(f"Wrote {output_file_s}")

    result_p = _sum_selected_files([target_file], orbital="p", fermi_energy=0.0)
    if result_p is not None:
        result_p.to_csv(output_file_p, index=False)
        print(f"Wrote {output_file_p}")

    result_d = _sum_selected_files([target_file], orbital="d", fermi_energy=0.0)
    if result_d is not None:
        result_d.to_csv(output_file_d, index=False)
        print(f"Wrote {output_file_d}")

    result_f = _sum_selected_files([target_file], orbital="f", fermi_energy=0.0)
    if result_f is not None:
        result_f.to_csv(output_file_f, index=False)
        print(f"Wrote {output_file_f}")

    print("\nGenerated files:")
    for output_file in [output_file_s, output_file_p, output_file_d, output_file_f]:
        if output_file.exists():
            print(f"- {output_file.name}: {', '.join(result_s.columns)}")


if __name__ == "__main__":
    main()
