# QE Studio Complex Algorithm Blueprint Figures

These diagrams are intentionally more detailed than ordinary workflow figures. They expose parallel branches, nested sub-branches, fallback logic, validation loops, intermediate data models, and export paths. They are still text drafts and should be redrawn as vector figures for publication.

## Figure C1. Complete Application Dataflow With Branches

~~~text
                                      +----------------------+
                                      | User preference data |
                                      | theme, text size,    |
                                      | display style        |
                                      +----------+-----------+
                                                 |
                                                 v
+-------------------+                    +----------------------+
| User action       |------------------->| Page controller      |
| upload/click/drop |                    | constructor/render   |
+---------+---------+                    +----------+-----------+
          |                                         |
          |                                         v
          |                              +----------------------+
          |                              | Input classification |
          |                              +----------+-----------+
          |                                         |
          |       +-------------------+-------------+-------------------+
          |       |                   |                 |               |
          |       v                   v                 v               v
          |  +---------+       +-----------+      +---------+     +-----------+
          |  | CIF     |       | QE output |      | DOS/PDOS|     | CSV/JSON  |
          |  | branch  |       | branch    |      | branch  |     | branch    |
          |  +----+----+       +-----+-----+      +----+----+     +-----+-----+
          |       |                  |                 |                |
          |       v                  v                 v                v
          |  +---------+       +-----------+      +---------+     +-----------+
          |  | Structure|       | QE result |      | Energy  |     | Rows or   |
          |  | parser   |       | parser    |      | parser  |     | template  |
          |  +----+----+       +-----+-----+      +----+----+     +-----+-----+
          |       |                  |                 |                |
          +-------+------------------+-----------------+----------------+
                                      |
                                      v
                         +--------------------------+
                         | Normalized internal data |
                         +------------+-------------+
                                      |
              +-----------------------+------------------------+
              |                       |                        |
              v                       v                        v
      +---------------+       +---------------+        +---------------+
      | Structure      |       | Numerical     |        | Template or   |
      | computation    |       | analysis      |        | workflow state|
      +-------+--------+       +-------+-------+        +-------+-------+
              |                        |                        |
              v                        v                        v
      +---------------+       +---------------+        +---------------+
      | Three.js      |       | Canvas/chart  |        | Generated      |
      | viewer        |       | renderer      |        | files/results  |
      +-------+--------+       +-------+-------+        +-------+-------+
              |                        |                        |
              +------------+-----------+------------------------+
                           |
                           v
                   +----------------+
                   | User review    |
                   +-------+--------+
                           |
              +------------+-------------+
              |                          |
              v                          v
      +---------------+          +---------------+
      | Adjust inputs |          | Export result |
      | and recompute |          | text/data/image|
      +-------+-------+          +---------------+
              |
              +--------------------> computation loop
~~~

## Figure C2. Page Lifecycle and Global State

~~~text
+--------------------+
| Current page active|
+---------+----------+
          |
          v
+--------------------+
| User chooses page  |
+---------+----------+
          |
          v
+--------------------+
| Resolve page ID    |
+---------+----------+
          |
     +----+----+
     |         |
     v         v
+---------+ +----------------+
| Valid   | | Invalid        |
| page ID | | page ID        |
+----+----+ +--------+-------+
     |               |
     v               v
+---------+   +----------------+
| Destroy |   | Show/fallback  |
| current |   | navigation     |
+----+----+   +----------------+
     |
     v
+--------------------+
| Remove page events |
| dispose graphics   |
+---------+----------+
          |
          v
+--------------------+
| Clear page-content |
+---------+----------+
          |
          v
+--------------------+
| Instantiate page   |
+---------+----------+
          |
          v
+--------------------+
| page.render()      |
+---------+----------+
          |
          v
+--------------------+
| Read existing      |
| appState if needed |
+---------+----------+
          |
          v
+--------------------+
| Attach listeners   |
+---------+----------+
          |
          v
+--------------------+
| Update appState    |
| on cross-page data |
+---------+----------+
          |
          v
+--------------------+
| Page becomes active|
+--------------------+

appState branches:
+----------------------------------------------------------+
| CIF branch: cifData, cifFilename, selectedAtom           |
| QE branch: pendingProtocol, generatedInput(s)            |
| UI branch: theme/style/text-size preferences             |
+----------------------------------------------------------+
~~~

## Figure C3. CIF Parser With Symmetry and Error Branches

