// Adsorbate geometries extracted from the user-supplied Co single-atom-catalyst
// QE inputs. Coordinates are Cartesian offsets (Å) from the Co-bound atom.
const PROVIDED = [
  {id:'co2',label:'CO₂',bindingAtom:1,atoms:[{element:'C',x:.820355,y:.842916,z:.04605},{element:'O',x:0,y:0,z:0},{element:'O',x:1.640587,y:1.686043,z:.09225}]},
  {id:'cooh',label:'COOH',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'O',x:1.168369,y:.516092,z:.3723},{element:'O',x:-.9043,y:-.45272,z:.64275},{element:'H',x:1.238425,y:.495427,z:1.3692}]},
  {id:'co',label:'CO',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'O',x:-.044419,y:.027765,z:1.13895}]},
  {id:'co-co',label:'CO–CO',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'O',x:-.416051,y:-.452932,z:1.0218},{element:'C',x:-1.760508,y:.718079,z:-.3639},{element:'O',x:-2.471895,y:.678338,z:.5262}]},
  {id:'coh',label:'COH',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'O',x:-.049682,y:.069519,z:1.25505},{element:'H',x:.722644,y:.53591,z:1.7553}]},
  {id:'cocoh',label:'COCOH',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'C',x:1.497356,y:.224347,z:.64785},{element:'O',x:-1.085465,y:-.351091,z:.6423},{element:'O',x:1.810435,y:.667211,z:1.78335},{element:'H',x:-1.718536,y:-.785477,z:1.26135}]},
  {id:'cco',label:'CCO',bindingAtom:1,atoms:[{element:'C',x:-.058247,y:.118267,z:1.35645},{element:'C',x:0,y:0,z:0},{element:'O',x:-.103829,y:.213538,z:2.5377}]},
  {id:'chco',label:'CHCO',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'C',x:-1.17669,y:.169134,z:.42405},{element:'H',x:.82886,y:-.107564,z:.62805},{element:'O',x:-2.297948,y:.332334,z:.82455}]},
  {id:'chcho',label:'CHCHO',bindingAtom:4,atoms:[{element:'C',x:1.693451,y:-.006994,z:.80985},{element:'C',x:.44334,y:.337209,z:1.1679},{element:'H',x:2.268214,y:-.120174,z:1.68405},{element:'H',x:-.105848,y:.837829,z:1.97385},{element:'O',x:0,y:0,z:0}]},
  {id:'ch2cho',label:'CH₂CHO',bindingAtom:5,atoms:[{element:'C',x:1.332833,y:-.253913,z:1.91295},{element:'C',x:.093673,y:-.190435,z:1.2357},{element:'H',x:2.254876,y:-.133315,z:1.34415},{element:'H',x:1.385084,y:-.421564,z:2.9886},{element:'H',x:-.828309,y:-.318345,z:1.8459},{element:'O',x:0,y:0,z:0}]},
  {id:'ch3cho',label:'CH₃CHO',bindingAtom:6,atoms:[{element:'C',x:1.208201,y:.459609,z:2.04075},{element:'C',x:.171866,y:-.214173,z:1.188},{element:'H',x:1.723676,y:1.253458,z:1.4898},{element:'H',x:.742713,y:.859978,z:2.95455},{element:'H',x:1.939166,y:-.295243,z:2.3736},{element:'H',x:-.463407,y:-.969024,z:1.7202},{element:'O',x:0,y:0,z:0}]},
  {id:'ch3ch2o',label:'CH₃CH₂O',bindingAtom:7,atoms:[{element:'C',x:1.295143,y:.693917,z:1.935},{element:'C',x:.017376,y:.060193,z:1.3404},{element:'H',x:1.406804,y:1.721544,z:1.5669},{element:'H',x:1.230043,y:.704302,z:3.0312},{element:'H',x:2.174602,y:.114028,z:1.62795},{element:'H',x:-.881356,y:.624292,z:1.7112},{element:'H',x:-.120961,y:-.967647,z:1.7742},{element:'O',x:0,y:0,z:0}]},
  {id:'cho',label:'CHO (alternative)',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'O',x:.846175,y:.596421,z:.5829},{element:'H',x:-.900261,y:-.470524,z:.5118}]},
];

// No adsorbed Co-SAC QE inputs were supplied for these two terminal products,
// so their earlier relaxed molecule geometries remain as provisional endpoints.
const C2H4 = {id:'c2h4',label:'C₂H₄',bindingAtom:0,atoms:[{element:'C',x:0,y:0,z:0},{element:'C',x:1.331575,y:.000015,z:-.000001},{element:'H',x:-.572988,y:-.926406,z:.070509},{element:'H',x:-.572946,y:.926347,z:-.07053},{element:'H',x:1.904587,y:.926296,z:-.070526},{element:'H',x:1.904535,y:-.926404,z:.070509}]};
const ETHANOL = {id:'ch3ch2oh',label:'C₂H₅OH',bindingAtom:7,atoms:[{element:'C',x:-1.995906,y:.415651,z:-1.243115},{element:'C',x:-.480465,y:.443456,z:-1.283057},{element:'H',x:-2.369805,y:1.073813,z:-.446707},{element:'H',x:-2.411901,y:.756477,z:-2.201009},{element:'H',x:-2.359477,y:-.603063,z:-1.050028},{element:'H',x:-.122979,y:1.467626,z:-1.496718},{element:'H',x:-.105232,y:-.218336,z:-2.086265},{element:'O',x:0,y:0,z:0},{element:'H',x:.971423,y:.093557,z:.013847}]};

const byId = id => PROVIDED.find(item => item.id === id);
const SHARED = ['co2','cooh','co','co-co','coh','cocoh','cco','chco','chcho','ch2cho'].map(byId);
export const CO2RR_C2H4_PATH = [...SHARED, C2H4];
export const CO2RR_ETHANOL_PATH = [...SHARED, byId('ch3cho'), byId('ch3ch2o'), ETHANOL];
export const CO2RR_CHO_ALTERNATIVE = ['co2','cooh','co','cho'].map(byId);
export const CO2RR_C2_INTERMEDIATES = [...PROVIDED, C2H4, ETHANOL];
