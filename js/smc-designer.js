'use strict';

// ============================================================
// STICKMAN CLASH — MAP & WEAPON DESIGNER
// Accessible from the main menu (Designer card) or via console.
// ============================================================

// ---- State ----
let _dPlatforms  = [];          // custom platforms being edited
let _dHazards    = new Set();   // active hazard toggles
let _dSelected   = null;        // index of selected platform
let _dDragging   = false;
let _dDragOffX   = 0;
let _dDragOffY   = 0;
let _dHistory    = [];          // undo stack (shallow platform copies)
let _dBaseArena  = 'grass';
let _dMeta       = { name: 'My Map', hasLava: false, skyColor: '#0d0d1e' };
let _dCanvas     = null;
let _dCtx        = null;
let _dAnimId     = null;
let _dCustomWeapons = [];       // saved custom weapons

// ---- OPEN / CLOSE ----
function openDesigner() {
  document.getElementById('designerOverlay').style.display = 'block';
  document.getElementById('menu').style.display            = 'none';
  _dCanvas = document.getElementById('designerCanvas');
  _dCtx    = _dCanvas.getContext('2d');
  _dSetupCanvasEvents();
  _dLoadSaved();
  _wRefreshList();
  _dStartPreviewLoop();
  designerTab('map');
}

function closeDesigner() {
  document.getElementById('designerOverlay').style.display = 'none';
  document.getElementById('menu').style.display            = 'grid';
  if (_dAnimId) { cancelAnimationFrame(_dAnimId); _dAnimId = null; }
}

function designerTab(tab) {
  document.getElementById('designerMapPanel').style.display    = tab === 'map'    ? 'block' : 'none';
  document.getElementById('designerWeaponPanel').style.display = tab === 'weapon' ? 'block' : 'none';
  document.getElementById('dTabMap').classList.toggle('active-tab',    tab === 'map');
  document.getElementById('dTabWeapon').classList.toggle('active-tab', tab === 'weapon');
  if (tab === 'weapon') _wDraw();
}

// ---- BASE ARENA CHANGE ----
function designerChangeBase() {
  _dBaseArena = document.getElementById('dBaseArena').value;
  _dPlatforms = [];
  _dSelected  = null;
  _dHistory   = [];
  // Pre-populate with the selected arena's platforms as starting points
  if (typeof ARENAS !== 'undefined' && ARENAS[_dBaseArena]) {
    ARENAS[_dBaseArena].platforms.forEach(pl => {
      _dPlatforms.push({ x: pl.x, y: pl.y, w: pl.w, h: pl.h || 14,
        isFloor: !!pl.isFloor, oscX: pl.oscX || 0, oscY: pl.oscY || 0,
        ox: pl.ox || pl.x, oy: pl.oy || pl.y });
    });
  }
}

// ---- PLATFORM TOOLS ----
function designerAddPlatform() {
  _dHistory.push(JSON.stringify(_dPlatforms));
  _dPlatforms.push({ x: 300, y: 200, w: 120, h: 14, isFloor: false, oscX: 0, oscY: 0 });
  _dSelected = _dPlatforms.length - 1;
  _dSyncControls();
}

function designerClearPlatforms() {
  _dHistory.push(JSON.stringify(_dPlatforms));
  _dPlatforms = [];
  _dSelected  = null;
}

function designerUndo() {
  if (_dHistory.length === 0) return;
  _dPlatforms = JSON.parse(_dHistory.pop());
  _dSelected  = null;
}

function designerUpdateSelected() {
  if (_dSelected === null || !_dPlatforms[_dSelected]) return;
  const pl = _dPlatforms[_dSelected];
  pl.w     = parseInt(document.getElementById('dPlatW').value);
  pl.h     = parseInt(document.getElementById('dPlatH').value);
  pl.isFloor = document.getElementById('dPlatFloor').checked;
  const moving = document.getElementById('dPlatMoving').checked;
  pl.oscX  = moving ? 60 : 0;
  pl.oscY  = 0;
  if (!pl.ox) { pl.ox = pl.x; pl.oy = pl.y; }
}