~~~text
+------------------+
| Raw CIF text     |
+--------+---------+
         |
         v
+------------------+
| Normalize line   |
| endings/comments |
+--------+---------+
         |
         v
+------------------+
| Scan scalar keys |
| cell lengths and |
| angles           |
+--------+---------+
         |
         v
+------------------+
| Scan all loops   |
+--------+---------+
         |
     +---+--------------------+
     |                        |
     v                        v
+-------------+      +----------------------+
| Atom loop   |      | Symmetry loop       |
+------+------+      +----------+-----------+
       |                        |
       v                        v
+-------------+      +----------------------+
| Identify    |      | Read operation text |
| label/type/ |      | and remove quotes   |
| x/y/z/occ   |      +----------+-----------+
+------+------+                 |
       |                        v
       |              +----------------------+
       |              | Tokenise x/y/z terms |
       |              +----------+-----------+
       |                         |
       |                         v
       |              +----------------------+
       |              | Build affine matrix  |
       |              | coefficients + const |
       |              +----------+-----------+
       |                         |
       +------------+------------+
                    |
                    v
          +----------------------+
          | Primitive atom list  |
          +----------+-----------+
                     |
                +----+----+
                |         |
                v         v
       +-------------+ +-------------+
       | No atoms    | | Atoms found |
       +------+------+ +------+------+
              |               |
              v               v
       +-------------+ +-------------+
       | Return null | | Add identity|
       | / error     | | operation   |
       +-------------+ +------+------+
                              |
                              v
                   +----------------------+
                   | Primitive duplicate  |
                   | check in fractional  |
                   | space                |
                   +----------+-----------+
                              |
                +-------------+-------------+
                |                           |
                v                           v
       +----------------+          +----------------+
       | Overlap found  |          | No overlap     |
       +--------+-------+          +--------+-------+
                |                           |
                v                           |
       +----------------+                   |
       | Keep higher     |                   |
       | occupancy       |                   |
       +--------+-------+                   |
                +------------+--------------+
                             |
                             v
                   +----------------------+
                   | Apply each symmetry  |
                   | operation to each    |
                   | remaining atom       |
                   +----------+-----------+
                              |
                              v
                   +----------------------+
                   | Wrap fractional      |
                   | positions to [0,1)   |
                   +----------+-----------+
                              |
                              v
                   +----------------------+
                   | Fractional ->        |
                   | Cartesian matrix      |
                   +----------+-----------+
                              |
                              v
                   +----------------------+
                   | Cartesian duplicate  |
                   | check                |
                   +----------+-----------+
                              |
                +-------------+-------------+
                |                           |
                v                           v
       +----------------+          +----------------+
       | Duplicate      |          | Unique atom   |
       | discard        |          | retain        |
       +----------------+          +--------+-------+
                                            |
                                            v
                              +----------------------+
                              | Expanded CIF model   |
                              | atoms + cell + sym   |
                              +----------------------+
~~~

## Figure C4. CIF Parsing Data Model

~~~text
+-------------------+
| CIF scalar values |
+---------+---------+
          |
          v
+-------------------+
| cell object       |
| a,b,c,alpha,beta, |
| gamma             |
+---------+---------+
          |
          +--------------------------+
          |                          |
          v                          v
+-------------------+       +-------------------+
| atom-site rows    |       | symmetry rows     |
+---------+---------+       +---------+---------+
          |                           |
          v                           v
+-------------------+       +-------------------+
| raw primitive     |       | parsed affine     |
| atoms             |       | symmetry ops     |
+---------+---------+       +---------+---------+
          |                           |
          +-------------+-------------+
                        |
                        v
             +-----------------------+
             | expanded atoms        |
             | fractional + Cartesian|
             +-----------+-----------+
                         |
       +-----------------+------------------+
       |                                    |
       v                                    v
+--------------+                     +--------------+
| 3D viewer    |                     | QE generator |
+--------------+                     +--------------+
~~~

## Figure C5. CIF Substitution Generator With Combinatorial Branches

~~~text
+------------------+
| Source CIF       |
+--------+---------+
         |
         v
+------------------+
| Parse atoms      |
| preserve rows    |
+--------+---------+
         |
         v
+------------------+
| For each atom ask |
| substitution?    |
+--------+---------+
         |
    +----+-------------------------+
    |                              |
    v                              v
