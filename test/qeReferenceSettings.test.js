import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseCIF } from '../src/lib/cifParser.js';
import { generatePWWorkflow } from '../src/lib/qeGenerator.js';
const cif = parseCIF(await readFile(new URL('../benchmarks/fixtures/bader/qe-real-002/halfc1.cif', import.meta.url), 'utf8'));
test('reference solver settings survive PW workflow generation and regeneration', () => {
  const first = generatePWWorkflow('relax', cif, { calculation: 'relax', conv_thr: '7.34987D-7', mixing_beta: '0.4', scf_must_converge: '.false.' });
  const text = generatePWWorkflow('relax', cif, first.params).files[0].text;
  assert.match(text, /calculation\s*= 'relax'/);
  assert.match(text, /conv_thr\s*= 7.34987D-7/);
  assert.match(text, /mixing_beta\s*= 0.4/);
  assert.match(text, /scf_must_converge\s*= .false./);
  assert.match(text, /&IONS/);
  assert.doesNotMatch(text, /&CELL/);
});
test('existing PW defaults retain variable-cell relaxation and solver settings', () => {
  const text = generatePWWorkflow('relax', cif).files[0].text;
  assert.match(text, /calculation\s*= 'vc-relax'/);
  assert.match(text, /&CELL/);
  assert.match(text, /conv_thr\s*= 1.0D-7/);
  assert.match(text, /mixing_beta\s*= 0.5/);
  assert.doesNotMatch(text, /scf_must_converge/);
});
test('invalid electronic settings fail instead of producing a misleading input', () => {
  for (const params of [{conv_thr: 'NaN'}, {conv_thr: '0'}, {mixing_beta: '1.1'}, {mixing_beta: '-1'}, {scf_must_converge: 'false'}, {conv_thr: '1e-7, bogus=1'}]) {
    assert.throws(() => generatePWWorkflow('scf', cif, params), /Invalid/);
  }
});

test('editor setting changes regenerate the coordinated input and retain calculation mode', async () => {
  const { InputEditorPage } = await import('../src/pages/InputEditor.js');
  const controls = ['calculation', 'conv_thr', 'mixing_beta', 'scf_must_converge'].map(key => ({ dataset: {param: key}, value: '', addEventListener(event, handler) { this.change = handler; } }));
  const sidebar = {querySelectorAll: selector => selector.includes('input[data-param]') ? controls : [], querySelector: () => null};
  const container = {querySelector: selector => selector === '.editor-sidebar' ? sidebar : null};
  const page = new InputEditorPage(container, {});
  const workflow = generatePWWorkflow('relax', cif);
  page.files = workflow.files.map(f => ({name: f.filename, content: f.text, protocolId: f.protocolId, params: workflow.params, cifData: cif, workflowId: 'pw-relax'}));
  page._refreshLineNumbers = () => {};
  const html = page._renderSidebar();
  for (const control of controls) assert.ok(html.includes(`data-param="${control.dataset.param}"`));
  page._bindSidebarEvents();
  for (const [i,value] of ['relax','7.34987e-7','0.4','.false.'].entries()) { controls[i].value=value; controls[i].change(); }
  assert.match(page.files[0].content, /calculation\s*= 'relax'/);
  assert.match(page.files[0].content, /conv_thr\s*= 7.34987e-7/);
  assert.match(page.files[0].content, /mixing_beta\s*= 0.4/);
  assert.match(page.files[0].content, /scf_must_converge\s*= .false./);
  assert.doesNotMatch(page.files[0].content, /&CELL/);
});