function _dSyncControls() {
  const pl = _dSelected !== null ? _dPlatforms[_dSelected] : null;
  document.getElementById('dPlatW').value       = pl ? pl.w : 120;
  document.getElementById('dPlatH').value       = pl ? pl.h : 14;
  document.getElementById('dPlatFloor').checked  = pl ? !!pl.isFloor : false;
  document.getElementById('dPlatMoving').checked = pl ? (pl.oscX > 0) : false;
}

// ---- HAZARD TOGGLES ----
function designerToggleHazard(h) {
  if (_dHazards.has(h)) _dHazards.delete(h);
  else _dHazards.add(h);
  // Update button visual
  document.querySelectorAll('.d-hazard-btn').forEach(btn => {
    const key = btn.getAttribute('onclick').match(/'([^']+)'/)?.[1];
    if (key) btn.classList.toggle('active', _dHazards.has(key));
  });
}

function designerSyncMeta() {
  _dMeta.name    = document.getElementById('dMapName').value || 'My Map';
  _dMeta.hasLava = document.getElementById('dHasLava').checked;
  _dMeta.skyColor = document.getElementById('dSkyColor').value;
}

// ---- CANVAS EVENTS ----
function _dSetupCanvasEvents() {
  const cv = _dCanvas;
  // Scale canvas coords from CSS to logical GAME dimensions (900×520)
  const _toGame = (cx, cy) => {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left) / r.width * 900, y: (cy - r.top) / r.height * 520 };
  };

  cv.onmousedown = (e) => {
    e.preventDefault();
    const { x, y } = _toGame(e.clientX, e.clientY);
    if (e.button === 2) {
      // Right-click: delete platform under cursor
      const idx = _dPlatforms.findIndex(pl => x >= pl.x && x <= pl.x + pl.w && y >= pl.y && y <= pl.y + pl.h);
      if (idx >= 0) { _dHistory.push(JSON.stringify(_dPlatforms)); _dPlatforms.splice(idx, 1); _dSelected = null; }
      return;
    }
    // Left-click: select existing or add new
    const idx = _dPlatforms.findIndex(pl => x >= pl.x && x <= pl.x + pl.w && y >= pl.y && y <= pl.y + pl.h);
    if (idx >= 0) {
      _dSelected  = idx;
      _dDragging  = true;
      _dDragOffX  = x - _dPlatforms[idx].x;
      _dDragOffY  = y - _dPlatforms[idx].y;
      _dSyncControls();
    } else {
      // Click on empty space: add platform
      _dHistory.push(JSON.stringify(_dPlatforms));
      const w = parseInt(document.getElementById('dPlatW').value) || 120;
      const h = parseInt(document.getElementById('dPlatH').value) || 14;
      _dPlatforms.push({ x: x - w / 2, y, w, h, isFloor: false, oscX: 0, oscY: 0 });
      _dSelected = _dPlatforms.length - 1;
      _dDragging  = true;
      _dDragOffX  = w / 2;
      _dDragOffY  = h / 2;
      _dSyncControls();
    }
  };

  cv.onmousemove = (e) => {
    if (!_dDragging || _dSelected === null) return;
    const { x, y } = _toGame(e.clientX, e.clientY);
    _dPlatforms[_dSelected].x = x - _dDragOffX;
    _dPlatforms[_dSelected].y = y - _dDragOffY;
  };

  cv.onmouseup = () => { _dDragging = false; };
  cv.onmouseleave = () => { _dDragging = false; };
  cv.oncontextmenu = (e) => e.preventDefault();

  // Scroll wheel: resize selected platform width
  cv.onwheel = (e) => {
    e.preventDefault();
    if (_dSelected === null) return;
    const pl = _dPlatforms[_dSelected];
    pl.w = Math.max(30, Math.min(450, pl.w - Math.sign(e.deltaY) * 10));
    document.getElementById('dPlatW').value = pl.w;
  };
}