+-----------+              +----------------+
| Inactive  |              | Active atom   |
| atom      |              | with options  |
+-----+-----+              +--------+-------+
      |                             |
      |                             v
      |                    +----------------+
      |                    | Validate option|
      |                    | set non-empty  |
      |                    +--------+-------+
      |                             |
      +-------------+---------------+
                    |
                    v
       +---------------------------+
       | Active substitution sets |
       +-------------+-------------+
                     |
                     v
       +---------------------------+
       | Cartesian-product engine |
       +-------------+-------------+
                     |
          +----------+----------+
          |                     |
          v                     v
+------------------+   +--------------------+
| Combination count|   | User limit or      |
| = product sizes  |   | memory check       |
+--------+---------+   +----------+---------+
         |                        |
         +------------+-----------+
                      |
                      v
          +-----------------------+
          | Iterate combinations  |
          +-----------+-----------+
                      |
                      v
          +-----------------------+
          | Replace type symbols  |
          +-----------+-----------+
                      |
                      v
          +-----------------------+
          | Replace label prefix  |
          +-----------+-----------+
                      |
                      v
          +-----------------------+
          | Add source/substitution|
          | provenance comment    |
          +-----------+-----------+
                      |
                      v
          +-----------------------+
          | Generated CIF records |
          +-----------+-----------+
                      |
                      v
          +-----------------------+
          | ZIP archive            |
          +-----------------------+
~~~

## Figure C6. CIF-to-QE Coordinate Decision Tree

~~~text
+--------------------+
| Parse full CIF     |
+---------+----------+
          |
          v
+--------------------+
| Find atom-site loop|
+---------+----------+
          |
      +---+---+
      |       |
      v       v
+-----------+ +--------------+
| Found     | | Not found    |
+-----+-----+ +------+-------+
      |               |
      v               v
+-----------+  +---------------+
| Find type |  | Raise parser  |
| and coords|  | error         |
+-----+-----+  +---------------+
      |
      v
+--------------------+
| Cartesian columns  |
| available?         |
+---------+----------+
          |
      +---+---+
      |       |
      v       v
+-----------+ +--------------+
| Yes       | | No           |
+-----+-----+ +------+-------+
      |               |
      v               v
+-----------+  +---------------+
| Use direct|  | Fractional    |
| Cartesian |  | coordinates?  |
+-----+-----+  +------+--------+
      |               |
      |          +----+----+
      |          |         |
      |          v         v
      |     +---------+ +---------+
      |     | Yes     | | No      |
      |     +----+----+ +----+----+
      |          |           |
      |          v           v
      |     +---------+ +---------+
      |     | Crystal | | Invalid |
      |     | output  | | row     |
      |     +----+----+ +---------+
      |          |
      |          v
      |     +---------+
      |     | Check   |
      |     | cell    |
      |     +----+----+
      |          |
      |      +---+---+
      |      |       |
      |      v       v
      | +---------+ +---------+
      | | Present | | Missing |
      | +----+----+ +----+----+
      |      |           |
      |      v           v
      | +---------+ +---------+
      | | Convert | | Error   |
      | | to Å    | | no cell |
      | +----+----+ +---------+
      |      |
      +------+ 
             |
             v
+--------------------+
| Format QE card     |
| ATOMIC_POSITIONS   |
+---------+----------+
          |
          v
+--------------------+
| Return text and    |
| metadata           |
+--------------------+
~~~

## Figure C7. Protocol-Driven QE Generation With Workflow Branches

~~~text
+-------------------------+
| Structure model         |
| atoms, cell, species    |
+------------+------------+
             |
             v
+-------------------------+
| Protocol selector       |
+------------+------------+
             |
      +------+-------+----------------+----------------+
      |              |                |                |
      v              v                v                v
+----------+   +----------+     +----------+     +----------+
| SCF      |   | Relax    |     | DOS      |     | Bands   |
+----+-----+   +----+-----+     +----+-----+     +----+-----+
     |              |                |                |
     |              v                v                v
     |       +-------------+  +-------------+  +-------------+
     |       | Add IONS    |  | SCF -> NSCF |  | K-path     |
     |       | BFGS        |  | -> DOS ->   |  | preset     |
     |       +------+------+  | PDOS        |  +------+------+
     |              |         +------+------+         |
     |              |                |                |
     v              v                v                v
