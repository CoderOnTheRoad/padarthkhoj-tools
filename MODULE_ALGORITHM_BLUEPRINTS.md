# QE Studio Module Algorithm Blueprint Figures

These are rough text-based figure drafts for scientific papers. Each diagram represents algorithmic flow rather than a normal software architecture chart. The final paper figures can be redrawn using vector graphics while preserving the same steps, inputs, transformations, decisions, and outputs.

## Figure 1. Overall Application Pipeline

~~~text
+------------------+
| Scientific files |
| CIF, QE, PDOS,   |
| DOSCAR, ACF.dat |
+--------+---------+
         |
         v
+----------------------+
| Browser FileReader   |
| raw text acquisition |
+----------+-----------+
           |
           v
+----------------------+
| Format-specific      |
| parser               |
| text -> data model   |
+----------+-----------+
           |
           v
+----------------------+
| Normalized internal  |
| representation       |
| atoms, cell, energy, |
| channels, metadata   |
+----------+-----------+
           |
           v
+----------------------+
| Scientific algorithm |
| conversion, analysis,|
| generation, fitting, |
| integration          |
+----------+-----------+
           |
           v
+----------------------+
| Visual inspection    |
| Three.js / Canvas /  |
| HTML tables          |
+----------+-----------+
           |
           v
+----------------------+
| Export               |
| CIF, QE, CSV, XLSX,  |
| PNG, ZIP, JSON       |
+----------------------+
~~~

## Figure 2. Application Navigation and State

~~~text
+-----------------------+
| User selects workflow |
+-----------+-----------+
            |
            v
+-----------------------+
| navigate(pageId)      |
+-----------+-----------+
            |
            v
+-----------------------+
| Destroy active page  |
| remove listeners      |
| dispose viewer        |
+-----------+-----------+
            |
            v
+-----------------------+
| Clear page-content    |
+-----------+-----------+
            |
            v
+-----------------------+
| Instantiate page class|
+-----------+-----------+
            |
            v
+-----------------------+
| page.render()         |
| create UI + listeners |
+-----------+-----------+
            |
            v
+-----------------------+
| Update appState when  |
| data must cross pages |
+-----------------------+

appState:
+------------------------------------------------------+
| cifData | selectedAtom | pendingProtocol             |
| generatedInput | generatedInputs | cifFilename       |
+------------------------------------------------------+
~~~

## Figure 3. CIF Parser and Symmetry Expansion

~~~text
+----------------+
| CIF text       |
+-------+--------+
        |
        v
+------------------------+
| Split into lines       |
+-----------+------------+
            |
            v
+------------------------+
| Extract cell parameters|
| a, b, c, alpha, beta,  |
| gamma                  |
+-----------+------------+
            |
            v
+------------------------+
| Detect loop_ blocks   |
+------+-----------------+
       |
       +--------------------------+
       |                          |
       v                          v
+--------------+        +----------------------+
| Atom-site    |        | Symmetry-operation   |
| loop         |        | loop                 |
+------+-------+        +----------+-----------+
       |                           |
       v                           v
+--------------+        +----------------------+
| Read element |        | Parse expressions    |
| coordinates  |        | -x+1/2,y,z          |
| occupancy    |        | into affine terms   |
+------+-------+        +----------+-----------+
       |                           |
       +-------------+-------------+
                     |
                     v
          +----------------------+
          | Primitive atoms      |
          +----------+-----------+
                     |
                     v
          +----------------------+
          | Apply every symmetry |
          | operation            |
          +----------+-----------+
                     |
                     v
          +----------------------+
          | Wrap fractional      |
          | coordinates to [0,1) |
          +----------+-----------+
                     |
                     v
          +----------------------+
          | Fractional ->        |
          | Cartesian transform  |
          +----------+-----------+
                     |
                     v
          +----------------------+
          | Deduplicate atoms    |
          | fractional then       |
          | Cartesian space       |
          +----------+-----------+
                     |
                     v
          +----------------------+
          | Expanded structure   |
          | + cell + symmetry    |
          +----------------------+
~~~

## Figure 4. Fractional-to-Cartesian Coordinate Transformation

~~~text
Input:
+-----------------------------+
| fx, fy, fz                  |
| a, b, c                     |
| alpha, beta, gamma          |
+--------------+--------------+
               |
               v