// ---- PREVIEW LOOP (draws editor canvas) ----
function _dStartPreviewLoop() {
  const loop = () => {
    const ov = document.getElementById('designerOverlay');
    if (!ov || ov.style.display === 'none') { _dAnimId = null; return; }
    _dAnimId = requestAnimationFrame(loop);
    _dDrawEditor();
  };
  if (_dAnimId) cancelAnimationFrame(_dAnimId);
  _dAnimId = requestAnimationFrame(loop);
}

function _dDrawEditor() {
  const cv = _dCanvas;
  if (!cv) return;
  const dc = _dCtx;
  const W = 900, H = 520;

  dc.clearRect(0, 0, cv.width, cv.height);

  // Sky gradient
  const sky = dc.createLinearGradient(0, 0, 0, cv.height);
  sky.addColorStop(0, _dMeta.skyColor || '#0d0d1e');
  sky.addColorStop(1, '#1a1a2e');
  dc.fillStyle = sky;
  dc.fillRect(0, 0, cv.width, cv.height);

  const sx = cv.width / W, sy = cv.height / H;

  // Lava hint at bottom
  if (_dHazards.has('lava') || _dMeta.hasLava) {
    dc.fillStyle = 'rgba(255,80,0,0.25)';
    dc.fillRect(0, cv.height - cv.height * 0.07, cv.width, cv.height * 0.07);
    dc.fillStyle = '#ff6600';
    dc.fillRect(0, cv.height - 3, cv.width, 3);
  }

  // Grid
  dc.strokeStyle = 'rgba(255,255,255,0.04)';
  dc.lineWidth = 0.5;
  for (let x = 0; x < cv.width; x += 45 * sx) { dc.beginPath(); dc.moveTo(x,0); dc.lineTo(x,cv.height); dc.stroke(); }
  for (let y = 0; y < cv.height; y += 45 * sy) { dc.beginPath(); dc.moveTo(0,y); dc.lineTo(cv.width,y); dc.stroke(); }

  // Ceiling line
  const ceilY = _dHazards.has('lowgrav') ? (cv.height * 0.3) : (cv.height * 0.05);
  dc.strokeStyle = 'rgba(100,200,255,0.3)';
  dc.setLineDash([6,4]);
  dc.lineWidth = 1.5;
  dc.beginPath(); dc.moveTo(0, ceilY); dc.lineTo(cv.width, ceilY); dc.stroke();
  dc.setLineDash([]);
  dc.fillStyle = 'rgba(100,200,255,0.5)';
  dc.font = '10px Arial';
  dc.fillText('ceiling', 6, ceilY - 3);

  // Platforms
  _dPlatforms.forEach((pl, i) => {
    const px = pl.x * sx, py = pl.y * sy, pw = pl.w * sx, ph = (pl.h || 14) * sy;
    const isSelected = i === _dSelected;

    // Shadow
    dc.fillStyle = 'rgba(0,0,0,0.4)';
    dc.fillRect(px + 2, py + 2, pw, ph);

    // Platform body
    if (pl.isFloor) {
      dc.fillStyle = isSelected ? '#88ff88' : '#446644';
    } else {
      dc.fillStyle = isSelected ? '#aaddff' : '#334466';
    }
    dc.fillRect(px, py, pw, ph);

    // Shimmer edge
    dc.fillStyle = isSelected ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)';
    dc.fillRect(px, py, pw, 2);

    // Oscillating indicator
    if (pl.oscX > 0 || pl.oscY > 0) {
      dc.strokeStyle = '#ffcc44';
      dc.lineWidth   = 1.5;
      dc.setLineDash([4, 3]);
      dc.beginPath();
      dc.moveTo(px - pl.oscX * sx, py); dc.lineTo(px + pw + pl.oscX * sx, py);
      dc.stroke();
      dc.setLineDash([]);
    }

    // Selected: resize handle
    if (isSelected) {
      dc.strokeStyle = '#88ff44';
      dc.lineWidth   = 2;
      dc.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
      // Corner handles
      ['tl','tr','br','bl'].forEach((c,j) => {
        const hx = c.includes('r') ? px + pw : px;
        const hy = c.includes('b') ? py + ph : py;
        dc.fillStyle = '#88ff44';
        dc.fillRect(hx - 4, hy - 4, 8, 8);
      });
    }
  });

  // Hazard overlays
  if (_dHazards.has('fog')) {
    dc.fillStyle = 'rgba(180,180,220,0.12)';
    dc.fillRect(0, 0, cv.width, cv.height);
    dc.fillStyle = 'rgba(180,180,220,0.6)';
    dc.font = 'bold 11px Arial';
    dc.textAlign = 'center';
    dc.fillText('🌫 FOG ACTIVE', cv.width / 2, 20);
    dc.textAlign = 'left';
  }
  if (_dHazards.has('wind')) {
    for (let i = 0; i < 5; i++) {
      const wx = ((Date.now() / 8 + i * 160) % cv.width);
      dc.strokeStyle = 'rgba(150,200,255,0.25)';
      dc.lineWidth   = 1;
      dc.beginPath(); dc.moveTo(wx, 60 + i * 70); dc.lineTo(wx + 50, 60 + i * 70); dc.stroke();
    }
  }

  // NPC spawn hints
  if (_dHazards.has('npc_beast')) {
    dc.fillStyle = 'rgba(100,200,0,0.7)';
    dc.font = '14px Arial';
    dc.fillText('🐺', cv.width * 0.65, cv.height * 0.5);
    dc.fillStyle = 'rgba(100,200,0,0.4)';
    dc.font = '9px Arial';
    dc.fillText('Forest Beast spawn', cv.width * 0.63, cv.height * 0.5 + 14);
  }
  if (_dHazards.has('npc_yeti')) {
    dc.fillStyle = 'rgba(180,240,255,0.7)';
    dc.font = '14px Arial';
    dc.fillText('❄', cv.width * 0.35, cv.height * 0.5);
    dc.fillStyle = 'rgba(180,240,255,0.4)';
    dc.font = '9px Arial';
    dc.fillText('Yeti spawn', cv.width * 0.32, cv.height * 0.5 + 14);
  }

  // Info overlay
  dc.fillStyle = 'rgba(255,255,255,0.35)';
  dc.font = '10px Arial';
  dc.textAlign = 'right';
  dc.fillText(`Platforms: ${_dPlatforms.length}  |  Selected: ${_dSelected !== null ? _dSelected : 'none'}`, cv.width - 6, cv.height - 6);
  dc.textAlign = 'left';
}