+----------+   +----------+  +-------------+  +-------------+
| Static   |   | Ionic    |  | Multiple    |  | Band path  |
| CONTROL |   | movement |  | input files |  | K_POINTS   |
+----+-----+   +----+-----+  +------+------+  +------+------+ 
     |              |                |                |
     +--------------+----------------+----------------+
                            |
                            v
                 +-------------------------+
                 | Shared system builder   |
                 | species, cell, k-points |
                 +------------+------------+
                              |
                              v
                 +-------------------------+
                 | Pseudopotential lookup |
                 | mass lookup             |
                 +------------+------------+
                              |
                              v
                 +-------------------------+
                 | Render QE namelists and |
                 | cards                   |
                 +------------+------------+
                              |
                              v
                 +-------------------------+
                 | Generated input object  |
                 | one file or file list   |
                 +-------------------------+
~~~

## Figure C8. QE Output Parser With Multiple Fallbacks

~~~text
+-------------------+
| QE output text    |
+---------+---------+
          |
          v
+-------------------+
| First pass: scan  |
| numerical/status  |
| histories         |
+---------+---------+
          |
          +-----------------------------+
          |                             |
          v                             v
+----------------------+       +----------------------+
| Energy/force/pressure|       | Convergence/errors   |
| arrays               |       | job completion       |
+----------+-----------+       +----------+-----------+
           |                              |
           +--------------+---------------+
                          |
                          v
+----------------------+
| Detect calculation   |
| metadata             |
+----------+-----------+
           |
       +---+---+
       |       |
       v       v
+-----------+ +----------------+
| Explicit  | | Missing/unclear|
| type      | | metadata        |
+-----+-----+ +--------+-------+
      |               |
      |               v
      |      +----------------------+
      |      | Infer from structure|
      |      | cards and BFGS       |
      |      +----------+-----------+
      |                 |
      +--------+--------+
               |
               v
+----------------------+
| Parse initial cell   |
| and initial atoms    |
+----------+-----------+
           |
           v
+----------------------+
| Search repeated      |
| CELL_PARAMETERS and  |
| ATOMIC_POSITIONS     |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +--------------+
| Paired    | | Fixed-cell   |
| snapshots | | positions    |
+-----+-----+ +------+-------+
      |               |
      +-------+-------+
              |
              v
+----------------------+
| Search final block   |
| Begin final coords   |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +--------------+
| Found     | | Not found    |
+-----+-----+ +------+-------+
      |               |
      v               v
+-----------+  +---------------+
| Use final |  | Use last      |
| block     |  | ATOMIC_POSITIONS|
+-----+-----+  +---------------+
      |               |
      +-------+-------+
              |
              v
+----------------------+
| Normalize Bohr, alat,|
| crystal, Angstrom    |
+----------+-----------+
           |
           v
+----------------------+
| QE result model      |
+----------------------+
~~~

## Figure C9. QE Output-to-Input Reconstruction Decision Tree

~~~text
+-----------------------+
| QE output result P    |
+-----------+-----------+
            |
            v
+-----------------------+
| Need initial or final |
| structure?            |
+-----------+-----------+
            |
       +----+----+
       |         |
       v         v
+-----------+ +-----------+
| Initial   | | Final     |
+-----+-----+ +-----+-----+
      |             |
      v             v
+-----------+ +----------------+
| initAtoms | | finalAtoms or  |
| initVecs  | | fallback atoms |
+-----+-----+ +-------+--------+
      |               |
      +-------+-------+
              |
              v
+-----------------------+
| Original input exists?|
+-----------+-----------+
            |
       +----+----+
       |         |
       v         v
+-----------+ +-----------+
| Yes       | | No        |
+-----+-----+ +-----+-----+
      |             |
      v             v
+-----------+ +-----------+
| Parse ibrav| | Build from |
| and cards  | | parameter  |
+-----+-----+ | object      |
      |       +-----+-----+
      v             |
+----------------+   |
| Patch selected |   |
| structure cards|   |
+--------+-------+   |
         |           |
         +-----+-----+
               |
               v
+-----------------------+
| Return updated input  |
| plus change metadata  |
+-----------------------+
~~~

## Figure C10. Bader Analysis With Matching and Validation Branches

~~~text
+------------------+       +---------------------+
| ACF.dat          |       | Reference structure |
+--------+---------+       | QE / POSCAR         |
         |                 +----------+----------+
         v                            |
