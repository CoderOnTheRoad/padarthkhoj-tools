const cobaltCif = 'Co_2NCB_8a2_P_unrelaxed.cif';
const baderInput = 'bader/halfc1_scf.in';
const carbonCsv = 'carbon-pdos.csv';

async function exampleFile(path, filename = path.split('/').at(-1)) {
  const response = await fetch(new URL(`examples/${path}`, document.baseURI));
  if (!response.ok) throw new Error(`Could not fetch ${filename} (HTTP ${response.status}).`);
  return new File([await response.blob()], filename);
}

const examples = {
  'cif-editor': {
    files: ['triclinic.cif'],
    load: (page, [file]) => page._loadFile(file),
    steps: 'Inspect the two atoms in the 3D viewer. Click Create Input File to open the QE protocol selector.',
    expected: 'The CIF contains one C atom and one O atom in a triclinic cell.',
  },
  'input-editor': {
    files: [baderInput],
    load: async (page, [file], isCurrent) => {
      const text = await file.text();
      if (isCurrent()) page._addFile(file.name, text);
    },
    steps: 'Inspect the SCF input. Find the SYSTEM namelist and the K_POINTS block in the editor.',
    expected: 'The input defines 204 atoms and three species (C, N and H).',
  },
  'output-processor': {
    files: ['vc-relax.out'],
    load: (page, [file]) => {
      if (page.activeTab !== 0) page.container.querySelector('#out-tabs-bar [data-tab="0"]').click();
      return page._outToCifPanel._addFiles([file]);
    },
    steps: 'In OUT → CIF, inspect the final coordinates and click Save as CIF.',
    expected: 'The final cell is cubic with a = b = c = 5.43 Å. The output contains two Si atoms, with the second at fractional coordinates (0.251, 0.251, 0.251).',
  },
  'intermediate-maker': {
    files: [cobaltCif],
    load: (page, [file]) => page._loadFile(file),
    steps: 'Select the Co atom, continue to anchor placement, and use the anchor. Select HER and click Generate H adsorption.',
    expected: 'Download the preview CIF. It contains 59 atoms, including one added H atom.',
  },
  'custom-pathway-builder': {
    files: ['CO.cif'],
    load: (page, files) => page._enqueueMolecules(files),
    steps: 'Name the pathway, select the C atom in CO, and click Add intermediate to pathway. Export the pathway JSON.',
    expected: 'The pathway has one intermediate with two atoms, and its binding atom is C at the origin.',
  },
  'bader-charge-analysis': {
    files: ['bader/ACF.dat', baderInput],
    load: async (page, [acf, input], isCurrent) => {
      await page._loadACF(acf);
      if (isCurrent()) await page._loadReference(input);
    },
    steps: 'Enter core electron counts of 2 for C, 2 for N and 0 for H, then choose Excel only.',
    expected: 'The 204 atom rows match the reference. The ACF integrates 584.0022 electrons against 584 reference valence electrons, giving about −0.0022 e from the reported electron total. The rounded atom rows sum to about −0.0021 e.',
  },
  'pdos-analysis': {
    files: [['carbon-pdos.pdos', 'demo.pdos_atm#2(C)_wfc#2(p)']],
    load: (page, files) => page._loadFiles(files),
    steps: 'Select All detected atoms and the p orbital. Set the energy reference to −3.162 eV and click Generate PDOS.',
    expected: 'One spin-polarized C p record is recognized. The plot has 2,460 energy points spanning −20.28 to 4.31 eV after the shift.',
  },
  'scientific-dos-plotter': {
    files: [carbonCsv],
    load: (page, files) => page._loadFiles(files),
    steps: 'Inspect the plot and toggle a spin channel in the dataset controls.',
    expected: 'One spin-polarized dataset with 2,460 points loads over −20.28 to 4.31 eV.',
  },
  'orbital-metrics-calculator': {
    files: [carbonCsv],
    load: (page, files) => page._loadFiles(files),
    steps: 'Keep the default full energy range and click Calculate. Find the pz_up results.',
    expected: 'The integrated pz_up occupancy is about 0.679410, and the DOS centre is about −4.773165 eV.',
  },
  'zpe-ts-calculator': {
    files: [],
    load: page => {
      page.container.querySelector('#zts-example').click();
      page.container.querySelector('#zts-temperature').value = '298.15';
    },
    steps: 'At 298.15 K, click Calculate ZPE & vibrational TS.',
    expected: 'Seven modes are accepted. ZPE is about 0.682429 eV, and T × Svib is about 0.120988 eV.',
  },
  'free-energy-plotter': {
    files: ['reaction-energy.csv'],
    load: (page, files) => page._loadFiles(files),
    steps: 'Inspect the four steps of the plotted main path.',
    expected: 'The energies are 0.00, −0.42, 0.18 and −0.76 eV, in that order.',
  },
};

export function bindReviewerExample(pageId, page, isCurrent) {
  const example = examples[pageId];
  const button = document.getElementById('reviewer-example-load');
  const guide = document.getElementById('reviewer-example-guide');
  const status = document.getElementById('reviewer-example-status');
  const details = document.getElementById('reviewer-example-details');

  button.hidden = !example;
  button.disabled = false;
  button.setAttribute('aria-expanded', 'false');
  guide.hidden = true;
  details.hidden = true;
  status.textContent = '';
  button.onclick = example ? load : null;

  async function load() {
    if (!guide.hidden && !details.hidden) {
      guide.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      return;
    }

    guide.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    if (!details.hidden) return;
    button.disabled = true;
    status.textContent = 'Loading example…';

    try {
      const files = await Promise.all(example.files.map(file =>
        Array.isArray(file) ? exampleFile(...file) : exampleFile(file)));
      if (!isCurrent()) return;
      await example.load(page, files, isCurrent);
      if (!isCurrent()) return;
      document.getElementById('reviewer-example-steps').textContent = example.steps;
      document.getElementById('reviewer-example-expected').textContent = example.expected;
      details.hidden = false;
      status.textContent = '';
    } catch (error) {
      if (isCurrent()) status.textContent = error.message;
    } finally {
      if (isCurrent()) button.disabled = false;
    }
  }
}