// ---- PREVIEW IN GAME ----
function designerPreview() {
  designerSyncMeta();
  if (typeof ARENAS === 'undefined') { alert('Open the game first (ARENAS not loaded).'); return; }
  // Build a custom arena object and inject it
  const base = (ARENAS[_dBaseArena] || ARENAS['grass']);
  const customArena = Object.assign({}, base, {
    name:       _dMeta.name,
    sky:        [_dMeta.skyColor, '#1a1a2e'],
    hasLava:    _dMeta.hasLava || _dHazards.has('lava'),
    isLowGravity:   _dHazards.has('lowgrav'),
    isHeavyGravity: _dHazards.has('heavygrav'),
    isIcy:          _dHazards.has('ice'),
    platforms:  _dPlatforms.length > 0 ? _dPlatforms.map(pl => ({
      x: pl.x, y: pl.y, w: pl.w, h: pl.h || 14,
      isFloor: pl.isFloor,
      oscX: pl.oscX || 0, oscY: pl.oscY || 0,
      ox: pl.x, oy: pl.y,
    })) : base.platforms,
  });
  ARENAS['_custom'] = customArena;
  currentArenaKey   = '_custom';
  currentArena      = customArena;
  if (typeof generateBgElements === 'function') generateBgElements();
  closeDesigner();
  if (typeof selectMode === 'function') selectMode('2p');
  alert(`Map "${_dMeta.name}" loaded! Press Play to fight on it.`);
}