+------------------+                   v
| Parse Bader rows |       +---------------------+
| charge + volume  |       | Parse atoms/species |
+--------+---------+       +----------+----------+
         |                            |
         +-------------+--------------+
                       |
                       v
             +----------------------+
             | Compare atom counts  |
             +----------+-----------+
                        |
              +---------+---------+
              |                   |
              v                   v
       +--------------+   +------------------+
       | Counts match |   | Counts differ   |
       +------+-------+   +--------+---------+
              |                    |
              v                    v
       +--------------+   +------------------+
       | Match by      |   | Report mismatch |
       | atom order    |   | or partial data |
       +------+-------+   +------------------+
              |                    |
              +---------+----------+
                        |
                        v
             +----------------------+
             | Resolve valence      |
             | electron reference   |
             +----------+-----------+
                        |
              +---------+---------+
              |                   |
              v                   v
       +--------------+   +------------------+
       | Metadata or  |   | Fallback atomic  |
       | pseudo data  |   | number mapping   |
       +------+-------+   +--------+---------+
              |                    |
              +---------+----------+
                        |
                        v
             +----------------------+
             | q = valence - charge |
             +----------+-----------+
                        |
                        v
             +----------------------+
             | Charge-enriched model|
             +----------+-----------+
                        |
             +----------+-----------+
             |                      |
             v                      v
   +------------------+    +------------------+
   | Colour 3D atoms  |    | Build workbook   |
   | by charge scale  |    | and summary      |
   +------------------+    +------------------+
~~~

## Figure C11. Intermediate Placement With Orientation Branches

~~~text
+---------------------+
| Catalyst structure  |
+----------+----------+
           |
           v
+---------------------+
| Select active atom  |
+----------+----------+
           |
           v
+---------------------+
| Select intermediate |
| template            |
+----------+----------+
           |
           v
+---------------------+
| Identify anchor and |
| adsorption axis     |
+----------+----------+
           |
           v
+---------------------+
| Orientation input   |
+----------+----------+
           |
      +----+--------------------+
      |                         |
      v                         v
+-----------+          +----------------+
| Angles    |          | Direction      |
| supplied  |          | vector supplied|
+-----+-----+          +--------+-------+
      |                         |
      v                         v
+-----------+          +----------------+
| Convert to|          | Normalize      |
| vector    |          | vector         |
+-----+-----+          +--------+-------+
      |                         |
      +------------+------------+
                   |
                   v
        +----------------------+
        | Rotate intermediate   |
        | around anchor         |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Translate anchor to   |
        | active-site offset   |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Pairwise distance     |
        | and volume checks     |
        +----------+-----------+
                   |
          +--------+--------+
          |                 |
          v                 v
+----------------+  +-------------------+
| Atom collision |  | No atom collision |
+--------+-------+  +---------+---------+
         |                    |
         v                    v
+----------------+  +-------------------+
| Warning state  |  | Candidate accepted |
| and adjustment |  +---------+---------+
+--------+-------+            |
         |                    v
         +-----------> +-------------------+
                       | Render or export |
                       +-------------------+
~~~

## Figure C12. Placement Suggestions With Candidate Search

~~~text
+----------------------+
| Active atom          |
+----------+-----------+
           |
           v
+----------------------+
| Define sphere radius |
| and centre distance  |
+----------+-----------+
           |
           v
+----------------------+
| Generate candidate   |
| directions           |
+----------+-----------+
           |
           v
+----------------------+
| Candidate i          |
+----------+-----------+
           |
           v
+----------------------+
| Place intermediate   |
| at candidate i       |
+----------+-----------+
           |
           v
+----------------------+
| Evaluate minimum     |
| distances            |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +-----------+
| Invalid   | | Valid     |
+-----+-----+ +-----+-----+
      |             |
      v             v
+-----------+ +-----------+
| Discard   | | Score or  |
| candidate | | retain    |
+-----+-----+ +-----+-----+
      |             |
      |             v
      |       +-----------+
      |       | Limit N   |
      |       | reached?  |
      |       +-----+-----+
      |             |
      |        +----+----+
      |        |         |
      |        v         v
      |   +---------+ +---------+
      |   | Yes     | | No      |
      |   +----+----+ +----+----+
      |        |           |
      +--------+           +----> Candidate i+1
               |
               v
+----------------------+
| Return valid sphere  |
| suggestions          |
+----------------------+
~~~

## Figure C13. Free-Energy Plot Pipeline With Branches

~~~text
+-------------------+
| CSV input         |
+---------+---------+
          |
          v
+-------------------+
| Parse rows        |
+---------+---------+
          |
          v
+-------------------+
| Validate required |
| step/energy data  |
+---------+---------+
          |
      +---+---+
      |       |
      v       v