+-----------------------------+
| Convert angles to radians   |
+--------------+--------------+
               |
               v
+-----------------------------+
| Build lattice matrix M      |
| using cell lengths/angles   |
+--------------+--------------+
               |
               v
+-----------------------------+
| r_cart = M * r_fractional  |
+--------------+--------------+
               |
               v
+-----------------------------+
| x_cart, y_cart, z_cart      |
| in Angstrom                 |
+-----------------------------+
~~~

For a non-orthogonal cell:

~~~text
M =
[ a   b cos(gamma)   c cos(beta) ]
[ 0   b sin(gamma)   c * term     ]
[ 0   0              c * term     ]

[x]   [fx]
[y] = M [fy]
[z]   [fz]
~~~

## Figure 5. CIF Symmetry-to-QE Conversion

~~~text
+----------------------+
| CIF cell + space     |
| group metadata       |
+----------+-----------+
           |
           v
+----------------------+
| Compare cell lengths |
| and angles           |
+----------+-----------+
           |
           v
+----------------------+
| Determine crystal    |
| lattice system       |
+----------+-----------+
           |
           v
+----------------------+
| Map space group and  |
| lattice to ibrav     |
+----------+-----------+
           |
           v
+----------------------+
| Calculate celldm(1-6) |
| or explicit vectors   |
+----------+-----------+
           |
           v
+----------------------+
| Estimate k-point     |
| sampling mesh        |
+----------+-----------+
           |
           v
+----------------------+
| QE cell representation|
+----------------------+
~~~

## Figure 6. Multiple CIF Substitution Generator

~~~text
+----------------------+
| Source CIF           |
+----------+-----------+
           |
           v
+----------------------+
| Parse atoms and      |
| preserve raw lines   |
+----------+-----------+
           |
           v
+----------------------+
| User defines active  |
| atoms and substitutions|
+----------+-----------+
           |
           v
+----------------------+
| Build substitution   |
| sets                 |
+----------+-----------+
           |
           v
+----------------------+
| Cartesian product    |
| of all active sets   |
+----------+-----------+
           |
           v
+----------------------+
| For each combination |
+----------+-----------+
           |
           v
+----------------------+
| Replace type symbol  |
| and label prefix     |
+----------+-----------+
           |
           v
+----------------------+
| Add provenance header |
+----------+-----------+
           |
           v
+----------------------+
| CIF_1, CIF_2, ...    |
+----------+-----------+
           |
           v
+----------------------+
| ZIP archive          |
+----------------------+
~~~

## Figure 7. Full CIF-to-QE Atomic Position Conversion

~~~text
+-------------+
| CIF text    |
+------+------+ 
       |
       v
+------------------------+
| Tokenize comments,     |
| quotes, loops, values  |
+-----------+------------+
            |
            v
+------------------------+
| Locate _atom_site loop |
+-----------+------------+
            |
            v
+------------------------+
| Identify coordinate    |
| columns               |
+-----------+------------+
            |
            v
       +----+----+
       |         |
       v         v
+------------+ +-------------+
| Fractional | | Cartesian   |
| coordinates| | coordinates |
+------+-----+ +------+------+
       |              |
       |              v
       |       +-------------+
       |       | Use directly|
       |       +------+------+
       |              |
       +------+-------+
              |
              v
+------------------------+
| Optional fractional -> |
| Cartesian conversion   |
+-----------+------------+
            |
            v
+------------------------+
| Format ATOMIC_POSITIONS|
| {crystal} or {angstrom}|
+-----------+------------+
            |
            v
+------------------------+
| QE atomic-position card|
+------------------------+
~~~

## Figure 8. QE Input Generation

~~~text
+-------------------------+
| Parsed structure        |
| cell, atoms, species    |
+------------+------------+
             |
             v
+-------------------------+
| User protocol           |
| SCF / relax / DOS /     |
| bands / charge / Bader  |
+------------+------------+
             |
             v
+-------------------------+
| Resolve metadata        |
| masses + pseudopotentials|
+------------+------------+
             |
             v
+-------------------------+
| Generate &CONTROL       |
+------------+------------+
             |
             v
+-------------------------+
| Generate &SYSTEM        |
+------------+------------+
             |
             v