// ---- SAVE / LOAD / EXPORT ----
function designerSave() {
  designerSyncMeta();
  const saves = _dGetSaves();
  const key   = Date.now().toString();
  saves[key]  = { meta: _dMeta, platforms: _dPlatforms, hazards: [..._dHazards], base: _dBaseArena };
  localStorage.setItem('smc_custom_maps', JSON.stringify(saves));
  _dLoadSaved();
  alert(`Map "${_dMeta.name}" saved!`);
}

function designerLoad() {
  const panel = document.getElementById('dSavedMaps');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function _dLoadSaved() {
  const saves = _dGetSaves();
  const list  = document.getElementById('dSavedMapsList');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(saves).forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'd-saved-entry';
    row.innerHTML = `<span>${v.meta.name}</span>
      <div><button onclick="_dApplySave('${k}')">Load</button><button onclick="_dDeleteSave('${k}')">✕</button></div>`;
    list.appendChild(row);
  });
  const panel = document.getElementById('dSavedMaps');
  if (panel && Object.keys(saves).length > 0) panel.style.display = 'block';
}

function _dGetSaves() {
  try { return JSON.parse(localStorage.getItem('smc_custom_maps') || '{}'); } catch { return {}; }
}

function _dApplySave(key) {
  const saves = _dGetSaves();
  const s     = saves[key];
  if (!s) return;
  _dMeta      = s.meta;
  _dPlatforms = s.platforms || [];
  _dHazards   = new Set(s.hazards || []);
  _dBaseArena = s.base || 'grass';
  document.getElementById('dBaseArena').value  = _dBaseArena;
  document.getElementById('dMapName').value    = _dMeta.name;
  document.getElementById('dHasLava').checked  = _dMeta.hasLava;
  document.getElementById('dSkyColor').value   = _dMeta.skyColor;
  _dSelected = null;
  // Sync hazard buttons
  document.querySelectorAll('.d-hazard-btn').forEach(btn => {
    const k = btn.getAttribute('onclick').match(/'([^']+)'/)?.[1];
    if (k) btn.classList.toggle('active', _dHazards.has(k));
  });
}

function _dDeleteSave(key) {
  const saves = _dGetSaves();
  delete saves[key];
  localStorage.setItem('smc_custom_maps', JSON.stringify(saves));
  _dLoadSaved();
}

function designerExport() {
  designerSyncMeta();
  const obj = { meta: _dMeta, platforms: _dPlatforms, hazards: [..._dHazards], base: _dBaseArena };
  const text = JSON.stringify(obj, null, 2);
  navigator.clipboard?.writeText(text).then(() => alert('Map JSON copied to clipboard!'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      alert('Map JSON copied to clipboard!');
    });
}

// ---- WEAPON BUILDER ----
function wSync() {
  document.getElementById('wDmgVal').textContent    = document.getElementById('wDmg').value;
  document.getElementById('wRangeVal').textContent  = document.getElementById('wRange').value;
  document.getElementById('wCoolVal').textContent   = document.getElementById('wCool').value;
  document.getElementById('wKbVal').textContent     = document.getElementById('wKb').value;
  document.getElementById('wAbilCoolVal').textContent = document.getElementById('wAbilCool').value;
  _wUpdateStatDisplay();
  _wDraw();
}

