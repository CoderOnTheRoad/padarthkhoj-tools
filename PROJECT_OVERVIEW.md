# Padarthkhoj Tools — Project Overview

> Start here before modifying the project. This document gives agents and contributors enough context to navigate the repository without opening every source file. Update it whenever modules, public data contracts, commands, or architecture change.

## 1. Project purpose

Padarthkhoj Tools is a static, browser-only scientific workflow application developed by EMat-AI Lab. It supports common crystallography and Quantum ESPRESSO (QE) tasks:

- loading, visualizing, editing, and exporting CIF crystal structures;
- generating QE input files from CIF data and calculation protocols;
- processing QE output and extracting relaxed structures;
- repairing existing QE input files with final relaxation coordinates;
- generating substituted CIF structures by selecting sites in a 3D viewer;
- placing reaction intermediates graphically around a selected active site;
- parsing, tabulating, visualizing, and exporting Bader charges from ACF.dat;
- building and exporting free-energy pathway diagrams.
- calculating named PDOS occupancies and energy centres from multiple analyzer CSV files, including reusable formula and template workflows.

All uploaded files are processed locally in the browser. There is no backend, database, authentication layer, or server-side scientific computation.

## 2. Technology and runtime model

- **Language:** modern JavaScript using native ES modules
- **UI architecture:** vanilla JavaScript classes and imperative DOM rendering
- **Build/dev server:** Vite
- **3D rendering:** Three.js
- **ZIP generation:** JSZip
- **Styling:** custom CSS with shared variables and light/dark themes
- **Tests:** Node.js built-in test runner (`node --test`)
- **CI:** GitHub Actions

Despite some React-related development packages remaining in `package.json`, the application is **not a React application**. `vite.config.js` has no React plugin, and page classes write directly to DOM containers.

The application is a single-page application with an in-memory router. All page modules are currently imported eagerly, so the initial bundle includes every feature.

## 3. Repository structure

