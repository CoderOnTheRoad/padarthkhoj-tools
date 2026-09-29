import { NO3_TO_NH3_INTERMEDIATES } from './nrrIntermediates.js';
import { CO2RR_C2H4_PATH, CO2RR_CHO_ALTERNATIVE, CO2RR_ETHANOL_PATH } from './co2rrIntermediates.js';

export const HER_INTERMEDIATES = [{
  id: 'H',
  label: 'H',
  bindingAtom: 0,
  atoms: [{ element: 'H', x: 0, y: 0, z: 0 }],
}];

// Extracted from the supplied Ni-surface relaxed structures. The first N in
// each template is the Ni-bound atom; coordinates are Cartesian angstrom
// offsets from that binding N. The catalyst itself is intentionally omitted.
export const N2_TO_NH3_INTERMEDIATES = [
  {
    id: 'NNH', label: 'NNH', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'N', x: -1.0406, y: 0.2998, z: 0.5438 },
      { element: 'H', x: -0.9542, y: 0.2474, z: 1.5858 },
    ],
  },
  {
    id: 'NNH2', label: 'NNH₂', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'N', x: -0.0964, y: -0.1386, z: 1.3266 },
      { element: 'H', x: 0.3434, y: -0.9910, z: 1.6894 },
      { element: 'H', x: 0.1872, y: 0.6998, z: 1.8470 },
    ],
  },
  {
    id: 'NHNH', label: 'NHNH', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'N', x: 0.7316, y: 0.4492, z: 0.9666 },
      { element: 'H', x: 1.5522, y: 0.9064, z: 0.5224 },
      { element: 'H', x: -0.8326, y: -0.4726, z: 0.3944 },
    ],
  },
  {
    id: 'NHNH2', label: 'NHNH₂', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'N', x: 0.8378, y: 0.4328, z: 1.0474 },
      { element: 'H', x: 1.3682, y: 1.2402, z: 0.7084 },
      { element: 'H', x: -0.4646, y: -0.8666, z: 0.3008 },
      { element: 'H', x: 0.2766, y: 0.7314, z: 1.8558 },
    ],
  },
  {
    id: 'NH2NH2', label: 'NH₂NH₂', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'N', x: 1.2892, y: -0.0258, z: 0.6776 },
      { element: 'H', x: 1.9864, y: 0.2102, z: -0.0378 },
      { element: 'H', x: -0.4938, y: -0.8656, z: 0.2490 },
      { element: 'H', x: 1.3074, y: 0.7184, z: 1.3816 },
      { element: 'H', x: -0.5764, y: 0.7758, z: 0.3480 },
    ],
  },
  { id: 'N', label: 'N', bindingAtom: 0, atoms: [{ element: 'N', x: 0, y: 0, z: 0 }] },
  {
    id: 'NH', label: 'NH', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'H', x: 0.2674, y: -0.1468, z: 0.9804 },
    ],
  },
  {
    id: 'NH2', label: 'NH₂', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'H', x: 0.6336, y: 0.5996, z: 0.5340 },
      { element: 'H', x: -0.6676, y: -0.4576, z: 0.6266 },
    ],
  },
  {
    id: 'NH3', label: 'NH₃', bindingAtom: 0,
    atoms: [
      { element: 'N', x: 0, y: 0, z: 0 },
      { element: 'H', x: 0.5236, y: 0.8000, z: 0.3674 },
      { element: 'H', x: -0.9412, y: 0.0308, z: 0.4028 },
      { element: 'H', x: 0.4614, y: -0.8512, z: 0.3344 },
    ],
  },
];

// O/OH/OOH geometries for the shared OER/ORR family. OH and OOH retain the
// relaxed internal coordinates supplied by the user. Coordinates are Cartesian
// angstrom offsets from the surface-binding oxygen atom.
export const OER_ORR_INTERMEDIATES = [
  {
    id: 'O',
    label: 'O',
    bindingAtom: 0,
    atoms: [{ element: 'O', x: 0, y: 0, z: 0 }],
  },
  {
    id: 'OH',
    label: 'OH',
    bindingAtom: 0,
    atoms: [
      { element: 'O', x: 0, y: 0, z: 0 },
      { element: 'H', x: -0.98728, y: 0, z: 0 },
    ],
  },
  {
    id: 'OOH',
    label: 'OOH',
    bindingAtom: 1,
    atoms: [
      { element: 'O', x: -0.02920, y: -0.60400, z: 1.03910 },
      { element: 'O', x: 0, y: 0, z: 0 },
      { element: 'H', x: -0.06940, y: 0.04870, z: 1.79610 },
    ],
  },
];

export const INTERMEDIATE_PATHWAYS = [
  {
    id: 'nrr-no3-nh3',
    family: 'NRR',
    reactionLabel: 'NO₃ → NH₃',
    exportLabel: 'NO3_to_NH3',
    description: 'Complete nitrate-to-ammonia starting-geometry pathway',
    templates: NO3_TO_NH3_INTERMEDIATES,
  },
  {
    id: 'nrr-n2-nh3',
    family: 'NRR',
    reactionLabel: 'N₂ → NH₃',
    exportLabel: 'N2_to_NH3',
    description: 'Nine relaxed adsorbate geometries extracted from the supplied Ni-site pathway',
    templates: N2_TO_NH3_INTERMEDIATES,
  },
  {
    id: 'co2rr-c2h4',
    family: 'CO2RR',
    reactionLabel: 'CO₂ → C₂H₄',
    exportLabel: 'CO2_to_C2H4',
    description: 'Co-SAC geometries: CO–CO adsorption, COCOH, CCO, CHCO, and the late CH₂CHO selectivity branch before C–O cleavage',
    templates: CO2RR_C2H4_PATH,
  },
  {
    id: 'co2rr-c2h5oh',
    family: 'CO2RR',
    reactionLabel: 'CO₂ → C₂H₅OH',
    exportLabel: 'CO2_to_C2H5OH',
    description: 'Co-SAC geometries sharing CO–CO through CH₂CHO, then continuing through O-bound CH₃CHO and CH₃CH₂O to ethanol',
    templates: CO2RR_ETHANOL_PATH,
  },
  {
    id: 'co2rr-cho-alternative',
    family: 'CO2RR',
    reactionLabel: 'CO₂ → CHO* (alternative)',
    exportLabel: 'CO2_to_CHO_alternative',
    description: 'The supplied competing C₁ hydrogenation precursor, kept separate because CHO is not a mandatory consecutive state in the selected C₂ route',
    templates: CO2RR_CHO_ALTERNATIVE,
  },
  {
    id: 'her-h-adsorption',
    family: 'HER',
    reactionLabel: 'H⁺ + e⁻ → H*',
    exportLabel: 'HER_H_adsorption',
    description: 'Single adsorbed-H starting geometry',
    templates: HER_INTERMEDIATES,
  },
  {
    id: 'oer-orr-oxygen-intermediates',
    family: 'OER/ORR',
    reactionLabel: 'O* ↔ OH* ↔ OOH*',
    exportLabel: 'OER_ORR_O_OH_OOH',
    description: 'Shared OER/ORR O, OH, and OOH adsorption intermediates',
    templates: OER_ORR_INTERMEDIATES,
  },
];

export function getIntermediatePathway(id) {
  return INTERMEDIATE_PATHWAYS.find(pathway => pathway.id === id) || INTERMEDIATE_PATHWAYS[0];
}
