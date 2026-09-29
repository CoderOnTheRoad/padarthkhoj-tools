# Padarthkhoj Tools — User & Installation Manual
**EMat-AI Lab, moderated by Sourav Ghosh**

Padarthkhoj Tools ("Material Search" Tools) is a web-based suite of scientific tools designed to streamline workflows for **Quantum ESPRESSO (QE)** and materials modeling. The application allows users to parse, visualize, edit, and generate crystallographic structure files, build Quantum ESPRESSO inputs via pre-configured calculation protocols, process calculation logs/outputs, and plot free energy profiles.

---

## Table of Contents
1. [System Requirements](#1-system-requirements)
2. [Installation & Setup](#2-installation--setup)
3. [Core Architecture & Technologies](#3-core-architecture--technologies)
4. [Detailed Module Workflows](#4-detailed-module-workflows)
   - [CIF Editor](#cif-editor)
   - [Input Editor](#input-editor)
   - [Output Processor](#output-processor)
   - [Visual CIF Generator](#visual-cif-generator)
   - [Intermediate Maker](#intermediate-maker)
   - [Custom Pathway Builder](#custom-pathway-builder)
   - [Bader Charge Analysis](#bader-charge-analysis)
   - [Free Energy Plotter](#free-energy-plotter)
5. [Troubleshooting & Best Practices](#5-troubleshooting--best-practices)

---

## 1. System Requirements

To run Padarthkhoj Tools locally, you will need:
- **Node.js**: version 18.0.0 or higher.
- **npm** (Node Package Manager): bundled with Node.js.
- **Modern Web Browser**: Google Chrome, Mozilla Firefox, Apple Safari, or Microsoft Edge. A web browser with WebGL support is required for the 3D viewers.

---

## 2. Installation & Setup

Follow these steps to set up and run the application locally on your machine:

### Step 1: Download or Clone the Repository
Extract the files to your desired folder, or clone the repository using git:
```bash
git clone <repository-url>
cd qe-std2-antigravity
```

### Step 2: Install Project Dependencies
Run the command below in your project folder to install Vite, Three.js, JSZip, and other development dependencies:
```bash
npm install
```

### Step 3: Run the Development Server
Launch the local development environment:
```bash
npm run dev
```
Once run, Vite will print a local address in the terminal (usually `http://localhost:5173`). Open this URL in your web browser.

### Step 4: Build for Production (Optional)
If you wish to compile the application into lightweight, static assets for deployment on a server:
```bash
npm run build
```
This creates a `dist/` directory containing optimized HTML, JS, and CSS files. You can preview this production build locally using:
```bash
npm run preview
```

---

## 3. Core Architecture & Technologies

Padarthkhoj Tools is constructed as a modern, high-performance Single Page Application (SPA):
* **Frontend Framework**: Vanilla JS components with modern HTML5.
* **Build Tool**: Vite for extremely fast hot module replacement (HMR) and bundling.
* **3D Visualizations**: Three.js for rendering unit cells, lattices, and atomic sites.
* **Data Packaging**: JSZip for generating and downloading multi-file batches (ZIPs) of structures on-the-fly in the browser.
* **Styling**: Custom modern CSS theme with dark and light modes, responsive design, and CSS variables.

---

## 4. Detailed Module Workflows

Use the sidebar navigation to toggle between the six functional modules of Padarthkhoj Tools:

### CIF Editor
The **CIF Editor** is the entry point for viewing and modifying crystal structures.
1. **Upload**: Drag and drop a `.cif` (Crystallographic Information File) or click to upload.
2. **3D Viewer**: The unit cell is parsed and rendered in 3D:
   * **Left-click + Drag** to rotate.
   * **Right-click + Drag** to pan.
   * **Scroll** to zoom.
   * **Click** on an atom to select it.
3. **Modify Structure**:
   * Select an atom to see its coordinates and element type.
   * Click **Change Element** to substitute it with a different element from the periodic grid.
   * Click **Delete Atom** to remove it from the lattice.
   * Alternatively, **Right-click** on an atom in the 3D canvas to access the context menu (Freeze/Unfreeze, Change Element, Delete).
4. **Export**:
   * Click **Create Input File** at the bottom right to forward the current modified structure into the Quantum ESPRESSO protocol builder.

### Input Editor
The **Input Editor** manages, modifies, and validates Quantum ESPRESSO input files (`.in` / `.pwi`).
1. **Multi-file Tabs**: Upload existing `.in` files, manage multiple files in tab headers, or click `+` to add a new blank file.
2. **Side-by-Side Settings**:
   * For files initiated via the CIF Editor, a graphical **Protocol Settings** sidebar is available.
   * Drag the vertical divider between the input text and Protocol Settings to resize both areas. Focus the divider and use the left/right arrow keys for keyboard resizing, hold Shift for larger steps, or double-click it to restore the default width.
   * **Lattice/Ibrav**: View auto-detected symmetry (Space Group, IT number) and override the Bravais lattice index (`ibrav`).
   * **Parameters**: Easily customize namelist parameters like cutoffs (`ecutwfc`, `ecutrho`), relaxation steps (`nstep`), convergence thresholds (`conv_thr`, `forc_conv_thr`), pseudopotentials mapping, and k-point mesh sizes.
   * Editing these values will automatically regenerate the structured plain-text in the editor.
3. **Shortcuts & Download**:
   * Use **Ctrl+S** or click **Download** to save the active input file.

#### DOS four-file workflow

Selecting **Density of States** creates four tabs named from the CIF file: `_scf.in`, `_nscf.in`, `_dos.in`, and `_submit.sh`. Run them in that order; the shell script automates the sequence with `pw.x`, `pw.x`, and `dos.x` while saving output through `tee`.

The SCF, NSCF, and DOS stages must use the same `prefix` and `outdir`. SCF defaults to `occupations='smearing'`; DOS NSCF defaults to Blöchl `occupations='tetrahedra'`, which requires a uniform automatic k-point grid. The NSCF mesh defaults to three times the SCF mesh and `nbnd` defaults to four times the atom count. These are initial estimates: carefully convergence-test k-point density, band count, cutoffs, smearing, spin settings, and the DOS energy window for the actual material. `Emin`, `Emax`, and `DeltaE` are optional DOS-grid controls. On clusters, add the locally required scheduler directives and `srun`/`mpirun` command only after checking the site documentation.

The right-hand **Protocol Settings** panel follows the selected workflow tab. The SCF tab shows SCF settings, the NSCF tab shows NSCF settings, the DOS tab shows only the shared `prefix`/`outdir` and DOS energy-grid settings, and the submit-script tab shows execution guidance instead of Quantum ESPRESSO parameter dropdowns. Changes to shared workflow values still regenerate the coordinated files.

#### SCF and structural-relaxation submit scripts

The **Self-Consistent Field** protocol now creates `_scf.in` and `_submit.sh`; the **Structural Relaxation** protocol creates `_relax.in` and `_submit.sh`. Each script runs its input through `pw.x`, records output with `tee`, and uses `set -euo pipefail`. The submit tab contains execution guidance only. Add scheduler directives, environment modules, and `mpirun`/`srun` commands according to the local cluster configuration.

#### Bands three-file workflow

Selecting **Band Structure** creates `_scf.in`, `_nscf.in`, `_bands.in`, and `_submit.sh`. The middle file is run with `pw.x` using `calculation='bands'`, Gaussian smearing by default, and an explicit `K_POINTS crystal_b` path. The generator chooses an initial suggested path from the detected `ibrav`; the path-preset dropdown also contains alternatives for other lattice families. Its Protocol Settings panel provides an ordered path builder: select each high-symmetry point, set the interpolation count to the next point, add vertices, or remove unwanted vertices. Every preset is only a starting point because point labels and reciprocal coordinates depend on the primitive-cell convention. Cross-verify the complete path with published literature or a trusted Brillouin-zone resource for the exact material before running a calculation.

The `_bands.in` file is for `bands.x` and exposes `prefix`, `outdir`, and `filband`. Keep `prefix` and `outdir` identical in all three inputs. The submit script runs SCF, band-path NSCF, and `bands.x` sequentially with `tee` and stops if any stage fails. Add cluster scheduler, module, and MPI launcher commands only as required locally.

#### Charge-density three-file workflow

Selecting **Charge Density** creates `_scf.in`, `_charge.in`, and `_submit.sh`. The SCF file runs with `pw.x`; the charge file runs with `pp.x`; the submit script runs both sequentially through `tee` with `pipefail`. The post-processing defaults reproduce a total three-dimensional charge-density cube: `plot_num=0`, `nfile=1`, `iflag=3`, `output_format=6`, and `fileout='ciffilename.cube'`.

The charge tab exposes only `&INPUTPP` and `&PLOT` controls. `prefix` and `outdir` must exactly match the SCF file. `plot_num=0` means total electron density; change it only after checking the `pp.x` documentation for the intended physical quantity. The defaults `iflag=3` and `output_format=6` produce a 3D Gaussian cube file, so retain a `.cube` filename for that format.

#### Bader charge four-file workflow

Selecting **Bader Charge Calculation** creates `_scf.in`, `_allelectron.in`, `_valenceelectron.in`, and `_submit.sh`. The SCF input runs with `pw.x`. The two density inputs run with `pp.x`: all-electron density uses `plot_num=21` and writes `_allelec.cube`, while valence density uses `plot_num=0` and writes `_valence.cube`. Both use `nfile=1`, `iflag=3`, and `output_format=6` by default.

The submit script runs all three QE stages sequentially with `tee` and `pipefail`. It generates the cube inputs needed by common external Bader-analysis programs but does not run a Bader executable. Keep `prefix` and `outdir` identical in all three QE inputs, and verify that the chosen pseudopotentials and `plot_num=21` reconstruction are appropriate for the intended analysis.

#### Vibrational-energy five-file workflow

Selecting **Vibrational Energy** creates `_scf.in`, `_hess.in`, `_ph.in`, `_dyn.in`, and `_submit.sh`. The execution order is `pw.x`, conditionally `d3hess.x`, `ph.x`, and `dynmat.x`. The default phonon calculation is at Γ (`0 0 0`), uses `tr2_ph=1.0d-14`, writes `ciffilename.dyn`, and applies `asr='crystal'` in dynmat.

The Hessian stage is active only when the SCF uses `vdw_corr='dft-d3'`. In that case the SCF defaults to `dftd3_threebody=.false.`, `_hess.in` writes `ciffilename.hess`, and `_ph.in` receives a matching `dftd3_hess` tag. If another dispersion option is selected, the Hessian tab explains that it is not required, the phonon input omits `dftd3_hess`, and the submit script skips `d3hess.x`. Verify the acoustic sum rule and q point for the physical dimensionality and desired modes.

### Output Processor
This module processes output files generated from Quantum ESPRESSO calculations and contains three sub-panels:
* **QE Output to CIF/Positions**:
  * Upload `.out`, `.log`, or `.pwout` files from relaxation calculations.
  * The tool parses the file to determine if the relaxation converged (fully relaxed) and details each step.
  * Displays cell vectors, lattice parameters, volume changes (initial vs. final structure), and atomic positions.
  * Download the final relaxed state as a new `.cif` file or as an `ATOMIC_POSITIONS` block.
  * Supports bulk downloading all parsed structures in a ZIP archive.
* **Extract Coordinates**:
  * Upload multiple `.cif` files.
  * Configure coordinates to extract as Cartesian (**Angstrom**) or fractional (**Crystal**), select decimal precision, and batch export them as text blocks or a ZIP file.
* **Input Fixer**:
  * **Combine .in + .out** (Recommended): Upload your original `.in` file along with the relaxation `.out` file. The tool patches the `ATOMIC_POSITIONS` and `CELL_PARAMETERS` in the input file with the final relaxed values, keeping all your custom calculations, k-points, and comments untouched.
  * **Reconstruct from .out only**: Upload the `.out` file, and the tool reconstructs a complete `.in` file from scratch based on the output file's parameters.

### Visual CIF Generator

The **Visual CIF Generator** supports high-throughput substitution through the 3D structure viewer. Upload a template CIF, click atomic sites in the Three.js canvas, assign one or more replacement elements to each selected site, review the Cartesian-product configuration count, and export the generated CIF structures as a ZIP archive. This is the only multi-CIF generator in the application; the former table-based generator has been removed.

#### Shared bond controls

Every CIF-based 3D viewer includes a compact **Bonds** menu. Bonds use one neutral colour and are rendered as a single lightweight line-segment geometry. Automatic detection accepts an atom pair when its periodic minimum-image distance is between 0.1 angstrom and an adjustable percentage of the sum of the two covalent radii; the default is 115%. Users can hide all bonds or add VESTA-style element-pair rules with explicit minimum and maximum distances. A custom A–B rule overrides the automatic cutoff for that pair and can be removed from the rule list.

### Intermediate Maker

The **Intermediate Maker** creates graphical starting structures for reaction pathways. Four families are active. **NRR** contains NO3 to NH3 and N2 to NH3. **HER** contains H*. **OER/ORR** contains O*, OH*, and OOH*. **CO2RR** contains suggested CO2 to C2H4 and CO2 to C2H5OH routes extracted from supplied adsorbed Quantum ESPRESSO inputs for a Co single-atom catalyst, plus a separate CHO alternative. The two C2 routes share CO2, COOH, CO, co-adsorbed CO–CO, COH, COCOH, CCO, CHCO, CHCHO, and CH2CHO. The ethylene route then terminates at C2H4, while the ethanol route continues through CH3CHO and CH3CH2O to C2H5OH. CO2 is O-bound in the supplied structure; CCO uses its second carbon; CHCHO, CH2CHO, CH3CHO, and CH3CH2O are O-bound. C2H4 and ethanol remain provisional molecule-derived endpoints because matching adsorbed Co-SAC inputs were not supplied. Cross-check every generated geometry for the target catalyst.

The rebuilt workflow has three focused stages. In **Surface**, upload the catalyst, rotate it to a useful view, select one active-site atom, and lock the view. Anchor and Pathway stages each retain their own synchronized **Unlock view / Lock view** control: unlock to rotate, pan, or zoom the CIF; lock again to drag the anchor or intermediate. In **Anchor**, drag a small cyan adsorption anchor around the site or enter its distance and angular direction numerically. The default distance is 1.8 angstrom. The line and label show the active-site-to-anchor vector, while an optional clearance bubble warns about nearby catalyst atoms.

The anchor vector is also the surface-normal direction used for adsorption. When an intermediate is created, its binding atom is placed exactly at the anchor and its molecular adsorption axis is automatically rotated to point outward along that vector. Twist rotates around the outward axis; tilt deliberately moves the molecule away from perpendicular alignment.

In **Pathway**, select NRR, HER, or OER/ORR. When NRR is active, use the Reaction dropdown to choose NO3→NH3 or N2→NH3. The supplied N2-path files begin at NNH rather than a separate adsorbed N2 template. For HER, **Generate H adsorption** places one H atom exactly at the selected anchor. OER/ORR generates O, OH, and OOH; the oxygen atom not bearing hydrogen is the OOH surface-binding atom. Each multi-state pathway receives independent saved anchor direction, distance, twist, and tilt values. Only one state is previewed at a time. Drag the glowing intermediate to move its anchor, or use **Apply placement to all** when a shared placement is intended.

Download the selected intermediate as a CIF or export the entire pathway as a ZIP. Every generated structure is only an initial geometry. Inspect periodic images and bonding, compare with chemical knowledge and literature, then perform an appropriate constrained or unconstrained geometry optimization before using energies from it.

### Custom Pathway Builder

The **Custom Pathway Builder** is separate from the preset Intermediate Maker. Name a pathway, then choose or drag one or multiple molecule-only CIF files. Multiple files enter a queue and open sequentially, because the binding atom must be confirmed separately for every molecule. Inspect each molecule in 3D and click the atom that should bind to the catalyst active site. Add the intermediates in reaction order; the arrow controls allow this order to be corrected later.

Use **Export pathway JSON** before refreshing or closing the browser tab. The JSON preserves the pathway name, ordered intermediate labels, original filenames, elements, relative Cartesian geometry, and the selected binding atom. Use **Import pathway JSON** to continue work later. Invalid, incomplete, or incompatible JSON files are rejected with an explanation.

Choose **Use with catalyst**, upload the catalyst CIF, and select its active-site atom. The remaining workflow follows Intermediate Maker: lock the view, set the anchor distance and outward direction, generate the full pathway, adjust twist or tilt, inspect clearance and collision warnings, and export one CIF or a ZIP. These structures are only starting geometries and require scientific inspection and geometry optimization.

### Bader Charge Analysis

Upload an `ACF.dat` produced by the Henkelman Bader program and the matching Quantum ESPRESSO SCF input. The page preserves the ACF atom number, coordinates, integrated `CHARGE`, minimum distance, and atomic volume, while obtaining the element identities and exact ordering from the SCF `ATOMIC_POSITIONS` block. Position 1 is ACF atom 1, position 2 is ACF atom 2, and so forth. The coordinate tag may be `(angstrom)`, `{crystal}`, `bohr`, `alat`, or another QE-supported form because only the ordered element labels are used for this mapping. An atom-count mismatch stops the workflow. The interface detects the unique atom types and asks once for each type's pseudopotential frozen-core count; that value is propagated to every atom of the same element. The signed value is calculated as `atomic number − core electrons − integrated Bader electrons`; positive values indicate electron loss and negative values indicate electron gain.

Choose **Excel only** to export the analysis without a structure, or **Visualize + Excel** and upload a CIF with exactly the same atom count and element ordering as the SCF input. The representation selector offers standard element-coloured balls with red/green charge rings, or red/green charge-coloured atomic balls. Rings can be sharp or faded, with an independent 0–100% fade-strength control. The live and PNG legends adapt to the representation. The label selector can show atom number and element, signed charge, both, or no labels, and a 50–200% text-size control adjusts the compact decluttered labels. The Excel workbook retains the seven ACF columns, inserts `ATOM TYPE`, and adds `BADER CHARGE`; a Metadata sheet stores atomic numbers, core-electron inputs, the charge convention, and ACF footer totals. Charge cells use auditable formulas referencing that sheet.

The labelled current 3D view can be saved as PNG after choosing its width, height, and DPI. The application matches ACF and CIF records strictly by row order, so verify ordering before interpreting or publishing the visualization.

### Free Energy Plotter
A full-featured vector plotter for chemical reaction pathway free energy diagrams.
1. **Data Entry**: Drag and drop a 3-column CSV or input values directly into the table.
   * **CSV Schema**: `branch_index, sub_branch_name, free_energy_value` (e.g. `1, Path_A, -0.42`).
2. **Interactive Customization**:
   * Single-click on any line in the plot to adjust its branch line color.
   * Double-click a state bar to edit specific element styles.
   * Right-click lines to delete connections.
   * Click-drag from one state bar to another to draw custom transitions/connections.
3. **Publication Quality Export**:
   * Set dimensions (width/height in inches or pixels).
   * Customize resolution (DPI settings up to 300+ for print publications).
   * Export individual charts, combined charts, or a packaged ZIP file.

---

## 5. Troubleshooting & Best Practices

* **WebGL Errors in 3D Viewers**: Make sure hardware acceleration is enabled in your browser settings if the unit cell does not load on the canvas.
* **Invalid ibrav Errors**: Overriding `ibrav` from auto-detected space group values requires careful cell configuration. Ensure you review the `CELL_PARAMETERS` section in the Input Editor if `ibrav` is set to `0`.
* **Pseudopotentials (UPF Files)**: Ensure that your `pseudo_dir` path points to the correct local folder containing valid `.UPF` files for Quantum ESPRESSO during local simulation runs.
* **CSV Parsing Errors**: Double-check that your CSV files do not contain empty lines or invalid text formatting. Lines starting with `#` are treated as comments and will be ignored.