+-------------------------+
| Generate &ELECTRONS     |
+------------+------------+
             |
             v
+-------------------------+
| Add &IONS if relaxation |
+------------+------------+
             |
             v
+-------------------------+
| Add &CELL if vc-relax  |
+------------+------------+
             |
             v
+-------------------------+
| ATOMIC_SPECIES          |
+------------+------------+
             |
             v
+-------------------------+
| CELL_PARAMETERS         |
| when explicit cell used |
+------------+------------+
             |
             v
+-------------------------+
| K_POINTS                |
+------------+------------+
             |
             v
+-------------------------+
| ATOMIC_POSITIONS        |
+------------+------------+
             |
             v
+-------------------------+
| QE input text           |
+-------------------------+
~~~

## Figure 9. Multi-Stage QE Workflow Generation

~~~text
+---------------------+
| Structure + protocol|
+----------+----------+
           |
           v
+---------------------+
| Determine workflow  |
| dependency graph    |
+----------+----------+
           |
           v
      +----+-----+
      |          |
      v          v
+----------+ +----------+
| SCF file | | NSCF file|
+----+-----+ +----+-----+
      |           |
      +-----+-----+
            |
            v
      +----------+
      | DOS file |
      +----+-----+
           |
           v
      +----------+
      | PDOS file|
      +----------+
~~~

The output is stored as multiple named files so that each computational stage can be edited and downloaded independently.

## Figure 10. QE Output Parser

~~~text
+-------------------+
| QE output text    |
+---------+---------+
          |
          v
+-------------------+
| Scan line by line |
+---------+---------+
          |
          +----------------------+
          |                      |
          v                      v
+----------------+      +----------------+
| Numerical lines|      | Status lines   |
| energy, force, |      | convergence,   |
| pressure, SCF  |      | JOB DONE, errors|
+--------+-------+      +--------+-------+
         |                       |
         +-----------+-----------+
                     |
                     v
+---------------------------+
| Detect calculation type  |
| scf / relax / vc-relax   |
+-------------+-------------+
              |
              v
+---------------------------+
| Parse initial structure   |
| lattice + atomic positions|
+-------------+-------------+
              |
              v
+---------------------------+
| Find repeated geometry    |
| snapshots during relax    |
+-------------+-------------+
              |
              v
+---------------------------+
| Detect final-coordinate   |
| block and final geometry  |
+-------------+-------------+
              |
              v
+---------------------------+
| Normalize units           |
| Bohr / alat / crystal /   |
| Angstrom                  |
+-------------+-------------+
              |
              v
+---------------------------+
| QE result object          |
| histories + structures +  |
| status + errors           |
+---------------------------+
~~~

## Figure 11. QE Output to Updated Input

~~~text
+--------------------+
| Original QE input  |
+---------+----------+
          |
          v
+--------------------+
| Parsed QE output   |
| final cell + atoms |
+---------+----------+
          |
          v
      +---+---+
      |       |
      v       v
+-----------+ +-------------+
| Patch     | | Reconstruct |
| original  | | new input   |
+-----+-----+ +------+------+ 
      |              |
      v              v
+-----------+ +-------------+
| Preserve  | | Generate    |
| original  | | all QE cards|
| settings  | | from model  |
+-----+-----+ +------+------+ 
      |              |
      +------+-------+
             |
             v
+--------------------+
| Updated QE input   |
| initial or final   |
| geometry           |
+--------------------+
~~~

## Figure 12. QE Input Patching Logic

~~~text
+-----------------------+
| Read original input  |
+-----------+-----------+
            |
            v
+-----------------------+
| Detect ibrav and cell|
| representation       |
+-----------+-----------+
            |
            v
       +----+----+
       |         |
       v         v
+-----------+ +-----------+
| ibrav != 0| | ibrav = 0|
+-----+-----+ +-----+-----+
      |             |
      v             v
+-----------+ +----------------+
| Update     | | Replace        |
| celldm/A/B/C| | CELL_PARAMETERS|
+-----+-----+ +-------+--------+
      |               |
      +-------+-------+
              |
              v
+-----------------------+
| Replace ATOMIC_POSITIONS|
+-----------+-----------+
            |
            v
+-----------------------+
| Patched input + change|
| metadata               |
+-----------------------+
~~~