function _wUpdateStatDisplay() {
  const name   = document.getElementById('wName')?.value   || 'Custom';
  const dmg    = document.getElementById('wDmg')?.value    || 15;
  const range  = document.getElementById('wRange')?.value  || 50;
  const cool   = document.getElementById('wCool')?.value   || 30;
  const kb     = document.getElementById('wKb')?.value     || 8;
  const type   = document.getElementById('wType')?.value   || 'melee';
  const abil   = document.getElementById('wAbilEffect')?.value || 'dash';
  const el     = document.getElementById('weaponStatDisplay');
  if (!el) return;
  el.innerHTML =
    `<b style="color:#88aaff">${name}</b><br>` +
    `Damage: <span style="color:#ff8888">${dmg}</span>  ·  ` +
    `Range: <span style="color:#88aaff">${range}px</span>  ·  ` +
    `Cooldown: <span style="color:#ffcc44">${cool}f</span><br>` +
    `Knockback: <span style="color:#88ff88">${kb}</span>  ·  ` +
    `Type: <span style="color:#cc88ff">${type}</span><br>` +
    `Ability: <span style="color:#ffaa44">${abil}</span>  (CD ${document.getElementById('wAbilCool')?.value || 90}f)`;
}

function _wDraw() {
  const cv = document.getElementById('weaponPreviewCanvas');
  if (!cv) return;
  const dc = cv.getContext('2d');
  const W  = cv.width, H = cv.height;
  dc.clearRect(0, 0, W, H);

  // Background
  dc.fillStyle = '#0a0a18';
  dc.fillRect(0, 0, W, H);

  const type  = document.getElementById('wType')?.value   || 'melee';
  const color = document.getElementById('wColor')?.value  || '#44aaff';
  const range = parseInt(document.getElementById('wRange')?.value || 50);
  const cx = W / 2, cy = H / 2;

  // Glow
  dc.shadowColor = color;
  dc.shadowBlur  = 20;

  if (type === 'melee' || type === 'heavy') {
    // Draw a sword/axe shape
    dc.save();
    dc.translate(cx, cy);
    dc.rotate(-Math.PI / 4);
    const sc = range / 50;
    dc.fillStyle = color;
    // Blade
    dc.beginPath();
    dc.moveTo(0, -range * sc);
    dc.lineTo(7 * sc, -range * 0.3 * sc);
    dc.lineTo(0, 10 * sc);
    dc.lineTo(-7 * sc, -range * 0.3 * sc);
    dc.closePath();
    dc.fill();
    // Guard
    dc.fillStyle = '#aaa';
    dc.fillRect(-20 * sc, 0, 40 * sc, 6 * sc);
    // Handle
    dc.fillStyle = '#664422';
    dc.fillRect(-4 * sc, 0, 8 * sc, 30 * sc);
    dc.restore();
  } else if (type === 'ranged') {
    // Bow / gun shape
    dc.strokeStyle = color;
    dc.lineWidth   = 3;
    dc.beginPath();
    dc.arc(cx, cy, range * 0.55, -Math.PI * 0.7, Math.PI * 0.7);
    dc.stroke();
    // Arrow
    dc.strokeStyle = '#ffffaa';
    dc.lineWidth   = 2;
    dc.beginPath();
    dc.moveTo(cx - range * 0.5, cy);
    dc.lineTo(cx + range * 0.5, cy);
    dc.stroke();
    dc.fillStyle = '#ffffaa';
    dc.beginPath();
    dc.moveTo(cx + range * 0.5, cy);
    dc.lineTo(cx + range * 0.5 - 10, cy - 5);
    dc.lineTo(cx + range * 0.5 - 10, cy + 5);
    dc.closePath();
    dc.fill();
  } else if (type === 'magic') {
    // Staff / orb
    dc.strokeStyle = '#888';
    dc.lineWidth   = 4;
    dc.beginPath();
    dc.moveTo(cx, cy + range * 0.7);
    dc.lineTo(cx, cy - range * 0.4);
    dc.stroke();
    // Orb
    const pulse = 0.8 + Math.sin(Date.now() * 0.003) * 0.2;
    dc.beginPath();
    dc.arc(cx, cy - range * 0.4, 16 * pulse, 0, Math.PI * 2);
    dc.fillStyle = color;
    dc.fill();
    // Magic particles
    for (let i = 0; i < 6; i++) {
      const a = (Date.now() * 0.002 + i * Math.PI / 3);
      const pr = 28;
      dc.beginPath();
      dc.arc(cx + Math.cos(a) * pr, cy - range * 0.4 + Math.sin(a) * pr, 3, 0, Math.PI * 2);
      dc.fillStyle = color;
      dc.fill();
    }
  }

  dc.shadowBlur = 0;

  // Range indicator
  dc.strokeStyle = 'rgba(255,255,255,0.1)';
  dc.lineWidth   = 1;
  dc.setLineDash([4, 4]);
  dc.beginPath();
  dc.arc(cx, cy, range, 0, Math.PI * 2);
  dc.stroke();
  dc.setLineDash([]);
  dc.fillStyle = 'rgba(255,255,255,0.25)';
  dc.font      = '10px Arial';
  dc.textAlign = 'center';
  dc.fillText(`range: ${range}px`, cx, cy + range + 14);
  dc.textAlign = 'left';

  _wUpdateStatDisplay();
}

