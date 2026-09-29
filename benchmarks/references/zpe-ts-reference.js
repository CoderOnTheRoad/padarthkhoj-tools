// Independent benchmark oracle. Do not import the production implementation or its constants here.
const H_J_S = 6.62607015e-34;
const KB_J_K = 1.380649e-23;
const EV_J = 1.602176634e-19;
const NA_MOL = 6.02214076e23;

export function referenceZpeTs(frequenciesThz, temperatureK) {
  const temperature = Number(temperatureK);
  if (!Number.isFinite(temperature) || temperature <= 0) throw new Error('Temperature must be greater than 0 K.');
  const modes = [];
  const rejected = [];
  frequenciesThz.forEach((raw, offset) => {
    const frequency = Number(raw);
    if (!Number.isFinite(frequency)) {
      rejected.push({ index: offset + 1, value: raw, reason: 'Not a finite number' });
      return;
    }
    if (frequency <= 0) {
      rejected.push({ index: offset + 1, value: frequency, reason: frequency < 0 ? 'Imaginary/negative mode' : 'Zero mode' });
      return;
    }
    const quantumJ = H_J_S * frequency * 1e12;
    const x = quantumJ / (KB_J_K * temperature);
    const expNegativeX = x > 745 ? 0 : Math.exp(-x);
    const occupation = expNegativeX === 0 ? 0 : expNegativeX / (1 - expNegativeX);
    const entropyFactor = expNegativeX === 0 ? 0 : x * occupation - Math.log(1 - expNegativeX);
    modes.push({
      zpeEv: quantumJ / (2 * EV_J),
      thermalEv: quantumJ * occupation / EV_J,
      entropyJMolK: KB_J_K * NA_MOL * entropyFactor,
      tsEv: KB_J_K * temperature * entropyFactor / EV_J,
    });
  });
  const sum = key => modes.reduce((total, mode) => total + mode[key], 0);
  const zpeEv = sum('zpeEv');
  const thermalEv = sum('thermalEv');
  const entropyJMolK = sum('entropyJMolK');
  const tsEv = sum('tsEv');
  return { modes, rejected, totals: { zpeEv, thermalEv, entropyJMolK, tsEv, freeEnergyCorrectionEv: zpeEv + thermalEv - tsEv } };
}

export function referenceExcelZpeTs(frequenciesThz, constants) {
  const {planckJsWorking:h,electronVoltJ:eV,kTj,kTev}=constants;
  if (![h,eV,kTj,kTev].every(value=>Number.isFinite(value)&&value>0)) throw new Error('Excel-reference constants must be finite and positive.');
  let zpeEv=0,entropyFactor=0;
  frequenciesThz.forEach(frequencyThz=>{
    const quantumJ=h*frequencyThz*1e12;
    const x=quantumJ/kTj;
    const occupation=1/Math.expm1(x);
    entropyFactor+=x*occupation-Math.log1p(-Math.exp(-x));
    zpeEv+=quantumJ/(2*eV);
  });
  return {zpeEv,tsEv:kTev*entropyFactor,entropyFactor};
}