```text
.
├── .github/
│   └── workflows/
│       └── quality.yml              # CI: install, lint, test, production build
├── public/
│   ├── favicon.svg                  # Static favicon copied by Vite
│   └── icons.svg                    # Shared static icon asset
├── src/
│   ├── components/
│   │   ├── BaderChargeViewer.js     # Red/green charge glow, labels, PNG capture
│   │   ├── IntermediatePlacementViewer.js # Active-site sphere and adsorbate preview
│   │   ├── ThreeViewer.js           # CIF Editor Three.js renderer and atom picking
│   │   └── VisSelectViewer.js       # Multi-site selection viewer for visual substitutions
│   ├── data/
│   │   ├── elements.js              # Element colors, radii, masses, lookup helpers
│   │   ├── co2rrIntermediates.js     # Supplied CO2RR C2 adsorbates and suggested branches
│   │   ├── nrrIntermediates.js       # NO3→NH3 adsorbate templates from supplied CIFs
│   │   ├── reactionPathways.js       # Active NRR/HER/OER-ORR registry and adsorbate templates
│   │   └── pseudos.js               # Authoritative allowed UPF filename inventory
│   ├── lib/
│   │   ├── baderAnalysis.js         # ACF parser, charge calculation, XLSX export
│   │   ├── bonding.js               # Shared periodic bond inference and controls
│   │   ├── cifGenerator.js          # Visual substitution parser, combinations, and ZIP export
│   │   ├── cifParser.js             # CIF Editor parser, symmetry expansion, CIF export
│   │   ├── cifSymmetry.js           # Space groups, lattice/ibrav/celldm/k-point logic
│   │   ├── cifToQE.js               # General CIF tokenizer and ATOMIC_POSITIONS export
│   │   ├── customPathway.js          # Portable custom-pathway JSON schema and validation
│   │   ├── freeEnergyExport.js      # Canvas/PNG and bulk ZIP export
│   │   ├── freeEnergyInteraction.js # Plot hit-testing and mouse/keyboard interaction
│   │   ├── freeEnergyParser.js      # CSV parsing, grouping, ranges, palette
│   │   ├── freeEnergyPlot.js        # Canvas plot engine and plot configuration
│   │   ├── html.js                  # Shared HTML escaping for file-derived values
│   │   ├── intermediateMaker.js     # Placement geometry, collision checks, CIF export
│   │   ├── qeGenerator.js           # QE protocols and full input-file generation
│   │   ├── qeInputGenerator.js      # QE output extraction and input patch/rebuild logic
│   │   └── qeParser.js              # QE output-to-structure parser and CIF export
│   ├── pages/
│   │   ├── BaderChargeAnalysis.js   # ACF inputs, Excel-only and CIF visualization flows
│   │   ├── CifEditor.js             # CIF editing page and global structure workflow
│   │   ├── CustomPathwayBuilder.js   # User-defined adsorbate pathways and placement workflow
│   │   ├── FreeEnergyPlotter.js     # Free-energy plot UI, tabs, styles, annotations
│   │   ├── InputEditor.js           # Multi-tab QE input editor and protocol settings
│   │   ├── IntermediateMaker.js      # Graphical reaction-intermediate workflow
│   │   ├── OutputProcessor.js       # Output→CIF, extraction, and input-fixer panels
│   │   ├── ProtocolSelector.js      # Calculation protocol and lattice selection
│   │   └── VisMultiCifGenerator.js  # 3D-driven substitution workflow
│   ├── styles/
│   │   ├── baderChargeAnalysis.css  # Bader analysis table and viewer layout
│   │   ├── freeEnergyPlotter.css    # Free-energy plotter styles
│   │   ├── intermediateMaker.css     # Intermediate-maker layout and controls
│   │   ├── main.css                 # App shell, common components, most page styles
│   │   └── visMultiCifGenerator.css # Visual generator styles
│   └── main.js                      # App state, page registry, router, theme, startup
├── test/
│   ├── fixtures/
│   │   ├── nacl-symmetry.cif        # Symmetry expansion/special-position fixture
│   │   ├── triclinic.cif            # Non-orthogonal cell and round-trip fixture
│   │   └── vc-relax.out             # QE relaxation-output fixture
│   └── core.test.js                 # Scientific and security regression tests
├── dist/                            # Generated production build; do not edit manually
├── index.html                       # App shell, sidebar, top bar, shared modals
├── package.json                     # Dependencies and npm commands
├── vite.config.js                   # Minimal Vite configuration
├── eslint.config.js                 # Browser/ES-module lint configuration
├── README.md                        # Concise setup and verification guide
├── MANUAL.md                        # Full user and installation manual
└── PROJECT_OVERVIEW.md              # This architecture and contributor guide
```

Other root-level `cif_parser*.html` files are standalone reference/prototype artifacts. They are not imported by the Vite application. `MANUAL.txt` is a plain-text manual copy. `ematai_lab_logo.png` is the logo consumed by `index.html`.

## 4. Application bootstrap and routing

`src/main.js` owns the global application shell.

Its `PAGE_CONFIG` maps page identifiers to page classes. Navigation performs this sequence:

1. call `destroy()` on the active page when available;
2. clear `#page-content`;
3. update sidebar and top-bar state;
4. construct the new page with the shared application state;
5. call the page's `render()` method.

There is no URL-based router or browser-history integration. Navigation is entirely in memory.

The shared `appState` is the cross-page contract:

```js
{
  cifData: null,          // parsed/edited CIF structure
  cifFilename: null,      // source filename
  selectedAtom: -1,       // current atom selection
  pendingProtocol: null,  // selected QE protocol awaiting generation
  generatedInput: null,   // { text, filename } passed into Input Editor
  generatedInputs: null,  // coordinated four-file DOS workflow
}
```

Some pages add related state fields dynamically, such as multi-atom selections. Before changing an `appState` field, search all references because it acts as the integration layer between otherwise independent page classes.

## 5. Main workflows and data flow

### CIF Editor → Protocol Selector → Input Editor

```text
CIF text
  → cifParser.parseCIF()
  → appState.cifData
  → CifEditor + ThreeViewer
  → ProtocolSelector
  → qeGenerator.generateQEInput()
  → appState.generatedInput
  → InputEditor
```

