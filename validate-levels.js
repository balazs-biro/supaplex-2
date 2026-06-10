// Pálya-validátor: node validate-levels.js
// Ellenőrzi: sorhosszak, pontosan 1 M és 1 E, zárt perem, minden I/E elérhető.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'levels.js'), 'utf8');
const LEVELS = eval(src + ';LEVELS');
let fail = 0;

LEVELS.forEach((L, li) => {
  const m = L.map, W = m[0].length;
  m.forEach((r, i) => {
    if (r.length !== W) { console.log(`L${li + 1} sor ${i}: hossz ${r.length} != ${W}`); fail++; }
  });
  const all = m.join('');
  const cnt = (c) => all.split(c).length - 1;
  if (cnt('M') !== 1) { console.log(`L${li + 1}: M darab=${cnt('M')}`); fail++; }
  if (cnt('E') !== 1) { console.log(`L${li + 1}: E darab=${cnt('E')}`); fail++; }
  for (let x = 0; x < W; x++) {
    if (m[0][x] !== '#' || m[m.length - 1][x] !== '#') { console.log(`L${li + 1}: perem lyuk oszlop ${x}`); fail++; break; }
  }
  for (let y = 0; y < m.length; y++) {
    if (m[y][0] !== '#' || m[y][W - 1] !== '#') { console.log(`L${li + 1}: perem lyuk sor ${y}`); fail++; break; }
  }
  console.log(`L${li + 1} '${L.name}': ${W}x${m.length}, infotron=${cnt('I')}, zonk=${cnt('Z')}`);
});

// elérhetőség: flood fill a nem-tömör cellákon (# és H tömör)
LEVELS.forEach((L, li) => {
  const m = L.map.map((r) => r.split('')), H = m.length, W = m[0].length;
  let sx, sy;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y][x] === 'M') { sx = x; sy = y; }
  const seen = Array.from({ length: H }, () => Array(W).fill(false));
  const q = [[sx, sy]];
  seen[sy][sx] = true;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny][nx]) continue;
      const c = m[ny][nx];
      if (c === '#' || c === 'H') continue;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  let bad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = m[y][x];
    if ((c === 'I' || c === 'E') && !seen[y][x]) { console.log(`L${li + 1}: elérhetetlen ${c} @ (${x},${y})`); bad++; fail++; }
  }
  if (!bad) console.log(`L${li + 1}: minden infotron és az exit elérhető OK`);
});

process.exit(fail ? 1 : 0);
