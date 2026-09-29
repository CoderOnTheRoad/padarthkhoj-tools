# Padarthkhoj Tools

Padarthkhoj Tools is a browser-based computational materials-science workbench from EMat-AI Lab. It combines crystal editing and visualization, preset and custom reaction-pathway construction, Quantum ESPRESSO input/output workflows, QE and VASP Bader-charge analysis, QE and VASP projected density-of-states analysis, DOS plotting, orbital metrics, vibrational thermochemistry, and free-energy diagrams.

The application is a static, client-side SPA built with vanilla JavaScript, Vite, Three.js, and JSZip. Uploaded scientific files remain in the browser; no backend is required.

## Requirements

- Node.js 20 or newer
- npm
- A modern browser with WebGL support

## Development

```bash
npm ci
npm run dev
```

For the complete user and installation guide, see [the user manual](./etc/user_manual/MANUAL.md).
For architecture, data contracts, directory ownership, and contributor guidance, see [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## PDOS analysis and PKDOS CLI

The **PDOS Analysis** module reads multiple standard Quantum ESPRESSO `projwfc.x` files or a projected VASP `DOSCAR` locally in the browser. It detects atoms, orbital channels, spin mode and supported orbital resolution; validates energy grids; applies an optional energy-reference shift; plots the summed curves; and exports CSV or PNG files. For VASP species contributions, upload the matching `POSCAR` or `CONTCAR` alongside DOSCAR; the application validates the atom count and maps the ordered DOSCAR ions to their chemical species.

The independently installable Python command-line edition is kept in [`tools/pkdos-cli`](./tools/pkdos-cli). The web application offers the prepared archive at `public/downloads/pkdos-cli.zip`.

## DOS Plotter

The separate **DOS Plotter** consumes one or more standardized CSV files exported by PDOS Analysis. Each CSV becomes an editable dataset with per-channel visibility, labels, colors, and line styles. Figures can be rendered individually, as selected overlays, or as automatic multipanel layouts. Spin-down columns are recognized from their names and can be mirrored below zero.

Plot styles include palettes, fonts, line width, background, grid, legend, Fermi/reference line, axis labels, and manual/automatic ranges. A finished style can be saved in browser storage as a named template, applied to the current dataset or every uploaded dataset, and imported/exported as versioned JSON. Output includes size/DPI-aware PNG, editable vector SVG, and batch ZIP export of selected datasets.

## Data privacy and scientific responsibility

Uploaded structures and result files are processed locally in the browser. The static application does not require a server-side upload service. Users remain responsible for validating pseudopotentials, convergence parameters, magnetic states, k-point paths, adsorption geometries, charge conventions, and all generated scientific results before using them in research.

## Citation

Citation metadata is provided in [`CITATION.cff`](./CITATION.cff). Until a software DOI or associated article is available, cite the repository and the exact release or commit used in the calculation workflow.

## Verification

Run the complete local quality gate before submitting a change:

```bash
npm run check
```

This runs ESLint, the scientific regression suite, and the production build. The tests use checked-in CIF and QE fixtures to verify:

- Bravais lattice classification and `ibrav` mapping
- non-orthogonal cell vectors, `celldm`, and k-point meshes
- CIF symmetry expansion and special-position deduplication
- CIF export/reparse round trips within explicit numerical tolerances
- agreement between the CIF editor and batch-generator parsing workflows
- reaction-intermediate radius constraints, collision checks, and exported-CIF reparsing
- ACF.dat parsing, signed Bader-charge calculation, and formula-driven Excel export
- fractional and Cartesian CIF-to-QE coordinate conversion
- QE `vc-relax` final-coordinate extraction and CIF generation
- free-energy CSV parsing, grouping, and ranges
- escaping of file-derived values used in HTML
- spin and non-spin QE PDOS parsing, energy-grid validation, Fermi-level shifting, and summation
- standardized DOS CSV validation and reusable scientific plot-template round trips

GitHub Actions runs the same quality gate for pushes and pull requests.

## Production build

```bash
npm run build
npm run preview
```

The deployable static application is written to `dist/`.

## License

Copyright © 2026 Sourav Ghosh. Padarthkhoj Tools is distributed under the [GNU General Public License v3.0](./LICENSE). Third-party dependencies and scientific data retain their respective licences and attribution requirements.
