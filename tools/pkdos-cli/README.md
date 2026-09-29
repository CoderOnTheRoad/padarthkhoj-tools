# PKDOS CLI

pkdos is a professional Python package for analyzing Quantum ESPRESSO projected density of states (PDOS) data from the command line.

This directory is the downloadable command-line companion to the graphical **PDOS Analysis** module in Padarthkhoj Tools. It runs locally and does not require the web application.

## Features

- Discover PDOS files in the current directory
- Generate a structured summary report
- Run an interactive summation workflow for s, p, d, and f orbitals
- Write CSV outputs for selected atoms or species
- Validate energy grids before combining data

## Installation

Install from the project root:

```bash
python -m pip install .
```

## Usage

Generate a summary of available PDOS files:

```bash
pkdos summary
```

Start the interactive summation workflow:

```bash
pkdos sum
```

## Example

A small example workflow is included in [examples/README.md](examples/README.md). It demonstrates the expected PDOS file layout and includes a runnable script at [examples/run_example.py](examples/run_example.py). A convenience target is also available via [Makefile](Makefile).

## Development

Run the test suite:

```bash
python -m pytest -q
```

## Scope

PKDOS consumes the per-atom/per-wavefunction files produced by Quantum ESPRESSO `projwfc.x`. Ensure the files follow QE naming conventions such as `prefix.pdos_atm#1(Fe)_wfc#1(s)`. Always inspect the generated CSV before using it in publication-quality analysis, particularly for noncollinear or spin-orbit calculations.

## License

MIT