+-----------+ +-------------+
| Valid     | | Invalid     |
+-----+-----+ +------+------+
      |               |
      v               v
+-----------+  +--------------+
| Group by  |  | Show parsing |
| branch    |  | error        |
+-----+-----+  +--------------+
      |
      v
+-------------------+
| Identify main     |
| branch            |
+---------+---------+
          |
      +---+--------------------+
      |                        |
      v                        v
+-----------+          +----------------+
| Single    |          | Multiple       |
| branch   |          | branches       |
+-----+-----+          +--------+-------+
      |                         |
      |                         v
      |                +----------------+
      |                | Find sub-branch|
      |                | relationships  |
      |                +--------+-------+
      |                         |
      +------------+------------+
                   |
                   v
        +----------------------+
        | Calculate y-range    |
        | min/max + padding    |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Choose nice tick     |
        | interval             |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | Map data to pixels   |
        +----------+-----------+
                   |
          +--------+---------+
          |                  |
          v                  v
+----------------+  +-------------------+
| Main branch    |  | Ghost/sub-branch  |
| rendering      |  | rendering         |
+--------+-------+  +---------+---------+
         |                    |
         +---------+----------+
                   |
                   v
        +----------------------+
        | Interaction overlay  |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | PNG or bulk ZIP     |
        +----------------------+
~~~

## Figure C14. PDOS Parsing, Selection, and Summation

~~~text
+--------------------+
| PDOS/DOSCAR files  |
+----------+---------+
           |
           v
+--------------------+
| Detect file family |
+----------+---------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| PDOS text | | DOSCAR    |
+-----+-----+ +------+-----+
      |               |
      v               v
+-----------+ +------------+
| Filename  | | DOSCAR    |
| metadata  | | header    |
+-----+-----+ +------+-----+
      |               |
      v               v
+-----------+ +------------+
| Header and| | Total/partial|
| columns   | | DOS blocks |
+-----+-----+ +------+-----+
      |               |
      +-------+-------+
              |
              v
+----------------------+
| Normalized records   |
| energy + channels +  |
| atom/orbital/spin    |
+----------+-----------+
           |
           v
+----------------------+
| Parse user selection |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| All data  | | Filtered   |
| selected  | | selection  |
+-----+-----+ +------+-----+
      |               |
      +-------+-------+
              |
              v
+----------------------+
| Validate energy-grid |
| length and values    |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| Compatible| | Incompatible|
+-----+-----+ +------+-----+
      |               |
      v               v
+-----------+ +------------+
| Apply E_F  | | Stop with  |
| shift      | | warning    |
+-----+-----+ +------------+
      |
      v
+----------------------+
| Select orbital and   |
| spin channels        |
+----------+-----------+
           |
           v
+----------------------+
| Element-wise sum over|
| matching energy grid |
+----------+-----------+
           |
           v
+----------------------+
| Combined DOS result  |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| Plot      | | CSV export |
+-----------+ +------------+
~~~

## Figure C15. Scientific DOS Plotter With Template Overrides

~~~text
+------------------+
| DOS dataset      |
+--------+---------+
         |
         v
+------------------+
| Parse energy and |
| channel arrays   |
+--------+---------+
         |
         v
+------------------+
| Load default     |
| style palette    |
+--------+---------+
         |
         v
+------------------+
| Template supplied?|
+--------+---------+
         |
    +----+----+
    |         |
    v         v
+---------+ +-----------+
| No      | | Yes       |
+----+----+ +-----+-----+
     |            |
     |            v
     |     +----------------+
     |     | Validate format|
     |     | and version     |
     |     +--------+-------+
     |              |
     |          +---+---+
     |          |       |
     |          v       v
     |      +-------+ +--------+
     |      | Valid | | Invalid|
     |      +---+---+ +----+---+
     |          |          |
     |          |          v
     |          |    +-----------+
     |          |    | Use default|
     |          |    | and warn   |
     |          |    +-----------+
     |          | 
     +----------+ 
                |
                v
+----------------------+
| Resolve channel      |
| policy by name/index |
+----------+-----------+
           |
           v
+----------------------+
| Apply colour, line,  |
| fill, opacity, range |
+----------+-----------+
           |
           v
+----------------------+
| Clip energy range    |
+----------+-----------+
           |
           v
+----------------------+
| Draw each channel    |
+----------+-----------+
           |
           v
+----------------------+
| Optional fill area   |
| and spin-down style  |
+----------+-----------+
           |
           v