The CIF Editor parser expands symmetry operations, converts fractional coordinates to Cartesian coordinates, and returns approximately:

```js
{
  cell: { a, b, c, alpha, beta, gamma }, // angles are radians here
  atoms: [{ sym, fx, fy, fz, x, y, z }],
  mat,                                    // fractional→Cartesian matrix
  symmetry                                // result from parseCIFSymmetry()
}
```

This is the primary editable-structure representation. Do not assume that other CIF parsers use identical field names.

### Visual CIF generation

```text
CIF text
  → cifGenerator.parseCIF()
  → VisSelectViewer site selection
  → replacement-element lists
  → generateCombinations() / applyCombination()
  → exportZIP()
```

The visual generator's parser preserves original CIF lines and token positions so substitutions do not reserialize unrelated content. Its atom records contain original fractional strings (`x/y/z`), Cartesian coordinates (`cx/cy/cz`), and source-line metadata. This schema is intentionally different from the CIF Editor schema. The former table-based Multi CIF page has been removed; `VisMultiCifGenerator.js` is the sole consumer of this substitution engine.

### Reaction-intermediate placement

```text
Catalyst CIF text
  → cifGenerator.parseCIF()
  → IntermediatePlacementViewer active-site selection
  → adsorption anchor + outward normal
  → placeAnchoredIntermediate() / evaluatePlacement()
  → buildIntermediateCIF() or pathway exportZIP()
```

`nrrIntermediates.js` stores adsorbate-only templates extracted from the supplied catalyst-attached NO3→NH3 examples. `reactionPathways.js` registers both NRR reactions, the HER single-H pathway, and shared OER/ORR O/OH/OOH templates. The N2→NH3 templates are extracted from nine relaxed Ni-site CIFs after removing their identical 57-atom surface; their first adsorbate N is the Ni-bound atom. The supplied set starts at NNH and continues through NNH2, NHNH, NHNH2, NH2NH2, N, NH, NH2, and NH3. Coordinates are Cartesian offsets relative to a declared binding atom; example catalysts are never copied into generated structures. `placeAnchoredIntermediate()` places that binding atom at the user-selected anchor and retains the supplied internal geometry.

`CustomPathwayBuilder.js` provides the parallel user-defined workflow. It converts each uploaded molecule-only CIF into coordinates relative to the selected binding atom. `customPathway.js` validates and versions the portable JSON representation, preserving pathway order, labels, source filenames, elements, geometry, and binding indices. JSON is the durable handoff format; in-page work is deliberately treated as temporary and guarded by an unsaved-change warning.

The page is a three-stage state machine: Surface selection, Anchor placement, and Pathway workspace. Generating the pathway creates a separate placement state for every template (`distance`, `direction`, `twist`, and `tilt`). The viewer renders only the selected preview, with emissive atoms, a draggable anchor, distance line/label, and optional clearance bubble. Dragging updates only the active template; Apply placement to all copies its state across the pathway. Export rebuilds one P1 CIF per stored state and wraps fractional coordinates into the unit cell.

Unlocked mode enables camera orbit/pan/zoom and active-atom selection. Locked mode freezes those base interactions while retaining anchor/intermediate dragging on an invisible constant-distance guide. Resetting the active site unlocks the viewer and clears placement graphics.

The radius and collision threshold are geometric controls, not chemistry validation. Outputs are deliberately labelled as starting geometries requiring inspection and optimization. When adding a pathway, provide reviewed templates, binding-atom indices, a chemically meaningful order, and regression coverage for distance constraints and CIF reparsing.

### Bader charge analysis

```text
ACF.dat → parseACF() ┐
SCF input → parseQEInputAtoms() ┴→ core inputs → calculateBaderCharge()
                                      ├→ buildBaderWorkbook() → .xlsx
matching CIF → BaderChargeViewer ─────└→ glow/labels → DPI PNG
```

`ACF.dat` contains integrated basin electrons but no element identity. `parseQEInputAtoms()` reads the required matching SCF input, validates `nat`, and takes ordered element identities from `ATOMIC_POSITIONS`; users enter only the pseudopotential frozen-core counts. The signed convention is `Z − core − integrated electrons`: positive/red means electron loss, while negative/green means electron gain. A visualization CIF must match both the atom count and element sequence obtained from the SCF input.