## Figure 13. Bader Charge Analysis

~~~text
+------------------+       +----------------------+
| Bader ACF.dat    |       | QE input or POSCAR   |
+--------+---------+       +----------+-----------+
         |                            |
         v                            v
+------------------+       +----------------------+
| Parse Bader      |       | Parse structure      |
| charge, volume,  |       | elements and atom   |
| coordinates      |       | positions            |
+--------+---------+       +----------+-----------+
         |                            |
         +-------------+--------------+
                       |
                       v
+----------------------+
| Match atom records  |
| by structure order  |
+----------+-----------+
           |
           v
+----------------------+
| Determine reference |
| valence electrons   |
+----------+-----------+
           |
           v
+----------------------+
| q = valence -       |
| Bader population    |
+----------+-----------+
           |
           v
+----------------------+
| Charge-enriched atom |
| records             |
+----------+-----------+
           |
           +----------------------+
           |                      |
           v                      v
+------------------+     +------------------+
| Charge-coloured  |     | CSV/XLSX export  |
| 3D structure     |     | summary table    |
+------------------+     +------------------+
~~~

## Figure 14. Geometric Bond Detection

~~~text
+-------------------+
| Atom list + cell  |
+---------+---------+
          |
          v
+-------------------+
| Select atom pair  |
+---------+---------+
          |
          v
+-------------------+
| Generate periodic |
| image candidates  |
+---------+---------+
          |
          v
+-------------------+
| Calculate delta   |
| vector and norm   |
+---------+---------+
          |
          v
+-------------------+
| Compare distance  |
| with bond cutoff  |
+---------+---------+
          |
      +---+---+
      |       |
      v       v
+-----------+ +-----------+
| distance  | | distance  |
| accepted  | | rejected  |
+-----+-----+ +-----------+
      |
      v
+-------------------+
| Store bond        |
| atom indices +    |
| periodic delta    |
+---------+---------+
          |
          v
+-------------------+
| Render as Three.js|
| line segment      |
+-------------------+
~~~

## Figure 15. General Three.js Structure Viewer

~~~text
+-------------------+
| Normalized atoms  |
| and cell vectors  |
+---------+---------+
          |
          v
+-------------------+
| Create scene,     |
| camera, renderer  |
+---------+---------+
          |
          v
+-------------------+
| Map each atom to  |
| element metadata  |
+---------+---------+
          |
          v
+-------------------+
| Create sphere mesh|
| colour + radius   |
+---------+---------+
          |
          v
+-------------------+
| Draw unit cell    |
| and optional bonds|
+---------+---------+
          |
          v
+-------------------+
| Add orbit controls|
| and raycaster     |
+---------+---------+
          |
          v
+-------------------+
| Animation loop    |
| render scene      |
+---------+---------+
          |
          v
+-------------------+
| User rotates,     |
| zooms, selects    |
+-------------------+
~~~

## Figure 16. Atom Selection by Raycasting

~~~text
+-------------------+
| Mouse click       |
+---------+---------+
          |
          v
+-------------------+
| Convert screen     |
| position to NDC   |
+---------+---------+
          |
          v
+-------------------+
| Three.js raycaster|
| intersects meshes |
+---------+---------+
          |
          v
+-------------------+
| Identify atom mesh|
+---------+---------+
          |
          v
+-------------------+
| Update selected   |
| atom index        |
+---------+---------+
          |
          v
+-------------------+
| Highlight mesh and|
| notify page       |
+-------------------+
~~~

## Figure 17. Intermediate Placement

~~~text
+------------------------+
| Catalyst structure     |
+------------+-----------+
             |
             v
+------------------------+
| Select active catalyst |
| atom                   |
+------------+-----------+
             |
             v
+------------------------+
| Select intermediate    |
| template and anchor   |
+------------+-----------+
             |
             v
+------------------------+
| Read azimuth/elevation |
+------------+-----------+
             |
             v
+------------------------+
| Convert angles to      |
| direction vector       |
+------------+-----------+
             |
             v
+------------------------+
| Rotate intermediate    |
| around anchor          |
+------------+-----------+
             |
             v
+------------------------+
| Translate anchor near  |
| active catalyst atom   |
+------------+-----------+
             |
             v
