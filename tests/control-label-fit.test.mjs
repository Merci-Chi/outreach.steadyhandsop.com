import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../fit-control-labels.js', import.meta.url), 'utf8');
function fixture() {
  let buttonWidth = 170, labelWidth = 70;
  const label = {
    style: {}, innerHTML: 'Call Through<br>Outreach',
    get clientWidth() { return Math.min(labelWidth, parseFloat(this.style.maxWidth) || Infinity); },
    get scrollWidth() { return Math.max(this.clientWidth, Math.ceil((parseFloat(this.style.fontSize) || 20) * 14)); }
  };
  const icon = {getBoundingClientRect: () => ({width: 30})};
  const button = {children: [icon, label], get clientWidth() { return buttonWidth; }};
  label.parentElement = button;
  let frame, resize;
  const context = {
    document: {querySelectorAll: () => [label], getElementById: () => null},
    getComputedStyle: node => node === button
      ? {flexDirection:'row', paddingLeft:'10px', paddingRight:'10px', columnGap:'10px'}
      : node === label ? {fontSize: label.style.fontSize || '20px'} : {display:'block', position:'static'},
    requestAnimationFrame: fn => {frame = fn; return 1;}, cancelAnimationFrame() {},
    window: {addEventListener: (type, fn) => {if (type === 'resize') resize = fn;}}
  };
  vm.runInNewContext(source, context);
  return {label, run: () => frame(), widen() {buttonWidth = 400; labelWidth = 300; resize(); frame();}};
}

test('full label fits actual flex allocation even when smaller than the estimated space', () => {
  const f = fixture(); f.run();
  assert(f.label.scrollWidth <= f.label.clientWidth);
  assert(parseFloat(f.label.style.fontSize) < 9, 'no minimum-size cutoff may leave text truncated');
  assert.equal(f.label.innerHTML, 'Call Through<br>Outreach');
});

test('label restores its original size when the control widens', () => {
  const f = fixture(); f.run(); f.widen();
  assert.equal(f.label.style.fontSize, '');
  assert(f.label.scrollWidth <= f.label.clientWidth);
});