The browser-native XLSX exporter uses JSZip to write Results and Metadata sheets. Results preserves the seven ACF columns and adds a formula-derived Bader Charge column; Metadata holds atomic numbers, editable core counts, the charge definition, and parsed ACF footer totals. `BaderChargeViewer` includes atom identity and signed value in Three.js sprites so labels are present in the DPI-controlled canvas export.

### QE output processing

`OutputProcessor.js` contains three UI panels:

1. **Output to CIF/positions:** `qeParser.parseQEOutput()` extracts initial, intermediate, and final structures. `generateCIF()` and `generateAtomicPositions()` serialize the result.
2. **CIF coordinate extraction:** `cifToQE()` produces `ATOMIC_POSITIONS {crystal}` or `{angstrom}` blocks.
3. **Input fixer:** `qeInputGenerator.parseQEOut()` extracts QE values; `patchInputFile()` updates an existing input, while `buildIN()` reconstructs an input from output alone.

The principal structure returned by `parseQEOutput()` is:

```js
{
  isVCRelax,
  isRelaxed,
  calcType,
  nSteps,
  initial,
  final
}
```

An individual structure contains cell vectors in angstrom, derived cell parameters, atoms, and a coordinate type. QE unit tags such as `alat`, `bohr`, `angstrom`, and `crystal` are normalized by the parser.

### DOS input workflow

Selecting the DOS protocol calls `qeGenerator.generateDOSWorkflow()` and opens four coordinated Input Editor tabs:

```text
ciffilename_scf.in      # pw.x, occupations='smearing'
ciffilename_nscf.in     # pw.x, occupations='tetrahedra', dense mesh, explicit nbnd
ciffilename_dos.in      # dos.x &DOS post-processing namelist
ciffilename_submit.sh   # sequential runner using tee and pipefail
```

All stages share the CIF basename as `prefix` and use the same `outdir`. The default NSCF mesh is three times the SCF mesh along each direction, and default `nbnd` is four times the atom count. These are starting values, not convergence guarantees. Editing structured DOS settings regenerates all four files together to preserve workflow consistency.

`InputEditor._renderSidebar()` is stage-aware for this workflow. It exposes SCF-only controls on the `dos-scf` tab, NSCF-only controls on `dos-nscf`, delegates the `dos-post` tab to the compact `&DOS` sidebar, and displays guidance rather than parameter controls for `dos-submit`. Keep this separation when adding fields: a control belongs on the tab whose generated file consumes it, while genuinely shared values may appear wherever they need to be editable.

### Single pw.x workflows

`qeGenerator.generatePWWorkflow()` wraps the SCF and Structural Relaxation protocols as two-artifact workflows. It returns the normal `_scf.in` or `_relax.in` file plus `_submit.sh`, which runs the input with `pw.x`, `tee`, and `pipefail`. Workflow IDs begin with `pw-`; Input Editor keeps the complete structured settings on the QE input tab and renders execution guidance only for `scf-submit` or `relax-submit`.

The editor/settings boundary uses `.editor-splitter` and `InputEditor._setupEditorSplitter()`. Its width is retained in the page instance across tab switches and workflow regeneration, clamped to a 320 px editor minimum and a 220 px sidebar minimum, and supports mouse dragging, arrow-key resizing, and double-click reset. Any Input Editor layout changes must preserve the splitter's accessible separator role and cleanup in `destroy()`.

### Bands input workflow

`qeGenerator.generateBandsWorkflow()` returns four coordinated files: `bands-scf` (`pw.x`, automatic mesh), `bands-nscf` (`pw.x`, `calculation='bands'`, `K_POINTS crystal_b`), `bands-post` (`bands.x`, `&BANDS`), and `bands-submit` (a sequential Bash runner using `tee` and `pipefail`). They share one parameter object so `prefix`, `outdir`, pseudopotentials, electronic settings, and the editable k path regenerate consistently across the tabs. The submit tab displays execution guidance instead of parameter controls.