function _wBuildObj() {
  const name      = document.getElementById('wName')?.value    || 'Custom';
  const dmg       = parseInt(document.getElementById('wDmg')?.value    || 15);
  const range     = parseInt(document.getElementById('wRange')?.value  || 50);
  const cool      = parseInt(document.getElementById('wCool')?.value   || 30);
  const kb        = parseInt(document.getElementById('wKb')?.value     || 8);
  const type      = document.getElementById('wType')?.value   || 'melee';
  const abilCool  = parseInt(document.getElementById('wAbilCool')?.value || 90);
  const abilEffect = document.getElementById('wAbilEffect')?.value || 'dash';
  const color     = document.getElementById('wColor')?.value  || '#44aaff';

  // Build ability function based on selected effect
  let abilityFn;
  switch (abilEffect) {
    case 'dash':
      abilityFn = function(user, target) {
        user.vx += user.facing * 18;
        const d = Math.abs(user.cx() - target.cx());
        if (d < range + 30) { if (typeof dealDamage !== 'undefined') dealDamage(user, target, Math.round(dmg * 0.7), kb); }
      };
      break;
    case 'leap':
      abilityFn = function(user) { user.vy = -20; user.canDoubleJump = true; };
      break;
    case 'shield_burst':
      abilityFn = function(user, target) {
        if (typeof dealDamage !== 'undefined') dealDamage(user, target, Math.round(dmg * 0.4), kb * 2);
        if (typeof spawnParticles !== 'undefined') spawnParticles(user.cx(), user.cy(), color, 20);
      };
      break;
    case 'projectile':
      abilityFn = function(user) {
        if (typeof spawnBullet !== 'undefined') spawnBullet(user, dmg, range * 0.06);
      };
      break;
    case 'heal':
      abilityFn = function(user) { user.health = Math.min(user.maxHealth, user.health + Math.round(user.maxHealth * 0.2)); };
      break;
    case 'slow':
      abilityFn = function(user, target) { target.stunTimer = Math.max(target.stunTimer, 40); };
      break;
    default:
      abilityFn = function() {};
  }

  return {
    name,
    damage:          dmg,
    range,
    cooldown:        cool,
    kb,
    type,
    abilityCooldown: abilCool,
    ability:         abilityFn,
    _color:          color,  // custom metadata
    _abilEffect:     abilEffect,
    _isCustom:       true,   // blocks achievement/progression tracking
  };
}

function wSaveWeapon() {
  const obj = _wBuildObj();
  // Strip non-serializable fn for storage
  const stored = Object.assign({}, obj, { ability: null });
  _dCustomWeapons.push(stored);
  try { localStorage.setItem('smc_custom_weapons', JSON.stringify(_dCustomWeapons)); } catch(e) {}
  _wRefreshList();
  alert(`Weapon "${obj.name}" saved!`);
}