+------------------------+
| Evaluate atom-atom     |
| distances              |
+------------+-----------+
             |
        +----+----+
        |         |
        v         v
+-------------+ +-------------+
| Collision   | | Valid       |
| detected    | | placement   |
+------+------+ +------+------+
       |               |
       v               v
+-------------+ +-------------+
| Show warning| | Export or   |
| and adjust  | | continue    |
+-------------+ +-------------+
~~~

## Figure 18. Placement-Sphere Suggestions

~~~text
+----------------------+
| Active catalyst atom |
+----------+-----------+
           |
           v
+----------------------+
| Generate candidate   |
| directions on sphere |
+----------+-----------+
           |
           v
+----------------------+
| Translate candidate  |
| by centre distance   |
+----------+-----------+
           |
           v
+----------------------+
| Place intermediate   |
| at candidate         |
+----------+-----------+
           |
           v
+----------------------+
| Check minimum        |
| catalyst-intermediate|
| distances            |
+----------+-----------+
           |
           v
+----------------------+
| Reject collisions    |
+----------+-----------+
           |
           v
+----------------------+
| Return first N valid |
| candidate placements |
+----------------------+
~~~

## Figure 19. Custom Reaction Pathway

~~~text
+-------------------+
| Catalyst CIF      |
+---------+---------+
          |
          v
+-------------------+
| Create pathway    |
| template          |
+---------+---------+
          |
          v
+-------------------+
| Select binding    |
| atom              |
+---------+---------+
          |
          v
+-------------------+
| Add intermediates |
| and reaction steps|
+---------+---------+
          |
          v
+-------------------+
| Add energies and  |
| metadata          |
+---------+---------+
          |
          v
+-------------------+
| Validate schema   |
| and required data |
+---------+---------+
          |
          +----------------+
          |                |
          v                v
+----------------+ +----------------+
| Serialize JSON | | Reject with    |
| versioned file | | validation error|
+----------------+ +----------------+
~~~

## Figure 20. Free-Energy Data Preparation

~~~text
+-------------------+
| Free-energy CSV   |
+---------+---------+
          |
          v
+-------------------+
| Parse CSV rows    |
+---------+---------+
          |
          v
+-------------------+
| Extract step,    |
| energy, branch,  |
| state metadata   |
+---------+---------+
          |
          v
+-------------------+
| Group rows by    |
| reaction branch  |
+---------+---------+
          |
          v
+-------------------+
| Find unique and  |
| sub-branches     |
+---------+---------+
          |
          v
+-------------------+
| Calculate min/max |
| energy + padding  |
+---------+---------+
          |
          v
+-------------------+
| Select readable   |
| tick interval     |
+---------+---------+
          |
          v
+-------------------+
| Plot-ready model  |
+-------------------+
~~~

## Figure 21. Free-Energy Plot Rendering

~~~text
+----------------------+
| Grouped energy rows  |
+----------+-----------+
           |
           v
+----------------------+
| Compute plot bounds  |
| and margins          |
+----------+-----------+
           |
           v
+----------------------+
| Map step index to x  |
+----------+-----------+
           |
           v
+----------------------+
| Map energy to y      |
+----------+-----------+
           |
           v
+----------------------+
| Draw axes and ticks  |
+----------+-----------+
           |
           v
+----------------------+
| Draw energy levels   |
+----------+-----------+
           |
           v
+----------------------+
| Draw reaction links  |
+----------+-----------+
           |
           v
+----------------------+
| Draw labels/branches |
+----------+-----------+
           |
           v
+----------------------+
| Add selected and     |
| ghost branches       |
+----------+-----------+
           |
           v
+----------------------+
| Canvas free-energy   |
| diagram              |
+----------------------+
~~~

## Figure 22. Free-Energy Interaction

~~~text
+-------------------+
| Mouse event       |
+---------+---------+
          |
          v
+-------------------+
| Canvas coordinates |
+---------+---------+
          |
          v
+-------------------+
| Convert pixel      |
| coordinates to    |
| plot coordinates   |
+---------+---------+
          |
          v
+-------------------+
| Test distance to   |
| levels/segments    |
+---------+---------+
          |
      +---+---+
      |       |
      v       v
+-----------+ +-----------+
| Hit       | | No hit    |
+-----+-----+ +-----------+
      |
      v
