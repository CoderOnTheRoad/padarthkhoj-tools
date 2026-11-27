import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {describeZpeTsScope,zpeTsToCsv,buildZpeTsWorkbook} from '../src/lib/zpeTs.js';
import {ZpeTsCalculatorPage} from '../src/pages/ZpeTsCalculator.js';

const pageWithInput=input=>{
  const elements=new Map();
  const container={querySelector(selector){if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);}};
  container.querySelector('#zts-frequencies').value=input;
  container.querySelector('#zts-temperature').value='298.15';
  return {page:new ZpeTsCalculatorPage(container),elements};
};

test('positive input is not certified as complete or as a minimum',()=>{
  const {page,elements}=pageWithInput('15 30 60');page._calculate();
  assert.equal(page.result.rejected.length,0);
  assert.ok(Math.abs(page.result.totals.freeEnergyCorrectionEv-.21450822979406525)<1e-12);
  assert.match(elements.get('#zts-scope').innerHTML,/not a complete thermochemical correction/);
  assert.match(elements.get('#zts-scope').innerHTML,/not established/);
});

test('one imaginary mode remains excluded and the limitation travels into both exports',async()=>{
  const {page,elements}=pageWithInput('-10 30 60');page._calculate();
  assert.equal(page.result.modes.length,2);
  assert.equal(describeZpeTsScope(page.result).imaginary,1);
  assert.match(elements.get('#zts-scope').innerHTML,/reaction-coordinate/);
  assert.match(elements.get('#zts-status').className,/warning/);
  const csv=zpeTsToCsv(page.result);assert.match(csv,/"Imaginary modes excluded","1"/);assert.match(csv,/not a complete thermochemical correction/);
  const zip=await JSZip.loadAsync(await (await buildZpeTsWorkbook(page.result)).arrayBuffer());
  const summary=await zip.file('xl/worksheets/sheet1.xml').async('string');assert.match(summary,/not a complete thermochemical correction/);assert.match(summary,/Imaginary\/negative mode/);
});

test('zero, multiple imaginary and invalid inputs retain original positions and safe warning text',()=>{
  const {page,elements}=pageWithInput('bad 0 -10 -20 30 <img>');page._calculate();
  assert.deepEqual(page.result.rejected.map(item=>item.index),[1,2,3,4,6]);
  assert.equal(page.result.modes[0].index,5);
  const scope=describeZpeTsScope(page.result);assert.equal(scope.imaginary,2);assert.equal(scope.zero,1);assert.equal(scope.invalid,2);
  assert.match(elements.get('#zts-rejected').innerHTML,/&lt;img&gt;/);assert.doesNotMatch(elements.get('#zts-rejected').innerHTML,/<img>/);
});

test('failed recalculation removes stale results and disables downloads',()=>{
  const {page,elements}=pageWithInput('15 30 60');page._calculate();
  assert.equal(elements.get('#zts-csv').disabled,false);
  elements.get('#zts-frequencies').value='0 -10';page._calculate();
  assert.equal(page.result,null);assert.equal(elements.get('#zts-results').hidden,true);
  assert.equal(elements.get('#zts-csv').disabled,true);assert.equal(elements.get('#zts-xlsx').disabled,true);
  assert.equal(elements.get('#zts-kpis').innerHTML,'');
  assert.match(elements.get('#zts-status').textContent,/No positive/);
});

test('invalid temperature also clears an earlier successful calculation',()=>{
  const {page,elements}=pageWithInput('15 30 60');page._calculate();
  elements.get('#zts-temperature').value='0';page._calculate();
  assert.equal(page.result,null);assert.equal(elements.get('#zts-csv').disabled,true);
  assert.match(elements.get('#zts-status').textContent,/greater than 0/);
});
