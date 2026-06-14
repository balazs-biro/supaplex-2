/*
 * Supaplex 2.0 – feltuningolt játékmotor
 * ---------------------------------------------------------
 * Újdonságok az 1.0-hoz képest:
 *   - több pálya, pályaválasztó, mentett feloldás (localStorage)
 *   - gördülő kamera: a pálya nagyobb lehet a képernyőnél
 *   - részecske-effektek (ásás, gyűjtés, koppanás, robbanás, győzelem)
 *   - 3×3-as robbanás halálkor, mint az eredeti Supaplexben
 *   - képernyőrázás, animált infotron / exit / Murphy
 *   - Space + irány: "kinyúlás" – evés helyben maradva
 *   - mobil érintő D-pad
 * Tiszta JavaScript, build nélkül fut (file:// vagy statikus szerver).
 */
(() => {
  'use strict';

  // ---- Csempe konstansok ----------------------------------------------
  const T = {
    EMPTY: 0,
    BASE: 1,
    MURPHY: 2,
    INFOTRON: 3,
    ZONK: 4,
    WALL: 5,
    HARDWARE: 6,
    EXIT: 7,
  };

  const CHAR_TO_TILE = {
    '.': T.EMPTY,
    '=': T.BASE,
    'M': T.MURPHY,
    'I': T.INFOTRON,
    'Z': T.ZONK,
    '#': T.WALL,
    'H': T.HARDWARE,
    'E': T.EXIT,
  };

  const BIRTHDAY_LEVEL = 4; // 5. pálya – mindig feloldott

  const TILE = 36;        // logikai csempeméret pixelben
  const STEP_MS = 90;     // egy világ-tick hossza (gravitáció + mozgás)
  const VIEW_COLS = 20;   // látható oszlopok
  const VIEW_ROWS = 14;   // látható sorok

  // ---- Canvas ----------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_COLS * TILE;
  canvas.height = VIEW_ROWS * TILE;

  // ---- HUD elemek ------------------------------------------------------
  const infotronCountEl = document.getElementById('infotronCount');
  const progressFillEl = document.getElementById('progressFill');
  const timeEl = document.getElementById('timeDisplay');
  const levelNameEl = document.getElementById('levelName');
  const levelNumEl = document.getElementById('levelNum');
  const overlayEl = document.getElementById('overlay');
  const overlayBox = overlayEl.querySelector('.overlay-box');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const overlayHint = document.getElementById('overlayHint');
  const muteBtn = document.getElementById('muteBtn');
  const prevBtn = document.getElementById('prevLevel');
  const nextBtn = document.getElementById('nextLevel');
  const restartBtn = document.getElementById('restartBtn');

  // ---- Mentés ----------------------------------------------------------
  const SAVE_KEY = 'supaplex2.unlocked';
  function getUnlocked() {
    const v = parseInt(localStorage.getItem(SAVE_KEY) || '0', 10);
    return isNaN(v) ? 0 : Math.min(v, LEVELS.length - 1);
  }
  function setUnlocked(i) {
    if (i > getUnlocked()) localStorage.setItem(SAVE_KEY, String(i));
  }

  // ---- Játékállapot ----------------------------------------------------
  let levelIndex = getUnlocked();
  let ROWS, COLS;
  let grid;            // 2D tömb csempekódokkal
  let anim;            // 2D tömb: animáció leírók {fx,fy,t}
  let murphy;          // {x, y}
  let murphyFace = 1;  // nézési irány: -1 balra, 1 jobbra
  let collected;       // begyűjtött infotronok
  let totalInfotrons;  // összes begyűjtendő
  let fallingSet;      // mid-fall objektumok pozíciói ("x,y")
  let status;          // 'ready' | 'playing' | 'dying' | 'dead' | 'won'
  let heldDir = null;  // aktuálisan lenyomott irány {dx,dy}
  let snatchHeld = false; // Space: evés helyben maradva
  let collectFlash = 0;
  let elapsed = 0;     // játékidő ms-ben
  let dyingTimer = 0;  // robbanás-animáció hossza
  let winTimer = 0;    // győzelmi konfetti ideje az overlay előtt

  // kamera és effektek
  const cam = { x: 0, y: 0 };
  let shake = 0;       // képernyőrázás erőssége (px)
  let particles = [];  // {x,y,vx,vy,life,maxLife,size,color,grav}
  let explosions = []; // {x,y,t} – cellákra rajzolt robbanásvirág

  function key(x, y) { return x + ',' + y; }

  // ---- Pálya betöltése -------------------------------------------------
  function loadLevel(i) {
    levelIndex = i;
    const map = LEVELS[i].map;
    ROWS = map.length;
    COLS = map[0].length;

    // sanity check – minden sor azonos hosszú legyen
    map.forEach((row, r) => {
      if (row.length !== COLS) {
        console.error(`Pálya ${i + 1}, hibás sorhossz (${r}. sor): ${row.length} != ${COLS}`);
      }
    });

    grid = [];
    anim = [];
    totalInfotrons = 0;
    collected = 0;
    fallingSet = new Set();
    particles = [];
    explosions = [];
    shake = 0;
    elapsed = 0;
    for (let y = 0; y < ROWS; y++) {
      grid[y] = [];
      anim[y] = [];
      for (let x = 0; x < COLS; x++) {
        const ch = map[y][x];
        let t = CHAR_TO_TILE[ch] != null ? CHAR_TO_TILE[ch] : T.EMPTY;
        if (t === T.MURPHY) murphy = { x, y };
        if (t === T.INFOTRON) totalInfotrons++;
        grid[y][x] = t;
        anim[y][x] = null;
      }
    }
    murphyFace = 1;
    collectFlash = 0;
    heldDir = null;
    status = 'ready';
    snapCamera();
    updateHud();
    showOverlay(
      `PÁLYA ${i + 1}: ${LEVELS[i].name}`,
      'Nyomj egy gombot a kezdéshez',
      ''
    );
  }

  function updateHud() {
    const remaining = Math.max(0, totalInfotrons - collected);
    infotronCountEl.textContent = remaining;
    const pct = totalInfotrons ? (collected / totalInfotrons) * 100 : 100;
    progressFillEl.style.width = pct + '%';
    levelNameEl.textContent = LEVELS[levelIndex].name;
    levelNumEl.textContent = `${levelIndex + 1}/${LEVELS.length}`;
    prevBtn.disabled = levelIndex === 0;
    const nextIdx = levelIndex + 1;
    nextBtn.disabled = nextIdx >= LEVELS.length ||
      (nextIdx > getUnlocked() && nextIdx !== BIRTHDAY_LEVEL);
  }

  function updateTimeHud() {
    const s = Math.floor(elapsed / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    timeEl.textContent = `${mm}:${ss}`;
  }

  // ---- Overlay ---------------------------------------------------------
  function showOverlay(title, text, cls, hint) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayHint.textContent = hint || 'Nyilak/WASD: mozgás · Space+irány: evés · R: újra · M: némítás';
    overlayBox.classList.remove('win', 'dead');
    if (cls) overlayBox.classList.add(cls);
    overlayEl.classList.remove('hidden');
  }
  function hideOverlay() {
    overlayEl.classList.add('hidden');
  }

  // ---- Animáció segéd --------------------------------------------------
  function setAnim(toX, toY, fromX, fromY) {
    anim[toY][toX] = { fx: fromX, fy: fromY, t: 0 };
  }

  // ---- Mozgás-segédek --------------------------------------------------
  function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }
  function tileAt(x, y) { return inBounds(x, y) ? grid[y][x] : T.WALL; }

  // gömbölyű elem: amiről egy zonk/infotron legurulhat
  function isRoundSupport(t) {
    return t === T.ZONK || t === T.INFOTRON || t === T.WALL || t === T.HARDWARE;
  }

  // ---- Részecskék ------------------------------------------------------
  function spawnParticles(px, py, count, colors, speed, grav) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random() * 0.7) * speed;
      particles.push({
        x: px, y: py,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.3,
        life: 0,
        maxLife: 350 + Math.random() * 400,
        size: 2 + Math.random() * 3,
        color: colors[(Math.random() * colors.length) | 0],
        grav: grav != null ? grav : 0.0012,
      });
    }
  }
  const center = (x) => (x + 0.5) * TILE;

  function fxDig(x, y) {
    spawnParticles(center(x), center(y), 8, ['#8a4d27', '#6e3b1c', '#a3622f'], 0.12, 0.0015);
  }
  function fxCollect(x, y) {
    spawnParticles(center(x), center(y), 14, ['#ffd98a', '#ff9d2e', '#fff3d0'], 0.18, 0.0006);
  }
  function fxThud(x, y) {
    spawnParticles(center(x), (y + 1) * TILE, 6, ['#aab4c0', '#6b7686'], 0.08, 0.001);
  }
  function fxWin(x, y) {
    spawnParticles(center(x), center(y), 40, ['#45e08a', '#9dffce', '#ffd98a', '#29c2ff'], 0.22, 0.0005);
  }

  // ---- Játékos mozgás --------------------------------------------------
  function tryMove(dx, dy) {
    if (status !== 'playing') return;
    const nx = murphy.x + dx;
    const ny = murphy.y + dy;
    if (dx !== 0) murphyFace = dx > 0 ? 1 : -1;
    const target = tileAt(nx, ny);

    if (target === T.WALL || target === T.HARDWARE) {
      return; // tömör fal – nem megy
    }

    if (target === T.ZONK) {
      // zonkot csak vízszintesen lehet tolni, ha mögötte üres (kinyúlva nem)
      if (dy === 0 && !snatchHeld) {
        const bx = nx + dx;
        if (tileAt(bx, ny) === T.EMPTY) {
          grid[ny][bx] = T.ZONK;
          setAnim(bx, ny, nx, ny);
          grid[ny][nx] = T.EMPTY;
          moveMurphyTo(nx, ny);
          sfxPush();
        }
      }
      return;
    }

    if (target === T.EXIT) {
      if (collected >= totalInfotrons && !snatchHeld) {
        moveMurphyTo(nx, ny);
        win();
      }
      return; // zárt kijárat – nem lép be
    }

    if (target === T.INFOTRON) {
      collected++;
      collectFlash = 1;
      updateHud();
      sfxCollect();
      fxCollect(nx, ny);
      if (snatchHeld) {
        grid[ny][nx] = T.EMPTY; // kinyúlás: helyben maradva eszi meg
      } else {
        moveMurphyTo(nx, ny);
      }
      return;
    }

    if (target === T.BASE || target === T.EMPTY) {
      if (target === T.BASE) {
        sfxStep();
        fxDig(nx, ny);
      } else {
        sfxStep(0.5);
      }
      if (snatchHeld) {
        if (target === T.BASE) grid[ny][nx] = T.EMPTY; // helyben evés
      } else {
        moveMurphyTo(nx, ny);
      }
    }
  }

  function moveMurphyTo(nx, ny) {
    grid[murphy.y][murphy.x] = T.EMPTY;
    setAnim(nx, ny, murphy.x, murphy.y);
    murphy = { x: nx, y: ny };
    grid[ny][nx] = T.MURPHY;
  }

  // ---- Gravitáció (egy lépés) ------------------------------------------
  function gravityStep() {
    const newFalling = new Set();
    // alulról felfelé, hogy egy objektumot tickenként egyszer mozgassunk
    for (let y = ROWS - 1; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const t = grid[y][x];
        if (t !== T.ZONK && t !== T.INFOTRON) continue;
        const wasFalling = fallingSet.has(key(x, y));
        const below = tileAt(x, y + 1);

        if (below === T.EMPTY) {
          // leesik
          grid[y + 1][x] = t;
          setAnim(x, y + 1, x, y);
          grid[y][x] = T.EMPTY;
          newFalling.add(key(x, y + 1));
          continue;
        }

        if (below === T.MURPHY && wasFalling) {
          // agyonütés – robbanás Murphy körül
          die();
          return;
        }

        if (isRoundSupport(below)) {
          // legurulás balra vagy jobbra
          const leftFree = tileAt(x - 1, y) === T.EMPTY && tileAt(x - 1, y + 1) === T.EMPTY;
          const rightFree = tileAt(x + 1, y) === T.EMPTY && tileAt(x + 1, y + 1) === T.EMPTY;
          if (leftFree) {
            grid[y][x - 1] = t;
            setAnim(x - 1, y, x, y);
            grid[y][x] = T.EMPTY;
            newFalling.add(key(x - 1, y));
            continue;
          } else if (rightFree) {
            grid[y][x + 1] = t;
            setAnim(x + 1, y, x, y);
            grid[y][x] = T.EMPTY;
            newFalling.add(key(x + 1, y));
            continue;
          }
        }

        // megállt – ha eddig esett, koppanjon
        if (wasFalling) {
          sfxThud();
          fxThud(x, y);
          shake = Math.max(shake, 4);
        }
      }
    }
    fallingSet = newFalling;
  }

  // ---- Világ-tick (lockstep) -------------------------------------------
  function worldTick() {
    if (status !== 'playing') return;
    if (heldDir) tryMove(heldDir.dx, heldDir.dy);
    if (status !== 'playing') return; // a mozgás győzelmet okozhatott
    gravityStep();
  }

  // ---- Állapotváltások -------------------------------------------------
  function die() {
    status = 'dying';
    dyingTimer = 800;
    shake = 14;
    sfxExplosion();
    // 3×3-as robbanás Murphy körül – csak a kemény elemek élik túl
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = murphy.x + dx, y = murphy.y + dy;
        if (!inBounds(x, y)) continue;
        const t = grid[y][x];
        if (t === T.WALL || t === T.HARDWARE || t === T.EXIT) continue;
        if (t === T.INFOTRON) {
          // a felrobbant infotron elveszik – frissítjük a célszámot
          totalInfotrons--;
        }
        grid[y][x] = T.EMPTY;
        anim[y][x] = null;
        explosions.push({ x, y, t: 0 });
        spawnParticles(center(x), center(y), 12,
          ['#ff5a3c', '#ffd98a', '#ff9d2e', '#fff'], 0.25, 0.001);
      }
    }
    updateHud();
  }

  function win() {
    status = 'won';
    winTimer = 900;
    setUnlocked(levelIndex + 1);
    sfxWin();
    fxWin(murphy.x, murphy.y);
  }

  function showWinOverlay() {
    if (levelIndex === BIRTHDAY_LEVEL) {
      document.getElementById('giftPage').classList.remove('hidden');
      return;
    }
    const hasNext = levelIndex < LEVELS.length - 1;
    showOverlay(
      'GYŐZELEM!',
      hasNext
        ? 'Minden infotron megvan, kijutottál!'
        : 'Minden pályát teljesítettél. Gratulálunk!',
      'win',
      hasNext ? 'N: következő pálya · R: újra' : 'R: újra · 1–' + LEVELS.length + ': pályaválasztás'
    );
    updateHud();
  }

  // ---- Kamera ----------------------------------------------------------
  function cameraTarget() {
    const viewW = VIEW_COLS * TILE, viewH = VIEW_ROWS * TILE;
    const levelW = COLS * TILE, levelH = ROWS * TILE;
    let tx = (murphy.x + 0.5) * TILE - viewW / 2;
    let ty = (murphy.y + 0.5) * TILE - viewH / 2;
    tx = Math.max(0, Math.min(levelW - viewW, tx));
    ty = Math.max(0, Math.min(levelH - viewH, ty));
    // ha a pálya kisebb a képernyőnél, középre igazítunk
    if (levelW <= viewW) tx = (levelW - viewW) / 2;
    if (levelH <= viewH) ty = (levelH - viewH) / 2;
    return { tx, ty };
  }
  function snapCamera() {
    const { tx, ty } = cameraTarget();
    cam.x = tx;
    cam.y = ty;
  }
  function updateCamera(dt) {
    const { tx, ty } = cameraTarget();
    const k = 1 - Math.pow(0.0025, dt / 1000); // sima követés
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  // =====================================================================
  //  RAJZOLÁS
  // =====================================================================
  const ease = (p) => p * p * (3 - 2 * p); // smoothstep
  let worldTime = 0; // animációkhoz (pulzálás, pislogás)

  function cellPixel(x, y) {
    const a = anim[y][x];
    if (a && a.t < 1) {
      const p = ease(a.t);
      return {
        px: (a.fx + (x - a.fx) * p) * TILE,
        py: (a.fy + (y - a.fy) * p) * TILE,
      };
    }
    return { px: x * TILE, py: y * TILE };
  }

  // háttér: áramköri panel minta, egyszer előre legenerálva
  const bgPattern = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 144;
    const g = c.getContext('2d');
    g.fillStyle = '#04060c';
    g.fillRect(0, 0, 144, 144);
    g.strokeStyle = 'rgba(40,70,120,0.12)';
    g.lineWidth = 1;
    // vezetősávok
    for (let i = 0; i < 5; i++) {
      const x = 12 + i * 30, y = 20 + ((i * 53) % 100);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, y);
      g.lineTo(Math.min(140, x + 40), y);
      g.stroke();
      g.fillStyle = 'rgba(60,110,180,0.18)';
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    }
    // finom rács
    g.strokeStyle = 'rgba(40,70,120,0.06)';
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * TILE + 0.5, 0); g.lineTo(i * TILE + 0.5, 144); g.stroke();
      g.beginPath(); g.moveTo(0, i * TILE + 0.5); g.lineTo(144, i * TILE + 0.5); g.stroke();
    }
    return ctx.createPattern(c, 'repeat');
  })();

  function draw() {
    // képernyőrázás
    const sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;

    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-Math.round(cam.x) + sx, -Math.round(cam.y) + sy);

    // háttérminta a pálya területén
    ctx.fillStyle = bgPattern;
    ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);

    // csak a látható cellákat rajzoljuk
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const x1 = Math.min(COLS - 1, Math.ceil((cam.x + canvas.width) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const y1 = Math.min(ROWS - 1, Math.ceil((cam.y + canvas.height) / TILE) + 1);

    // statikus csempék (fal, base, hardver, exit)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = grid[y][x];
        const px = x * TILE, py = y * TILE;
        if (t === T.WALL) drawWall(px, py, x, y);
        else if (t === T.HARDWARE) drawHardware(px, py);
        else if (t === T.BASE) drawBase(px, py, x, y);
        else if (t === T.EXIT) drawExit(px, py, collected >= totalInfotrons);
      }
    }

    // mozgó / gömbölyű csempék (zonk, infotron) – animált pozícióval
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = grid[y][x];
        if (t !== T.ZONK && t !== T.INFOTRON) continue;
        const { px, py } = cellPixel(x, y);
        if (t === T.ZONK) drawZonk(px, py);
        else drawInfotron(px, py, x, y);
      }
    }

    // Murphy (robbanás közben már nem látszik)
    if (status !== 'dying' && status !== 'dead') {
      const { px, py } = cellPixel(murphy.x, murphy.y);
      drawMurphy(px, py, murphyFace, collectFlash > 0);
    }

    // robbanásvirágok
    for (const e of explosions) drawExplosion(e);

    // részecskék
    for (const p of particles) {
      const a = 1 - p.life / p.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // vignetta a képernyő szélein
    const vg = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.45,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.85
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ---- Rajz segédek ----------------------------------------------------
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // determinisztikus pszeudo-zaj a textúrákhoz
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  function drawBase(x, y, gx, gy) {
    // földes, szemcsés, ferdén megvilágított csempe
    ctx.fillStyle = '#6e3b1c';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#8a4d27';
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    // világos felső-bal él
    ctx.fillStyle = 'rgba(255,200,150,0.30)';
    ctx.fillRect(x + 1, y + 1, TILE - 2, 2);
    ctx.fillRect(x + 1, y + 1, 2, TILE - 2);
    // sötét alsó-jobb él
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x + 1, y + TILE - 3, TILE - 2, 2);
    ctx.fillRect(x + TILE - 3, y + 1, 2, TILE - 2);
    // determinisztikus rögök és szemcsék
    for (let i = 0; i < 7; i++) {
      const n1 = hash2(gx * 7 + i, gy * 13 + i);
      const n2 = hash2(gx * 11 + i * 3, gy * 5 + i * 7);
      const px = x + 4 + n1 * (TILE - 10);
      const py = y + 4 + n2 * (TILE - 10);
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,190,130,0.14)';
      const s = 2 + ((i * 2) % 3);
      ctx.fillRect(px, py, s, s);
    }
  }

  function drawWall(x, y, gx, gy) {
    // kék-szürke "chip" fal áramköri mintával
    ctx.fillStyle = '#2b3f63';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#3a557f';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = 'rgba(150,200,255,0.25)';
    ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
    ctx.fillRect(x + 2, y + 2, 2, TILE - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 2, y + TILE - 4, TILE - 4, 2);
    ctx.fillRect(x + TILE - 4, y + 2, 2, TILE - 4);
    // belső chip-mag
    ctx.fillStyle = '#243a5e';
    rrect(x + 9, y + 9, TILE - 18, TILE - 18, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,240,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // lábak a chip oldalain (determinisztikus váltakozás)
    ctx.fillStyle = 'rgba(150,200,255,0.30)';
    const n = hash2(gx, gy);
    for (let i = 0; i < 3; i++) {
      const o = 12 + i * 6;
      if (n > 0.3) {
        ctx.fillRect(x + o, y + 5, 2, 4);
        ctx.fillRect(x + o, y + TILE - 9, 2, 4);
      } else {
        ctx.fillRect(x + 5, y + o, 4, 2);
        ctx.fillRect(x + TILE - 9, y + o, 4, 2);
      }
    }
  }

  function drawHardware(x, y) {
    // sötét tech csempe színes lámpával
    ctx.fillStyle = '#1a2236';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#27324d';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = 'rgba(120,160,220,0.18)';
    ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
    // sarok-csavarok
    ctx.fillStyle = '#0c1120';
    const s = 4;
    ctx.fillRect(x + 5, y + 5, s, s);
    ctx.fillRect(x + TILE - 9, y + 5, s, s);
    ctx.fillRect(x + 5, y + TILE - 9, s, s);
    ctx.fillRect(x + TILE - 9, y + TILE - 9, s, s);
    // középső lámpa – lassan lüktet
    const pulse = 0.7 + 0.3 * Math.sin(worldTime / 500 + (x + y));
    ctx.fillStyle = `rgba(255,90,60,${pulse})`;
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,180,140,${pulse * 0.9})`;
    ctx.beginPath();
    ctx.arc(x + TILE / 2 - 1, y + TILE / 2 - 1, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawZonk(x, y) {
    // szürke fém kő/csavar, ferde megvilágítással
    const cx = x + TILE / 2, cy = y + TILE / 2;
    const grad = ctx.createLinearGradient(x + 4, y + 4, x + TILE - 4, y + TILE - 4);
    grad.addColorStop(0, '#c9d2dc');
    grad.addColorStop(0.5, '#8a95a3');
    grad.addColorStop(1, '#4d5663');
    rrect(x + 3, y + 3, TILE - 6, TILE - 6, 8);
    ctx.fillStyle = grad;
    ctx.fill();
    // sötét keret
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2b323d';
    ctx.stroke();
    // fénypont
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // ferde barázda (csavar jelleg)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + 9, y + TILE - 10);
    ctx.lineTo(x + TILE - 10, y + 9);
    ctx.stroke();
  }

  function drawInfotron(x, y, gx, gy) {
    // narancs-fémes ragyogó gömb – lüktet és csillan
    const pulse = 1 + 0.05 * Math.sin(worldTime / 280 + (gx * 3 + gy * 5));
    const cx = x + TILE / 2, cy = y + TILE / 2;
    const r = (TILE / 2 - 5) * pulse;
    // halvány glow a gömb mögött
    const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.8);
    glow.addColorStop(0, 'rgba(255,157,46,0.25)');
    glow.addColorStop(1, 'rgba(255,157,46,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    // gömb
    const grad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, r + 3);
    grad.addColorStop(0, '#ffd98a');
    grad.addColorStop(0.4, '#ff9d2e');
    grad.addColorStop(1, '#a3460a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // külső gyűrű
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#5e2a06';
    ctx.stroke();
    // belső gyűrű (csavar-mag)
    ctx.strokeStyle = 'rgba(255,240,200,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
    ctx.stroke();
    // körbejáró csillanás
    const sa = worldTime / 700 + gx + gy;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(sa) * (r - 6), cy + Math.sin(sa) * (r - 6), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawExit(x, y, active) {
    // kijárat – aktív: lüktető zöld portál, zárt: szürke
    ctx.fillStyle = active ? '#0c3a22' : '#222a38';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = active ? '#15663a' : '#2c3850';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    // ajtókeret
    ctx.lineWidth = 2;
    ctx.strokeStyle = active ? '#45e08a' : '#566480';
    rrect(x + 7, y + 5, TILE - 14, TILE - 9, 3);
    ctx.stroke();
    // nyíl / szimbólum
    ctx.fillStyle = active ? '#9dffce' : '#7787a5';
    ctx.beginPath();
    const mx = x + TILE / 2;
    ctx.moveTo(mx, y + 10);
    ctx.lineTo(x + TILE - 12, y + TILE / 2 + 1);
    ctx.lineTo(mx + 3, y + TILE / 2 + 1);
    ctx.lineTo(mx + 3, y + TILE - 10);
    ctx.lineTo(mx - 3, y + TILE - 10);
    ctx.lineTo(mx - 3, y + TILE / 2 + 1);
    ctx.lineTo(x + 12, y + TILE / 2 + 1);
    ctx.closePath();
    ctx.fill();
    if (active) {
      // lüktető glow, hogy messziről is látszódjon
      const pulse = 0.12 + 0.10 * Math.sin(worldTime / 300);
      ctx.fillStyle = `rgba(69,224,138,${pulse})`;
      ctx.fillRect(x - 4, y - 4, TILE + 8, TILE + 8);
    }
  }

  function drawMurphy(x, y, face, flash) {
    const cx = x + TILE / 2, cy = y + TILE / 2, r = TILE / 2 - 4;
    // fej alap
    const grad = ctx.createRadialGradient(cx - 4, cy - 5, 3, cx, cy, r + 2);
    grad.addColorStop(0, flash ? '#ffffff' : '#ffe3c0');
    grad.addColorStop(0.6, flash ? '#bfe9ff' : '#f4b683');
    grad.addColorStop(1, '#b5743f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // körvonal
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#5b3415';
    ctx.stroke();
    // arc terület (világos)
    ctx.fillStyle = flash ? '#eafaff' : '#ffe9d2';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, r - 4, 0, Math.PI * 2);
    ctx.fill();
    // pislogás: ~3,5 másodpercenként rövid hunyorítás
    const blink = (worldTime % 3500) < 130;
    const off = face * 2;
    ctx.fillStyle = '#16263f';
    if (blink) {
      ctx.fillRect(cx - 7 + off, cy - 3, 5.5, 1.8);
      ctx.fillRect(cx + 1.5 + off, cy - 3, 5.5, 1.8);
    } else {
      ctx.beginPath();
      ctx.arc(cx - 4.5 + off, cy - 2, 2.7, 0, Math.PI * 2);
      ctx.arc(cx + 4.5 + off, cy - 2, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // mosoly
    ctx.strokeStyle = '#7a3d18';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx + off * 0.5, cy + 4, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  function drawExplosion(e) {
    // táguló, halványuló robbanásvirág egy cellán
    const p = Math.min(1, e.t / 600);
    const cx = (e.x + 0.5) * TILE, cy = (e.y + 0.5) * TILE;
    const r = (TILE * 0.2) + p * TILE * 0.55;
    const a = 1 - p;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    grad.addColorStop(0, `rgba(255,240,200,${a})`);
    grad.addColorStop(0.5, `rgba(255,140,50,${a * 0.8})`);
    grad.addColorStop(1, `rgba(200,40,20,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // =====================================================================
  //  HANG (WebAudio – generált effektek)
  // =====================================================================
  let audioCtx = null;
  let muted = localStorage.getItem('supaplex2.muted') === '1';

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Nincs WebAudio támogatás', e);
    }
  }

  function tone(freq, dur, type, gainVal, slideTo) {
    if (!audioCtx || muted) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gainVal || 0.15, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noiseBurst(dur, gainVal, freq) {
    if (!audioCtx || muted) return;
    const now = audioCtx.currentTime;
    const len = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.value = gainVal || 0.2;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = freq || 900;
    src.connect(filt).connect(g).connect(audioCtx.destination);
    src.start(now);
  }

  function sfxStep(vol) {
    tone(180, 0.05, 'square', 0.06 * (vol || 1));
  }
  function sfxCollect() {
    tone(660, 0.07, 'square', 0.12);
    setTimeout(() => tone(990, 0.10, 'square', 0.12), 55);
  }
  function sfxPush() {
    tone(120, 0.10, 'sawtooth', 0.10, 80);
  }
  function sfxThud() {
    noiseBurst(0.12, 0.18);
    tone(90, 0.10, 'sine', 0.12, 50);
  }
  function sfxExplosion() {
    noiseBurst(0.5, 0.3, 500);
    tone(300, 0.6, 'sawtooth', 0.22, 40);
    setTimeout(() => noiseBurst(0.3, 0.2, 300), 120);
  }
  function sfxWin() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.15), i * 130));
  }
  function sfxLevelStart() {
    const notes = [392, 523, 659];
    notes.forEach((f, i) => setTimeout(() => tone(f, 0.10, 'triangle', 0.12), i * 90));
  }

  function setMuted(v) {
    muted = v;
    localStorage.setItem('supaplex2.muted', muted ? '1' : '0');
    muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  // =====================================================================
  //  FŐ HUROK
  // =====================================================================
  let lastTime = performance.now();
  let acc = 0;

  function frame(now) {
    const dt = Math.min(50, now - lastTime);
    lastTime = now;
    worldTime += dt;

    // világ-tickek fix lépésben
    if (status === 'playing') {
      acc += dt;
      while (acc >= STEP_MS) {
        worldTick();
        acc -= STEP_MS;
      }
      elapsed += dt;
      updateTimeHud();
    } else {
      acc = 0;
    }

    // robbanás-fázis: kis késleltetés a halál-overlay előtt
    if (status === 'dying') {
      dyingTimer -= dt;
      if (dyingTimer <= 0) {
        status = 'dead';
        showOverlay('MURPHY ODAVAN', 'Egy zonk agyonütött! Nyomj R-t az újrakezdéshez.', 'dead');
      }
    }
    // győzelmi konfetti-fázis az overlay előtt
    if (status === 'won' && winTimer > 0) {
      winTimer -= dt;
      if (winTimer <= 0) showWinOverlay();
    }

    // animációk előretolása
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = anim[y][x];
        if (a) {
          a.t += dt / STEP_MS;
          if (a.t >= 1) anim[y][x] = null;
        }
      }
    }
    if (collectFlash > 0) collectFlash = Math.max(0, collectFlash - dt / 180);
    if (shake > 0) shake = Math.max(0, shake - dt / 40);

    // részecskék mozgatása
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
    }
    particles = particles.filter((p) => p.life < p.maxLife);
    for (const e of explosions) e.t += dt;
    explosions = explosions.filter((e) => e.t < 600);

    updateCamera(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // =====================================================================
  //  BEMENET
  // =====================================================================
  const DIRS = {
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 }, S: { dx: 0, dy: 1 },
    a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
    d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
  };

  function startGame() {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (status === 'ready') {
      status = 'playing';
      hideOverlay();
      sfxLevelStart();
    }
  }

  function gotoLevel(i) {
    if (i < 0 || i >= LEVELS.length) return;
    if (i > getUnlocked() && i !== BIRTHDAY_LEVEL) return;
    loadLevel(i);
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;

    if (k === 'm' || k === 'M') {
      setMuted(!muted);
      e.preventDefault();
      return;
    }
    if (k === 'r' || k === 'R') {
      loadLevel(levelIndex);
      startGame();
      e.preventDefault();
      return;
    }
    if ((k === 'n' || k === 'N') && status === 'won') {
      if (levelIndex < LEVELS.length - 1) {
        gotoLevel(levelIndex + 1);
        startGame();
      }
      e.preventDefault();
      return;
    }
    // 1..9: közvetlen pályaválasztás (csak feloldott)
    if (k >= '1' && k <= String(LEVELS.length)) {
      gotoLevel(parseInt(k, 10) - 1);
      e.preventDefault();
      return;
    }
    if (k === ' ') {
      snatchHeld = true;
      e.preventDefault();
      return;
    }

    if (DIRS[k]) {
      e.preventDefault();
      if (status === 'ready') startGame();
      if (status === 'playing') {
        heldDir = DIRS[k];
        // azonnali első lépés a reszponzív érzésért
        if (acc === 0) { worldTick(); acc = 0; }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') snatchHeld = false;
    const d = DIRS[e.key];
    if (d && heldDir && heldDir.dx === d.dx && heldDir.dy === d.dy) heldDir = null;
  });

  // egér / érintés is indítja a játékot
  overlayEl.addEventListener('click', () => { if (status === 'ready') startGame(); });
  canvas.addEventListener('click', () => { if (status === 'ready') startGame(); });
  muteBtn.addEventListener('click', () => { setMuted(!muted); });
  restartBtn.addEventListener('click', () => { loadLevel(levelIndex); startGame(); });
  prevBtn.addEventListener('click', () => { gotoLevel(levelIndex - 1); });
  nextBtn.addEventListener('click', () => { gotoLevel(levelIndex + 1); });

  // ---- Érintő D-pad ----------------------------------------------------
  document.querySelectorAll('.dpad-btn').forEach((btn) => {
    const dir = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    }[btn.dataset.dir];
    const press = (e) => {
      e.preventDefault();
      if (status === 'ready') startGame();
      if (status === 'playing') {
        heldDir = dir;
        if (acc === 0) worldTick();
      }
    };
    const release = (e) => {
      e.preventDefault();
      if (heldDir && heldDir.dx === dir.dx && heldDir.dy === dir.dy) heldDir = null;
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  // ---- Ajándék oldal bezárása ------------------------------------------
  document.getElementById('giftCloseBtn').addEventListener('click', () => {
    document.getElementById('giftPage').classList.add('hidden');
    showOverlay(
      'GYŐZELEM!',
      'Boldog születésnapot!',
      'win',
      'R: újra · 1–' + LEVELS.length + ': pályaválasztás'
    );
    updateHud();
  });

  // ---- Indulás ---------------------------------------------------------
  setMuted(muted);
  loadLevel(levelIndex);
  requestAnimationFrame(frame);
})();