+----------------------+
| Interactive plot     |
+----------------------+
~~~

## Figure C16. Orbital Metrics Formula and Calculation Branches

~~~text
+-------------------+
| DOS dataset       |
+---------+---------+
          |
          v
+-------------------+
| Base energy and   |
| channel columns   |
+---------+---------+
          |
          v
+-------------------+
| User adds formula |
+---------+---------+
          |
          v
+-------------------+
| Tokenizer         |
+---------+---------+
          |
          v
+-------------------+
| Syntax validation |
+---------+---------+
          |
      +---+---+
      |       |
      v       v
+-----------+ +----------------+
| Valid     | | Invalid        |
+-----+-----+ +--------+-------+
      |               |
      v               v
+-----------+  +----------------+
| Operator  |  | Error message  |
| precedence|  | formula rejected|
+-----+-----+  +----------------+
      |
      v
+-------------------+
| Postfix expression|
+---------+---------+
          |
          v
+-------------------+
| Evaluate each row |
+---------+---------+
          |
      +---+-----------------+
      |                     |
      v                     v
+-----------+       +----------------+
| All refs  |       | Missing ref or |
| available |       | invalid result |
+-----+-----+       +--------+-------+
      |                      |
      v                      v
+-----------+       +----------------+
| Derived   |       | Null value and |
| column    |       | warning        |
+-----+-----+       +----------------+
      |
      v
+-------------------+
| Select metric type|
+---------+---------+
          |
      +---+---+
      |       |
      v       v
+-----------+ +---------------+
| Area      | | Band centre   |
+-----+-----+ +-------+-------+
      |               |
      v               v
+-----------+ +---------------+
| Integrate | | Integrate     |
| DOS       | | E*DOS          |
+-----+-----+ +-------+-------+
      |               |
      +-------+-------+
              |
              v
+-------------------+
| Trapezoidal rule  |
+---------+---------+
          |
          v
+-------------------+
| Metric value and  |
| status            |
+-------------------+
~~~

## Figure C17. ZPE/TS Calculation With Numerical Stability Branches

~~~text
+----------------------+
| Frequency text + T   |
+----------+-----------+
           |
           v
+----------------------+
| Tokenize separators  |
| spaces/comma/semicolon|
+----------+-----------+
           |
           v
+----------------------+
| Convert each token   |
| to number            |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +-----------+
| Numeric   | | Invalid   |
+-----+-----+ +-----+-----+
      |             |
      |             v
      |      +-------------+
      |      | Add rejected|
      |      | token       |
      |      +-------------+
      |
      v
+----------------------+
| Frequency sign check |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| > 0       | | <= 0       |
+-----+-----+ +------+-----+
      |               |
      |               v
      |        +----------------+
      |        | Reject zero or |
      |        | imaginary mode |
      |        +----------------+
      |
      v
+----------------------+
| Convert THz -> Hz    |
+----------+-----------+
           |
           v
+----------------------+
| Compute quantum h*nu |
| and x = h*nu/kBT     |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| x normal  | | x very high|
+-----+-----+ +------+-----+
      |               |
      v               v
+-----------+  +-------------+
| Evaluate  |  | Use limiting|
| exp terms |  | occupation 0 |
+-----+-----+  +-------------+
      |               |
      +-------+-------+
              |
              v
+----------------------+
| Calculate ZPE, U, S, |
| TS, free-energy term |
+----------+-----------+
           |
           v
+----------------------+
| Add to total sums    |
+----------+-----------+
           |
           v
+----------------------+
| Per-mode and total   |
| thermodynamic result |
+----------------------+
~~~

## Figure C18. Export Architecture With Format Branches

~~~text
+----------------------+
| Normalized result    |
+----------+-----------+
           |
           v
+----------------------+
| Select export type   |
+----------+-----------+
           |
    +------+------+------+------+------+
    |             |             |      |
    v             v             v      v
+-------+     +-------+     +-------+ +------+
| Text  |     | CSV   |     | PNG   | | XLSX |
+---+---+     +---+---+     +---+---+ +--+---+
    |             |             |        |
    v             v             v        v
+-------+     +-------+     +-------+ +--------+
| String|     | Rows  |     | Canvas| | XML    |
| output|     | quote |     | Blob  | | sheets |
+---+---+     +---+---+     +---+---+ +---+----+
    |             |             |        |
    +------+------+------+------+--------+
           |
           v