The k path is stored as `params.kPath`, an ordered array of `{ label, x, y, z, points }`. `BAND_PATH_PRESETS` maps detected `ibrav` families to an initial suggested path and supplies alternative presets; `getSuggestedBandPath()` performs the selection. `BAND_K_POINT_OPTIONS` supplies dropdown coordinates. Input Editor changes a row's coordinates when its label changes, enforces at least two vertices, and treats `points` as the `crystal_b` interpolation count to the next vertex. Both the UI and generated NSCF input warn users to cross-verify the suggestion against literature or a trusted Brillouin-zone resource because labels and coordinates depend on the cell convention.

### Charge-density input workflow

`qeGenerator.generateChargeWorkflow()` returns `charge-scf` (`pw.x`), `charge-post` (`pp.x` with `&INPUTPP` and `&PLOT`), and `charge-submit` (sequential Bash runner) files. All share a mutable parameter object and identical `prefix`/`outdir`. The default post-processing selection is total electron density (`plot_num=0`) written as a 3D Gaussian cube (`iflag=3`, `output_format=6`). Input Editor renders full SCF controls only for `charge-scf`, compact post-processing controls only for `charge-post`, and execution guidance only for `charge-submit`.

### Bader charge input workflow

`qeGenerator.generateBaderWorkflow()` returns four coordinated artifacts: `bader-scf` (`pw.x`), `bader-all` (`pp.x`, fixed `plot_num=21`), `bader-valence` (`pp.x`, fixed `plot_num=0`), and `bader-submit`. Generated filenames deliberately expand uploaded-example abbreviations: `_all.in` becomes `_allelectron.in` and `_val.in` becomes `_valenceelectron.in`. The post-processing tabs expose their own `filplot`/`fileout` controls plus shared cube-format settings; the submit tab contains guidance only. The runner creates both cube densities but leaves execution of the external Bader program to the user.

### Vibrational-energy input workflow

`qeGenerator.generateVibrationalWorkflow()` returns `phonon-scf`, `phonon-hess`, `phonon-ph`, `phonon-dyn`, and `phonon-submit`. The DFT-D3 branch links `filhess` in the `d3hess.x` input to `dftd3_hess` in the `ph.x` input and includes the Hessian command between `pw.x` and `ph.x`. For non-D3 settings, the Hessian artifact becomes an explanatory placeholder, `dftd3_hess` is omitted, and the runner skips `d3hess.x`. Changing `vdw_corr` regenerates all five tabs, so this conditional behavior must remain centralized in the workflow generator.

### Free Energy Plotter

```text
CSV/text
  → freeEnergyParser.parseCSV()
  → rows [{ branch, subBranch, energy }]
  → PlotEngine canvas rendering
  ↔ InteractionLayer hit-testing/editing
  → freeEnergyExport PNG/ZIP output
```

`FreeEnergyPlotter.js` owns UI state, plot tabs, configuration controls, annotations, connection editing, and export actions. `freeEnergyPlot.js` should contain drawing/math behavior; `freeEnergyInteraction.js` should contain pointer/keyboard behavior.

The plotter is the largest and most tightly coupled subsystem. Make small, tested changes and avoid adding more unrelated responsibilities to the page class.

## 6. Scientific conventions

- CIF cell lengths and Cartesian positions are represented in **angstrom**.
- The main CIF Editor stores cell angles in **radians** after parsing.
- QE `celldm(1)` is expressed in **bohr**; conversion lives in `cifSymmetry.js`.
- Fractional coordinates should normally be wrapped into `[0, 1)` when generating canonical structures.
- Floating-point comparisons must use explicit tolerances, never strict equality.
- Preserve coordinate tags (`crystal`, `angstrom`, `bohr`, `alat`) until the relevant conversion has been applied.
- Pseudopotential selectors and generated inputs must use filenames from `src/data/pseudos.js`; arbitrary manual filenames are intentionally unsupported.
- DOS SCF/NSCF/dos.x files must retain the same `prefix` and `outdir`; changing one independently breaks restart-data discovery.
- The default dispersion correction is DFT-D3. `xdm_a1` and `xdm_a2` are emitted only as explicit advanced overrides when `vdw_corr='xdm'`; QE supplies them automatically for PBE, B86bPBE, PW86PBE, and BLYP.
- Smearing choices are centralized in `SMEARING_OPTIONS` and use QE's canonical names: Gaussian, Methfessel–Paxton, Marzari–Vanderbilt cold smearing, and Fermi–Dirac. Smearing/degauss apply only when `occupations='smearing'`.
- The occupation selector intentionally exposes `smearing`, `fixed`, and `tetrahedra`. DOS defaults are SCF=`smearing` and NSCF=`tetrahedra`; tetrahedra requires a uniform automatic k-point grid.
- Symmetry expansion deduplicates atoms using defined fractional/Cartesian tolerances in `cifParser.js`.

