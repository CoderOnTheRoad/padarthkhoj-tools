export const DOS_PALETTES = Object.freeze({
  scientific: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#222222'],
  vivid: ['#246BFD', '#F04438', '#12B76A', '#7A5AF8', '#F79009', '#06AED4', '#EE46BC', '#667085'],
  warmcool: ['#2166AC', '#B2182B', '#67A9CF', '#EF8A62', '#053061', '#67001F', '#4393C3', '#D6604D'],
  monochrome: ['#111111', '#343434', '#575757', '#767676', '#929292', '#ABABAB', '#C2C2C2', '#D7D7D7'],
});

export function parseDosCsv(text, filename = 'dos.csv') {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines.length < 2) throw new Error(`${filename} does not contain a header and numerical data`);
  const delimiter = lines[0].includes(',') ? ',' : lines[0].includes('\t') ? '\t' : null;
  const split = line => delimiter ? line.split(delimiter).map(value => value.trim()) : line.split(/\s+/);
  const headers = split(lines[0]);
  if (headers.length < 2) throw new Error(`${filename} needs an energy column and at least one DOS channel`);
  const normalized = headers.map(header => header.toLowerCase().replace(/[\s-]+/g, '_'));
  const energyIndex = normalized.findIndex(header => ['energy_ev', 'energy', 'e_ev', 'e'].includes(header));
  if (energyIndex < 0) throw new Error(`${filename} has no recognizable energy column`);
  if (new Set(headers).size !== headers.length) throw new Error(`${filename} contains duplicate column names`);
  const rows = lines.slice(1).map((line, rowIndex) => {
    const parts = split(line);
    if (parts.length !== headers.length) throw new Error(`${filename}, row ${rowIndex + 2}: expected ${headers.length} columns`);
    const values = parts.map(Number);
    if (values.some(value => !Number.isFinite(value))) throw new Error(`${filename}, row ${rowIndex + 2}: non-numeric value`);
    return values;
  });
  const energy = rows.map(row => row[energyIndex]);
  for (let index = 1; index < energy.length; index += 1) {
    if (energy[index] <= energy[index - 1]) throw new Error(`${filename} energy values must be strictly increasing`);
  }
  const channels = {};
  headers.forEach((header, index) => {
    if (index !== energyIndex) channels[header] = rows.map(row => row[index]);
  });
  const names = Object.keys(channels);
  const spinMode = names.some(name => /(?:^|_)up$/i.test(name)) && names.some(name => /(?:^|_)down$/i.test(name)) ? 'spin' : 'non-spin';
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    filename,
    name: filename.replace(/\.[^.]+$/, ''),
    energy,
    channels,
    spinMode,
    pointCount: energy.length,
  };
}

export function defaultDosStyle() {
  return {
    palette: 'scientific', lineWidth: 2, fontSize: 12, titleSize: 16,
    axisTitleSize: 13, tickLabelSize: 11, legendTextSize: 11,
    fontFamily: 'Arial', fontWeight: 'normal', fontStyle: 'normal',
    background: 'white', foreground: '#17202a', grid: true, minorGrid: false,
    mirrorSpinDown: true, showFermiLine: true, showZeroLine: true, showLegend: true,
    legendPosition: 'top-right', legendX: 72, legendY: 8,
    xLabel: 'E − E_F (eV)', yLabel: 'PDOS (states eV⁻¹)',
    xMin: '', xMax: '', yMin: '', yMax: '',
    xTickCount: 5, xMinorTickCount: 1, xShowMajorTicks: true, xShowMinorTicks: true,
    xTickDirection: 'out', xMajorTickLength: 6, xMinorTickLength: 3, xTickWidth: 1, xDecimals: 2,
    yTickCount: 5, yMinorTickCount: 1, yShowMajorTicks: true, yShowMinorTicks: true,
    yTickDirection: 'out', yMajorTickLength: 6, yMinorTickLength: 3, yTickWidth: 1, yDecimals: 2,
    widthIn: 6, heightIn: 4, dpi: 300,
  };
}