function _wRefreshList() {
  try {
    const raw = localStorage.getItem('smc_custom_weapons');
    if (raw) _dCustomWeapons = JSON.parse(raw);
  } catch(e) { _dCustomWeapons = []; }

  const list = document.getElementById('dSavedWeaponsList');
  if (!list) return;
  list.innerHTML = '';
  _dCustomWeapons.forEach((w, i) => {
    const row = document.createElement('div');
    row.className = 'd-saved-entry';
    row.innerHTML = `<span>${w.name} (${w.type}, ${w.damage}dmg)</span>
      <div>
        <button onclick="_wLoadWeapon(${i})">Load</button>
        <button onclick="_wDeleteWeapon(${i})">✕</button>
      </div>`;
    list.appendChild(row);
  });
}

function _wLoadWeapon(i) {
  const w = _dCustomWeapons[i];
  if (!w) return;
  document.getElementById('wName').value      = w.name;
  document.getElementById('wDmg').value       = w.damage;
  document.getElementById('wRange').value     = w.range;
  document.getElementById('wCool').value      = w.cooldown;
  document.getElementById('wKb').value        = w.kb;
  document.getElementById('wType').value      = w.type;
  document.getElementById('wAbilCool').value  = w.abilityCooldown || 90;
  document.getElementById('wAbilEffect').value = w._abilEffect || 'dash';
  document.getElementById('wColor').value     = w._color || '#44aaff';
  wSync();
}

function _wDeleteWeapon(i) {
  _dCustomWeapons.splice(i, 1);
  try { localStorage.setItem('smc_custom_weapons', JSON.stringify(_dCustomWeapons)); } catch(e) {}
  _wRefreshList();
}

function wEquipWeapon(pid) {
  const _allowedModes = new Set(['2p', 'training']);
  if (typeof gameMode !== 'undefined' && !_allowedModes.has(gameMode)) {
    alert('Custom weapons can only be used in 1v1 or Training mode.');
    return;
  }
  if (typeof players === 'undefined' || !players.length) {
    // Not in game — store for next game start
    const wObj = _wBuildObj();
    if (pid === 'p1') {
      if (typeof WEAPONS !== 'undefined') {
        WEAPONS['_custom_' + Date.now()] = wObj;
        alert(`Custom weapon ready — it will be used when you start a 1v1 or Training match.`);
      }
    }
    return;
  }
  const wObj = _wBuildObj();
  const p    = pid === 'p2' ? players[1] : players[0];
  if (p) { p.weapon = wObj; alert(`Equipped "${wObj.name}" on ${pid.toUpperCase()}!`); }
  else    { alert('Player not found in current game.'); }
}

function wExportWeapon() {
  const obj = _wBuildObj();
  const serializable = Object.assign({}, obj);
  delete serializable.ability;
  serializable._abilEffect = document.getElementById('wAbilEffect')?.value || 'dash';
  const text = `// Custom weapon — paste into WEAPONS object in smc-data.js\n` +
    `'${obj.name.toLowerCase().replace(/\s+/g,'_')}': ${JSON.stringify(serializable, null, 2)},`;
  navigator.clipboard?.writeText(text).then(() => alert('Weapon code copied to clipboard!'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      alert('Weapon code copied to clipboard!');
    });
}

// Init weapon preview on tab load
document.addEventListener('DOMContentLoaded', () => {
  // Load saved weapons
  try {
    const raw = localStorage.getItem('smc_custom_weapons');
    if (raw) _dCustomWeapons = JSON.parse(raw);
  } catch(e) {}
  // Animate weapon preview when tab is open
  const _wLoop = () => {
    const panel = document.getElementById('designerWeaponPanel');
    if (panel && panel.style.display !== 'none') _wDraw();
    requestAnimationFrame(_wLoop);
  };
  requestAnimationFrame(_wLoop);
});