## 7. CIF parser responsibilities

The project currently has three CIF parsing paths with different output purposes:

| Module | Used by | Primary purpose |
| --- | --- | --- |
| `cifParser.js` | CIF Editor | Editable canonical structure, symmetry expansion, export |
| `cifGenerator.js` | Visual CIF Generator | Preserve source lines and token positions for substitutions |
| `cifToQE.js` | Output Processor coordinate extractor | General tokenization and QE position-block conversion |

When fixing a CIF compatibility issue, determine which workflows are affected and add cross-workflow tests where appropriate. Long term, these parsers should share tokenization and normalized cell/atom primitives while retaining workflow-specific output adapters.

### Shared bond rendering

`setupBonding()` attaches the same collapsed control overlay to `ThreeViewer` and `VisSelectViewer`; subclasses inherit it automatically. `findBonds()` uses minimum-image fractional displacement when lattice and fractional coordinates are available. Its automatic maximum is a user multiplier times the sum of covalent radii from `elements.js`; pair-specific minimum/maximum rules override it. `renderBonds()` packs all accepted segments into one monochrome `THREE.LineSegments`, avoiding cylinder meshes and per-bond scene objects.

## 8. Security and DOM rules

CIF, QE, CSV, filenames, labels, and symmetry names are untrusted input.

- Prefer `textContent` when inserting plain text.
- When an HTML template is necessary, pass untrusted values through `escapeHTML()` from `src/lib/html.js`.
- Do not interpolate file content directly into `innerHTML`, attributes, CSS, or selectors.
- Do not introduce `eval`, `new Function`, or remote code loading.
- Continue processing files locally unless the product requirements explicitly change.

Any new file-derived HTML path should have a regression test where practical.

## 9. Page and component lifecycle

Every page class should follow this shape:

```js
export class ExamplePage {
  constructor(container, appState, onNavigate) { /* store dependencies */ }
  render() { /* create DOM and bind local events */ }
  destroy() { /* remove global listeners and dispose resources */ }
}
```

DOM listeners attached to elements inside the page container disappear when navigation clears the container. Listeners attached to `window`, `document`, shared modals, or other persistent nodes must be removed explicitly in `destroy()`.

Three.js components should dispose renderers, geometries, materials, animation frames, and global listeners when removed. Theme-aware pages listen for the global `theme-changed` event dispatched by `main.js`.

## 10. Styling conventions

`src/styles/main.css` defines the application shell, theme variables, common controls, and several page-specific sections. Additional CSS files isolate the largest specialized modules.

- Use existing CSS custom properties such as `--bg`, `--text`, `--accent`, and `--border`.
- Verify both dark and light themes.
- Keep class prefixes aligned with the owning module (`fep-`, `mg-`, `vg-`, etc.).
- Avoid adding large inline-style blocks when a reusable class is appropriate, although legacy inline styles remain in `index.html` and some templates.

## 11. Commands and quality gate

```bash
npm ci            # reproducible dependency installation
npm run dev       # Vite development server
npm run lint      # ESLint
npm test          # Node scientific regression tests
npm run build     # production build into dist/
npm run preview   # serve the production build locally
npm run check     # lint + tests + production build
```

Run `npm run check` after code changes. GitHub Actions runs the same command for pushes and pull requests.

The production build currently reports a large-chunk warning because all pages and Three.js are loaded eagerly. It is a performance warning, not a build failure.