export function createDatasetView(dataset, paletteName = 'scientific') {
  const palette = DOS_PALETTES[paletteName] || DOS_PALETTES.scientific;
  return {
    ...dataset,
    selected: true,
    style: defaultDosStyle(),
    channelStyles: Object.fromEntries(Object.keys(dataset.channels).map((name, index) => [name, {
      visible: true, color: palette[index % palette.length], label: name, lineStyle: name.toLowerCase().endsWith('_down') ? 'dashed' : 'solid',
      fillEnabled: false, fillColor: null, fillOpacity: 0.3, fillRangeEnabled: false, fillXMin: '', fillXMax: '',
    }])),
  };
}

export function getDosFillPoints(energy, values, rangeEnabled = false, requestedMin = '', requestedMax = '') {
  if (!energy.length || energy.length !== values.length) return [];
  let min = rangeEnabled && requestedMin !== '' ? Number(requestedMin) : -Infinity;
  let max = rangeEnabled && requestedMax !== '' ? Number(requestedMax) : Infinity;
  if (Number.isNaN(min) || Number.isNaN(max) || min >= max) return [];
  min = Math.max(min, energy[0]); max = Math.min(max, energy.at(-1));
  if (min > max) return [];
  const interpolate = x => {
    if (x <= energy[0]) return values[0];
    if (x >= energy.at(-1)) return values.at(-1);
    let upper = 1; while (energy[upper] < x) upper += 1;
    const ratio = (x - energy[upper - 1]) / (energy[upper] - energy[upper - 1]);
    return values[upper - 1] + ratio * (values[upper] - values[upper - 1]);
  };
  const points = [{ x: min, y: interpolate(min) }];
  for (let index = 0; index < energy.length; index += 1) if (energy[index] > min && energy[index] < max) points.push({ x: energy[index], y: values[index] });
  if (max > min) points.push({ x: max, y: interpolate(max) });
  return points;
}

export function serializeDosTemplate(name, style, channelPolicy = {}) {
  return JSON.stringify({
    format: 'padarthkhoj-dos-template', version: 1, name: String(name || 'DOS template'),
    style: { ...defaultDosStyle(), ...style }, channelPolicy,
  }, null, 2);
}

export function parseDosTemplate(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Template is not valid JSON'); }
  if (value?.format !== 'padarthkhoj-dos-template' || value.version !== 1 || !value.style) throw new Error('Unsupported DOS template file');
  return { ...value, style: { ...defaultDosStyle(), ...value.style } };
}

export function applyDosTemplate(dataset, template) {
  const palette = DOS_PALETTES[template.style.palette] || DOS_PALETTES.scientific;
  dataset.style = { ...dataset.style, ...template.style };
  Object.keys(dataset.channelStyles).forEach((name, index) => {
    const semantic = name.toLowerCase().endsWith('_down') ? 'down' : name.toLowerCase().endsWith('_up') ? 'up' : 'other';
    const policy = template.channelPolicy?.byName?.[name] || template.channelPolicy?.byIndex?.[index] || template.channelPolicy?.[semantic];
    dataset.channelStyles[name] = {
      ...dataset.channelStyles[name],
      color: policy?.color || palette[index % palette.length],
      lineStyle: policy?.lineStyle || (semantic === 'down' ? 'dashed' : 'solid'),
      ...(policy ? {
        fillEnabled: Boolean(policy.fillEnabled), fillColor: policy.fillColor || null,
        fillOpacity: Number.isFinite(Number(policy.fillOpacity)) ? Number(policy.fillOpacity) : 0.3,
        fillRangeEnabled: Boolean(policy.fillRangeEnabled), fillXMin: policy.fillXMin ?? '', fillXMax: policy.fillXMax ?? '',
      } : {}),
    };
  });
  return dataset;
}