+-------------------+
| Show tooltip or   |
| update selection  |
+-------------------+
~~~

## Figure 23. PDOS Parsing and Normalisation

~~~text
+-------------------+
| PDOS file         |
| filename + text   |
+---------+---------+
          |
          v
+-------------------+
| Parse filename    |
| atom/element/orbital|
| spin metadata     |
+---------+---------+
          |
          v
+-------------------+
| Parse header      |
| identify columns  |
+---------+---------+
          |
          v
+-------------------+
| Parse energy and  |
| DOS values        |
+---------+---------+
          |
          v
+-------------------+
| Detect spin and   |
| orbital channels  |
+---------+---------+
          |
          v
+-------------------+
| Normalized PDOS   |
| record            |
+---------+---------+
          |
          v
+-------------------+
| Collection of     |
| compatible records|
+-------------------+
~~~

## Figure 24. VASP DOSCAR Processing

~~~text
+-------------------+
| DOSCAR text       |
+---------+---------+
          |
          v
+-------------------+
| Parse header      |
| Fermi energy      |
| grid count        |
+---------+---------+
          |
          v
+-------------------+
| Read total DOS    |
+---------+---------+
          |
          v
+-------------------+
| Read partial DOS  |
| when available    |
+---------+---------+
          |
          v
+-------------------+
| Map columns to    |
| orbitals/spin     |
+---------+---------+
          |
          v
+-------------------+
| Associate atoms   |
| using POSCAR data |
+---------+---------+
          |
          v
+-------------------+
| Normalized DOS/PDOS|
| records           |
+-------------------+
~~~

## Figure 25. PDOS Selection and Summation

~~~text
+-----------------------+
| PDOS record collection|
+-----------+-----------+
            |
            v
+-----------------------+
| Parse user selection  |
| atoms: 1,3,5-8       |
+-----------+-----------+
            |
            v
+-----------------------+
| Filter by atom,      |
| species, orbital,    |
| and spin             |
+-----------+-----------+
            |
            v
+-----------------------+
| Validate energy grids |
+-----------+-----------+
            |
        +---+---+
        |       |
        v       v
+-----------+ +-----------+
| Compatible| | Mismatch  |
+-----+-----+ +-----------+
      |             |
      v             v
+-----------+ +----------------+
| Apply Fermi| | Return error  |
| shift      | | or warning    |
+-----+-----+ +----------------+
      |
      v
+-----------------------+
| Sum DOS values at    |
| each common E_i      |
+-----------+-----------+
            |
            v
+-----------------------+
| Combined PDOS result |
+-----------------------+
~~~

## Figure 26. Scientific DOS Plotter

~~~text
+-------------------+
| DOS CSV           |
+---------+---------+
          |
          v
+-------------------+
| Parse energy and  |
| channel arrays    |
+---------+---------+
          |
          v
+-------------------+
| Load default or   |
| user template     |
+---------+---------+
          |
          v
+-------------------+
| Assign colours,   |
| line styles, fill |
| and spin policy   |
+---------+---------+
          |
          v
+-------------------+
| Apply energy-range |
| clipping          |
+---------+---------+
          |
          v
+-------------------+
| Generate plot     |
| points            |
+---------+---------+
          |
          v
+-------------------+
| Render channels   |
| and filled areas  |
+---------+---------+
~~~

## Figure 27. Orbital-Metric Formula Compiler

~~~text
+------------------+
| Formula string   |
| B + C * 2        |
+--------+---------+
         |
         v
+------------------+
| Tokenize         |
| numbers, refs,   |
| operators        |
+--------+---------+
         |
         v
+------------------+
| Validate operand |
| and operator order|
+--------+---------+
         |
         v
+------------------+
| Apply precedence |
| and parentheses  |
+--------+---------+
         |
         v
+------------------+
| Postfix token    |
| representation   |
+--------+---------+
         |
         v
+------------------+
| Stack evaluation |
| for each energy  |
| row              |
+--------+---------+
         |
         v
+------------------+
| Derived DOS value|
| or null on error |
+------------------+
~~~

## Figure 28. Orbital Metrics Calculation

~~~text
+-------------------+
| Energy + DOS      |
| channel           |
+---------+---------+
          |
          v