## 12. Test strategy

`test/core.test.js` is the current confidence baseline. Checked-in fixtures cover:

- cubic, triclinic, and non-orthogonal cells;
- lattice classification and QE `ibrav` mapping;
- cell vectors, `celldm`, and k-point meshes;
- symmetry expansion and special-position deduplication;
- CIF export/reparse round trips with numerical tolerances;
- fractional and Cartesian CIF-to-QE conversion;
- QE `vc-relax` final-coordinate extraction;
- coordinated DOS SCF/NSCF/dos.x/submit-script generation;
- QE-output-to-CIF generation and reparsing;
- reaction-intermediate placement radius, collision detection, and CIF reparsing;
- free-energy parsing, grouping, and ranges;
- HTML escaping of file-derived values.

For parser changes, add a minimal real-world fixture that reproduces the case and assert scientific invariants rather than only matching a large text snapshot. Useful invariants include atom count, species, cell lengths/angles, volume, coordinate equivalence, units, symmetry multiplicity, and round-trip tolerance.

The repository now includes a separate 11-suite publication benchmark with real QE/VASP fixtures, independent numerical references, SHA-256 provenance, controlled failure cases, and machine-readable reports. The ordinary unit-test fixtures remain the fast regression baseline. Future work should add independent clean-machine reproduction and broader cross-tool comparisons with packages such as ASE, spglib, or pymatgen.

## 13. Known architectural risks

1. **Multiple CIF conversion paths:** schemas and supported syntax may diverge.
2. **Multiple QE output parsers:** `qeParser.js` and `qeInputGenerator.js` serve different workflows and can interpret edge cases differently.
3. **Large page classes:** especially `FreeEnergyPlotter.js` and `OutputProcessor.js`.
4. **In-memory navigation:** page state may be lost on navigation unless stored in `appState` or within a retained model.
5. **No persistence for scientific work:** only the theme preference is stored in `localStorage`.
6. **Initial bundle size:** all modules are eager-loaded; the JavaScript bundle is roughly 800 kB minified.
7. **External-validation scope:** deterministic benchmarks now include real QE/VASP datasets, but they are not a blinded inter-laboratory study or a large independently curated corpus.

## 14. Where to make common changes

| Change | Primary files |
| --- | --- |
| Add/remove a sidebar module | `index.html`, `src/main.js`, new page, relevant CSS |
| Change shared navigation state | `src/main.js` and every `appState` consumer |
| Support a new CIF syntax variant | relevant CIF parser(s), fixture, `test/core.test.js` |
| Change symmetry or `ibrav` behavior | `src/lib/cifSymmetry.js`, tests |
| Add a QE calculation protocol | `src/lib/qeGenerator.js`, `ProtocolSelector.js`, `InputEditor.js` |
| Change QE output extraction | `qeParser.js` and/or `qeInputGenerator.js`, QE fixture, tests |
| Change atom rendering/picking | `ThreeViewer.js` |
| Change shared CIF bond inference or controls | `bonding.js`, `bondControls.css`, both base viewers, tests |
| Change visual substitutions | `VisMultiCifGenerator.js`, `VisSelectViewer.js`, `cifGenerator.js`, tests |
| Change reaction intermediates or placement | `IntermediateMaker.js`, `IntermediatePlacementViewer.js`, `intermediateMaker.js`, `nrrIntermediates.js`, tests |
| Change Bader parsing, charge convention, Excel, or visualization | `BaderChargeAnalysis.js`, `BaderChargeViewer.js`, `baderAnalysis.js`, tests |
| Change free-energy parsing | `freeEnergyParser.js`, tests |
| Change PDOS filename/data parsing or summation | `pdosAnalysis.js`, `PdosAnalysis.js`, PDOS tests |
| Change standardized CSV parsing or DOS template schema | `scientificDosPlot.js`, tests |
| Change publication DOS figure UI/rendering/export | `ScientificDosPlotter.js`, `scientificDosPlotter.css` |
| Change the downloadable Python CLI | `tools/pkdos-cli/`, then rebuild `public/downloads/pkdos-cli.zip` |
| Change plot appearance/math | `freeEnergyPlot.js`, `freeEnergyPlotter.css` |
| Change plot gestures | `freeEnergyInteraction.js`, `FreeEnergyPlotter.js` |
| Change image/ZIP export | `freeEnergyExport.js` or `cifGenerator.js` |
| Add file-derived UI text | use `html.js` or `textContent`; add a security test |
| Change global theme or shell | `index.html`, `src/main.js`, `src/styles/main.css` |