+----------------------+
| One file or multiple |
| files?               |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| One file  | | Many files |
+-----+-----+ +------+-----+
      |               |
      v               v
+-----------+  +------------+
| Download  |  | Add files  |
| Blob      |  | to JSZip   |
+-----+-----+  +------+-----+
      |               |
      +-------+-------+
              |
              v
+----------------------+
| Create temporary URL |
+----------+-----------+
           |
           v
+----------------------+
| Programmatic download|
+----------+-----------+
           |
           v
+----------------------+
| Revoke temporary URL |
+----------------------+
~~~

## Figure C19. Test and Validation Coverage

~~~text
+----------------------+
| Input fixture        |
+----------+-----------+
           |
           v
+----------------------+
| Direct library call  |
+----------+-----------+
           |
           v
+----------------------+
| Parser validation    |
+----------+-----------+
           |
      +----+----+
      |         |
      v         v
+-----------+ +------------+
| Valid data| | Invalid data|
+-----+-----+ +------+-----+
      |               |
      v               v
+-----------+  +--------------+
| Scientific |  | Expected error|
| algorithm  |  | or warning    |
+-----+-----+  +--------------+
      |               |
      v               v
+-----------+  +--------------+
| Structured |  | Rejection is |
| result     |  | asserted     |
+-----+-----+  +--------------+
      |
      v
+----------------------+
| Numerical invariants |
| unit conversions     |
| array lengths        |
| final values         |
+----------+-----------+
           |
           v
+----------------------+
| Regression suite     |
+----------+-----------+
           |
           v
+----------------------+
| Benchmark comparison |
+----------------------+
~~~

## Figure C20. Full Paper-Level Master Blueprint

~~~text
+------------------------+
| Scientific input files |
+------------+-----------+
             |
             v
+------------------------+
| Acquisition layer      |
| browser upload / CLI   |
+------------+-----------+
             |
             v
+------------------------+
| Format identification  |
+------------+-----------+
             |
      +------+------+------+------+------+
      |             |             |      |
      v             v             v      v
+---------+   +---------+   +---------+ +---------+
| CIF     |   | QE      |   | DOS/PDOS| | Energetic|
| branch  |   | branch  |   | branch  | | branch  |
+----+----+   +----+----+   +----+----+ +----+----+
     |             |             |           |
     v             v             v           v
+---------+   +---------+   +---------+ +---------+
| Symmetry|   | Unit    |   | Grid    | | CSV     |
| expand  |   | normalise|   | validate| | group   |
+----+----+   +----+----+   +----+----+ +----+----+
     |             |             |           |
     +------+------+------+------+-----------+
            |
            v
+------------------------+
| Shared normalized data |
| structure, energy,     |
| channels, metadata     |
+------------+-----------+
             |
   +---------+----------+------------------+
   |                    |                  |
   v                    v                  v
+---------+      +-------------+    +-------------+
| Geometry|      | QE workflow |    | Numerical   |
| engine  |      | engine      |    | analysis   |
+----+----+      +------+------+    +------+------+
     |                   |                 |
     v                   v                 v
+---------+      +-------------+    +-------------+
| Viewer  |      | Generated   |    | Metrics /   |
| and     |      | input/output|    | energies /  |
| placement|     | files       |    | thermodynamics|
+----+----+      +------+------+    +------+------+
     |                   |                 |
     +---------+---------+-----------------+
               |
               v
+------------------------+
| Validation and review  |
+------------+-----------+
             |
     +-------+--------+
     |                |
     v                v
+----------+    +------------+
| Revise   |    | Export     |
| inputs   |    | artifacts  |
+----+-----+    +------+-----+
     |                 |
     +------->---------+
          recompute loop
~~~

## Figure Construction Recommendations

For a final complex paper figure:

- Use a left-to-right primary direction.
- Use vertical branches for alternative file formats or protocols.
- Use diamonds for validation and decision points.
- Use double-line borders for reusable scientific library modules.
- Use dashed arrows for fallback paths.
- Use loop-back arrows for user correction and recomputation.
- Use different colours for input, parsing, normalization, calculation, visualization, validation, and export.
- Keep raw file types as document-shaped nodes.
- Keep equations next to the numerical step where they are evaluated.
- Use subfigure labels such as (a) CIF branch, (b) QE branch, (c) PDOS branch, and (d) thermodynamics branch.
- Avoid putting every internal function into one final figure. Use the master blueprint for the overview and the module figures for detailed subfigures.

