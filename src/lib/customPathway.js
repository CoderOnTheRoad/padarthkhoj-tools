const FORMAT = 'padarthkhoj-custom-pathway';
const VERSION = 1;

const cleanName = value => String(value || '').trim();
const finite = value => Number.isFinite(Number(value));

export function templateFromCIF(parsed, bindingAtom, options = {}) {
  if (!parsed?.atoms?.length) throw new Error('The intermediate CIF contains no atoms.');
  const index = Number(bindingAtom);
  if (!Number.isInteger(index) || index < 0 || index >= parsed.atoms.length) {
    throw new Error('Select the atom that will bind to the catalyst.');
  }
  const name = cleanName(options.name);
  if (!name) throw new Error('Enter a name for this intermediate.');
  const origin = parsed.atoms[index];
  return {
    id: options.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: name,
    sourceFilename: cleanName(options.sourceFilename) || 'intermediate.cif',
    bindingAtom: index,
    atoms: parsed.atoms.map(atom => ({
      element: atom.element,
      x: atom.cx - origin.cx,
      y: atom.cy - origin.cy,
      z: atom.cz - origin.cz,
    })),
  };
}

export function validateCustomPathway(value) {
  if (!value || typeof value !== 'object') throw new Error('The pathway file is not valid JSON data.');
  if (value.format !== FORMAT) throw new Error('This is not a Padarthkhoj custom-pathway file.');
  if (value.version !== VERSION) throw new Error(`Unsupported pathway version: ${value.version}.`);
  const name = cleanName(value.pathway?.name);
  if (!name) throw new Error('The pathway has no name.');
  const input = value.pathway?.intermediates;
  if (!Array.isArray(input) || !input.length) throw new Error('The pathway contains no intermediates.');
  const labels = new Set();
  const intermediates = input.map((item, itemIndex) => {
    const label = cleanName(item?.label);
    if (!label) throw new Error(`Intermediate ${itemIndex + 1} has no name.`);
    if (labels.has(label.toLowerCase())) throw new Error(`Duplicate intermediate name: ${label}.`);
    labels.add(label.toLowerCase());
    if (!Array.isArray(item.atoms) || !item.atoms.length) throw new Error(`${label} contains no atoms.`);
    const bindingAtom = Number(item.bindingAtom);
    if (!Number.isInteger(bindingAtom) || bindingAtom < 0 || bindingAtom >= item.atoms.length) throw new Error(`${label} has an invalid binding atom.`);
    const atoms = item.atoms.map((atom, atomIndex) => {
      if (!/^[A-Z][a-z]?$/.test(String(atom?.element || ''))) throw new Error(`${label}, atom ${atomIndex + 1}, has an invalid element.`);
      if (![atom.x, atom.y, atom.z].every(finite)) throw new Error(`${label}, atom ${atomIndex + 1}, has invalid coordinates.`);
      return { element: atom.element, x:Number(atom.x), y:Number(atom.y), z:Number(atom.z) };
    });
    const binding = atoms[bindingAtom];
    const shifted = atoms.map(atom => ({ element:atom.element, x:atom.x-binding.x, y:atom.y-binding.y, z:atom.z-binding.z }));
    return { id:cleanName(item.id) || `custom-${itemIndex + 1}`, label, sourceFilename:cleanName(item.sourceFilename) || 'imported.cif', bindingAtom, atoms:shifted };
  });
  return { name, intermediates };
}

export function serializeCustomPathway(pathway) {
  const validated = validateCustomPathway({ format:FORMAT, version:VERSION, pathway });
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    createdBy: 'Padarthkhoj Tools — Custom Pathway Builder',
    warning: 'Initial molecular geometries only. Cross-check and optimize every generated catalyst structure.',
    pathway: validated,
  }, null, 2);
}

export function parseCustomPathwayJSON(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('The selected file is not valid JSON.'); }
  return validateCustomPathway(value);
}

export const CUSTOM_PATHWAY_FORMAT = FORMAT;