+-------------------+
| Optional finite   |
| energy range      |
+---------+---------+
          |
          v
+-------------------+
| Generate valid    |
| integration points|
+---------+---------+
          |
          +-----------------------+
          |                       |
          v                       v
+------------------+    +------------------+
| Area metric      |    | Band-centre     |
| integrate DOS    |    | integrate E*DOS |
+--------+---------+    +--------+---------+
         |                       |
         v                       v
+------------------+    +------------------+
| Trapezoidal sum  |    | Divide weighted |
| integral         |    | integral by DOS |
+--------+---------+    +--------+---------+
         |                       |
         +-----------+-----------+
                     |
                     v
+-------------------+
| Metric result     |
| value + status    |
+-------------------+
~~~

## Figure 29. ZPE and Thermal Calculation

~~~text
+----------------------+
| Frequency list (THz) |
| and temperature T    |
+----------+-----------+
           |
           v
+----------------------+
| Tokenize and validate|
+----------+-----------+
           |
           v
+----------------------+
| Reject invalid, zero,|
| and negative modes   |
+----------+-----------+
           |
           v
+----------------------+
| Convert THz to Hz    |
+----------+-----------+
           |
           v
+----------------------+
| Calculate h*nu and   |
| x = h*nu/(kB*T)     |
+----------+-----------+
           |
           v
+----------------------+
| Bose-Einstein        |
| occupation number    |
+----------+-----------+
           |
           +---------------------+
           |                     |
           v                     v
+------------------+   +------------------+
| ZPE = h*nu/2     |   | Uthermal         |
+--------+---------+   +--------+---------+
         |                      |
         +----------+-----------+
                    |
                    v
          +------------------+
          | Svib and T*Svib  |
          +--------+---------+
                   |
                   v
          +------------------+
          | Fvib = ZPE + U  |
          |       - T*S     |
          +--------+---------+
                   |
                   v
          +------------------+
          | Per-mode and     |
          | total results    |
          +------------------+
~~~

## Figure 30. ZPE Export

~~~text
+-------------------+
| Calculation result|
+---------+---------+
          |
          +------------------+
          |                  |
          v                  v
+----------------+  +----------------+
| CSV rows       |  | XLSX workbook  |
| per mode +     |  | summary +      |
| totals         |  | per-mode data  |
+--------+-------+  +--------+-------+
         |                  |
         +--------+---------+
                  |
                  v
+-------------------+
| Browser download |
+-------------------+
~~~

## Figure 31. Browser Export Pipeline

~~~text
+--------------------+
| Text or result data|
+---------+----------+
          |
          v
+--------------------+
| Serialize to text, |
| CSV, XML, or image |
+---------+----------+
          |
          v
+--------------------+
| Create Blob        |
+---------+----------+
          |
          v
+--------------------+
| Create object URL  |
+---------+----------+
          |
          v
+--------------------+
| Programmatic       |
| anchor download    |
+---------+----------+
          |
          v
+--------------------+
| Revoke object URL  |
+--------------------+
~~~

## Figure 32. XLSX Generation Without a Spreadsheet Library

~~~text
+--------------------+
| Calculation rows   |
+---------+----------+
          |
          v
+--------------------+
| Build worksheet XML|
+---------+----------+
          |
          v
+--------------------+
| Build workbook XML |
+---------+----------+
          |
          v
+--------------------+
| Build relationships|
| and content types  |
+---------+----------+
          |
          v
+--------------------+
| Add XML files to   |
| JSZip archive      |
+---------+----------+
          |
          v
+--------------------+
| Generate XLSX Blob |
+---------+----------+
          |
          v
+--------------------+
| Download workbook  |
+--------------------+
~~~

## Figure 33. Security and Resource Cleanup

~~~text
Dynamic value
     |
     v
+----------------------+
| escapeHTML before    |
| HTML insertion       |
+----------+-----------+
           |
           v
+----------------------+
| Safe DOM rendering   |
+----------------------+

Viewer replacement
     |
     v
+----------------------+
| Remove old scene     |
+----------+-----------+
           |
           v
+----------------------+
| Dispose geometry and |
| material             |
+----------+-----------+
           |
           v
+----------------------+
| Remove listeners and |
| animation resources |
+----------------------+

Download completed
     |
     v
