# Example workflow

This directory contains a tiny example PDOS file and a matching summary file so you can try the package end to end.

The PDOS file is arranged as:

- first column: energy
- second column: LDOS up
- third column: LDOS down
- remaining columns: PDOS values

A header-based example is also available in [sample_pdos_header.txt](sample_pdos_header.txt), which uses the column names `energy`, `ldos_up`, and `ldos_down`. A more realistic multi-orbital example is included in [sample_pdos_multi_orbital.txt](sample_pdos_multi_orbital.txt).

Example usage:

```bash
cp examples/sample_pdos.txt sample.pdos_atm#1(Fe)_wfc#1(s)
cp examples/sample_summary.txt pkdos_summary.txt
pkdos summary
pkdos sum
```

You can also run the full example automatically:

```bash
python examples/run_example.py
```

Or with the bundled convenience target:

```bash
make example
```

The expected CSV output for the sample data is shown in [expected_output.csv](expected_output.csv).