## 15. Safe modification checklist

Before editing:

1. Identify the producing parser and exact data schema.
2. Check whether another workflow implements similar logic independently.
3. Confirm units for lengths, angles, and atomic coordinates.
4. Locate lifecycle cleanup if adding a global listener or Three.js resource.
5. Treat all uploaded-file data as untrusted.

Before finishing:

1. Add or update a focused fixture/test for scientific behavior.
2. Test numerical results with explicit tolerances.
3. Verify both source and generated/round-trip structures when relevant.
4. Run `npm run check`.
5. Update this file if architecture, schemas, commands, or module responsibilities changed.

## 16. Documentation hierarchy

- Read **this file** for architecture and contributor/agent context.
- Read `README.md` for quick installation and verification.
- Read `MANUAL.md` for end-user workflows and troubleshooting.
- Read source files only for the subsystem being changed.

## 17. PDOS Analysis and downloadable CLI

The browser implementation is deliberately independent of Python because the deployed application is static. `src/lib/pdosAnalysis.js` is the scientific core: it parses QE `projwfc.x` files and projected VASP DOSCAR ion blocks, recognizes supported collinear spin and non-spin column counts for `s`, `p`, `d`, and `f`, validates common energy grids, shifts the energy reference, sums selected records, and serializes CSV. `src/pages/PdosAnalysis.js` owns file upload, atom/orbital selection, plotting, preview, and downloads. `src/styles/pdosAnalysis.css` owns its responsive split layout.

Unsupported or ambiguous column layouts are rejected rather than guessed. Spin-polarized and non-spin-polarized files cannot be combined in one result. The seven `f` projections use neutral `f1`–`f7` labels because real-harmonic naming conventions must not be inferred without stronger QE-version metadata.

For VASP, the DOSCAR parser skips the total-DOS block and supports projected `l`-resolved and `lm`-resolved collinear layouts inferred from the documented column counts. It imports `NEDOS`, ion count, energy grid and Fermi energy. Noncollinear/SOC or unknown layouts are rejected. DOSCAR alone does not reliably map ion numbers to chemical elements; the UI therefore directs DOSCAR-only users to atom-number selection. When a matching VASP 5-style `POSCAR` or `CONTCAR` is also uploaded, `parseVaspPoscarSpecies` expands its ordered species/count declarations into an ion-to-element map. The UI applies that map only when the POSCAR atom count exactly matches the DOSCAR ion count, after which species selection is enabled. Legacy VASP 4 POSCAR files without explicit species names are rejected for mapping.

The original Python package is maintained as a self-contained subproject in `tools/pkdos-cli`. Its downloadable archive is a generated static artifact in `public/downloads/pkdos-cli.zip`. Do not place virtual environments, caches, nested Git metadata, or generated CSV results in either location.

## 18. Scientific DOS Plotter

The Scientific DOS Plotter is intentionally downstream of PDOS Analysis. It does not parse QE or VASP outputs; it reads standardized CSV tables with a recognized energy column and one or more numerical DOS channels. `src/lib/scientificDosPlot.js` validates column counts, duplicate headers, numerical values, and strictly increasing energies; detects `_up`/`_down` spin pairs; creates default channel styles; and owns the versioned `padarthkhoj-dos-template` JSON contract.

`src/pages/ScientificDosPlotter.js` owns multiple datasets, channel controls, individual/overlay/multipanel rendering, spin mirroring, per-dataset styles, localStorage templates, apply-current/apply-all behavior, PNG rendering, true vector SVG generation, and batch ZIP export. Templates contain presentation state but never uploaded scientific arrays. `src/styles/scientificDosPlotter.css` owns the draggable split workspace and responsive controls.