+----------------------+
| Revoke temporary URL |
+----------------------+
~~~

## Figure 34. Test Architecture

~~~text
+--------------------+
| Deterministic input|
| fixtures and text  |
+---------+----------+
          |
          v
+--------------------+
| Directly call      |
| src/lib functions  |
+---------+----------+
          |
          v
+--------------------+
| Compare structured |
| outputs and values |
+---------+----------+
          |
          v
+--------------------+
| Regression tests   |
| for scientific     |
| algorithms         |
+---------+----------+
          |
          v
+--------------------+
| Confidence before  |
| browser integration|
+--------------------+
~~~

Test areas:

~~~text
CIF -> symmetry -> Cartesian coordinates
QE output -> final structure
PDOS -> grid validation -> summation
DOS -> formula -> orbital metric
frequencies -> ZPE/TS totals
ACF.dat -> Bader charge
CSV -> branches -> free-energy plot model
JSON -> pathway validation
~~~

## Figure 35. Python PDOS CLI

~~~text
+-------------------+
| Terminal command  |
| pkdos summary/sum |
+---------+---------+
          |
          v
+-------------------+
| argparse command  |
| dispatch          |
+---------+---------+
          |
          v
+-------------------+
| Command handler   |
+---------+---------+
          |
          v
+-------------------+
| PDOS reader       |
+---------+---------+
          |
          v
+-------------------+
| Header/data parser|
+---------+---------+
          |
          v
+-------------------+
| pandas DataFrame  |
+---------+---------+
          |
          v
+-------------------+
| Summary or orbital|
| summation         |
+---------+---------+
          |
          v
+-------------------+
| Terminal or CSV   |
| output            |
+-------------------+
~~~

## Figure 36. Scientific Data Normalisation

~~~text
+-------------+   +---------------+   +---------------+
| CIF         |   | QE output     |   | PDOS/DOSCAR   |
+------+------+   +-------+-------+   +-------+-------+
       |                  |                   |
       v                  v                   v
+-------------+   +---------------+   +---------------+
| Structure   |   | QE result     |   | DOS records   |
| parser      |   | parser        |   | parser        |
+------+------+   +-------+-------+   +-------+-------+
       |                  |                   |
       +------------------+-------------------+
                          |
                          v
              +----------------------+
              | Internal data models |
              | atoms, vectors,      |
              | energy, channels,    |
              | metadata             |
              +----------+-----------+
                         |
                         v
              +----------------------+
              | Reusable algorithms  |
              +----------------------+
~~~

## Figure 37. Recommended Paper Figure Grouping

The individual diagrams can be grouped into a smaller set of publication figures:

~~~text
Figure A: Overall architecture and browser data pipeline
  Includes Figures 1, 2, and 31.

Figure B: Crystal structure processing
  Includes Figures 3, 4, 5, 6, and 7.

Figure C: Quantum ESPRESSO workflow engine
  Includes Figures 8, 9, 10, 11, and 12.

Figure D: 3D structure and adsorbate workflows
  Includes Figures 14, 15, 16, 17, and 18.

Figure E: Reaction energetics and thermodynamics
  Includes Figures 19, 20, 21, 22, and 29.

Figure F: Electronic-structure analysis
  Includes Figures 23, 24, 25, 26, 27, and 28.

Figure G: Validation and reproducibility
  Includes Figures 33, 34, 35, and 36.
~~~

## Figure Caption Style

Suggested caption pattern:

> Algorithmic blueprint of the [module name]. The module accepts [input], performs [main parsing or transformation steps], applies [scientific algorithm or validation], and produces [output]. Solid arrows represent the primary data flow, while ecision branches represent validation or alternative processing paths.

## Visual Redrawing Guidance

For the final paper version:

- Use vector graphics rather than screenshots.
- Use consistent colours for input, parsing, computation, validation, visualisation, and export.
- Use rounded rectangles for processing steps.
- Use diamonds for decisions and validation branches.
- Use cylinders or document icons for files.
- Use a single arrow direction from input to output.
- Keep equations beside the algorithm step where they are used.
- Use numbered steps when a module has a long sequential algorithm.
- Use separate colours for raw data, normalized data, and final results.
- Preserve the distinction between browser UI, reusable scientific logic, and visualization.

