// Headless füstpróba: node smoke-test.js
// Minimál DOM/canvas/audio stubokkal betölti a játékot, szimulál pár
// képkockát és billentyűleütést, és elszáll, ha runtime hiba van.
const fs = require('fs');
const path = require('path');

function gradientStub() { return { addColorStop() {} }; }
function ctx2dStub() {
  return new Proxy({
    createLinearGradient: gradientStub,
    createRadialGradient: gradientStub,
    createPattern: () => ({}),
    measureText: () => ({ width: 0 }),
  }, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {}; // minden más metódus no-op
    },
    set() { return true; }, // fillStyle stb.
  });
}

function elementStub() {
  const el = {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    querySelector: () => elementStub(),
    querySelectorAll: () => [],
    getContext: () => ctx2dStub(),
    textContent: '',
    disabled: false,
    width: 0,
    height: 0,
  };
  return el;
}

const elements = {};
const listeners = {};

global.document = {
  getElementById: (id) => (elements[id] = elements[id] || elementStub()),
  createElement: () => elementStub(),
  querySelectorAll: () => [],
};
global.window = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  AudioContext: undefined,
  webkitAudioContext: undefined,
};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
global.performance = { now: () => Date.now() };
const rafQueue = [];
global.requestAnimationFrame = (fn) => { rafQueue.push(fn); };
global.setTimeout = global.setTimeout; // natív marad

// betöltés
const dir = __dirname;
eval(fs.readFileSync(path.join(dir, 'levels.js'), 'utf8') + ';global.LEVELS=LEVELS;');
eval(fs.readFileSync(path.join(dir, 'game.js'), 'utf8'));

function fireKey(type, key) {
  for (const fn of listeners[type] || []) fn({ key, preventDefault() {} });
}
function pumpFrames(n, stepMs) {
  let t = Date.now();
  for (let i = 0; i < n; i++) {
    t += stepMs;
    const q = rafQueue.splice(0);
    for (const fn of q) fn(t);
  }
}

// pár frame készenléti állapotban
pumpFrames(5, 16);
// indítás + mozgás jobbra fél másodpercig
fireKey('keydown', 'ArrowRight');
pumpFrames(30, 16);
fireKey('keyup', 'ArrowRight');
// lefelé ásás
fireKey('keydown', 'ArrowDown');
pumpFrames(30, 16);
fireKey('keyup', 'ArrowDown');
// Space-evés
fireKey('keydown', ' ');
fireKey('keydown', 'ArrowLeft');
pumpFrames(10, 16);
fireKey('keyup', 'ArrowLeft');
fireKey('keyup', ' ');
// újraindítás és pályaváltási kísérlet (zárt pálya: nem történhet hiba)
fireKey('keydown', 'r');
pumpFrames(5, 16);
fireKey('keydown', '2');
pumpFrames(5, 16);
// némítás oda-vissza
fireKey('keydown', 'm');
fireKey('keydown', 'm');
pumpFrames(20, 16);

console.log('Füstpróba OK – nincs runtime hiba.');
