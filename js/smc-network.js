'use strict';

// ============================================================
// NETWORK MANAGER — WebRTC peer-to-peer via PeerJS
// Works on any network / device with no backend server required.
//
// HOW IT WORKS:
//   The first player to enter a room code becomes HOST (P1).
//   They register a named PeerJS ID: "smcgame-<ROOMCODE>".
//   The second player connects to that same ID as GUEST (P2).
//   All game data flows over a direct WebRTC DataChannel.
//
// The public API is identical to the old Socket.IO version so
// smc-loop.js and smc-menu.js need no changes.
// ============================================================
const NetworkManager = (function() {
  let _peer      = null;  // local Peer instance
  let _conn      = null;  // active DataConnection
  let _slot      = 0;     // 1 = host/P1, 2 = guest/P2
  let _room      = null;
  let _connected = false;
  let _sendTimer = 0;

  // Callbacks stored at connect() time
  let _onJoined        = null;
  let _onBothConnected = null;
  let _onRemoteHit     = null;
  let _onRemoteEvent   = null;
  let _onDisconnect    = null;

  // Interpolation buffer for remote player state
  const _buf = [];
  const MAX_BUF = 12;

  function _pushBuf(state) {
    state.ts = Date.now();
    _buf.push(state);
    while (_buf.length > MAX_BUF) _buf.shift();
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  // Wire up an open DataConnection for both host and guest
  function _setupConn(conn) {
    _conn = conn;

    conn.on('data', (msg) => {
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case 'slotAssign':
          // Guest receives their slot assignment from host
          _slot = msg.slot;
          _connected = true;
          if (_onJoined) _onJoined(_slot);
          break;
        case 'bothConnected':
          if (_onBothConnected) _onBothConnected();
          break;
        case 'playerState':
          _pushBuf(msg.state);
          break;
        case 'hitEvent':
          if (_onRemoteHit) _onRemoteHit(msg);
          break;
        case 'gameEvent':
          if (_onRemoteEvent) _onRemoteEvent(msg);
          break;
        case 'gameStateSync':
          // Guest receives authoritative game state from host
          if (msg.state) _applyRemoteGameState(msg.state);
          break;
        case 'ping':
          conn.send({ type: 'pong', ts: msg.ts });
          break;
      }
    });

    conn.on('close', () => {
      _connected = false;
      if (_onDisconnect) _onDisconnect();
    });

    conn.on('error', () => {
      _connected = false;
      if (_onDisconnect) _onDisconnect();
    });
  }

  function _statusEl() { return document.getElementById('onlineStatus'); }

  return {
    get connected() { return _connected; },
    get slot()      { return _slot; },
    get room()      { return _room; },

    // serverUrl param kept for API compatibility — ignored (PeerJS uses its own cloud)
    connect(serverUrl, roomCode, onJoined, onBothConnected, onRemoteState, onRemoteHit, onRemoteEvent, onDisconnect) {
      if (_peer) { _peer.destroy(); _peer = null; }
      _conn = null; _connected = false; _slot = 0; _room = null; _buf.length = 0;

      _onJoined        = onJoined;
      _onBothConnected = onBothConnected;
      _onRemoteHit     = onRemoteHit;
      _onRemoteEvent   = onRemoteEvent;
      _onDisconnect    = onDisconnect;

      const code   = roomCode.trim().toLowerCase();
      _room        = code.toUpperCase();
      const hostId = 'smcgame-' + code; // deterministic ID for the host

      /* global Peer */
      if (typeof Peer === 'undefined') {
        const el = _statusEl();
        if (el) el.textContent = '❌ PeerJS not loaded — check your internet connection.';
        return;
      }

      // Attempt to register as HOST by claiming the named peer ID
      _peer = new Peer(hostId, { debug: 0 });

      _peer.on('open', () => {
        // Successfully registered as host — we are P1
        _slot = 1;
        _connected = true;
        if (onJoined) onJoined(1);
        const el = _statusEl();
        if (el) el.textContent = '✅ Room created — waiting for opponent…';
      });

      _peer.on('connection', (conn) => {
        // Guest connected to us
        _setupConn(conn);
        conn.on('open', () => {
          // Tell guest their slot, then signal both-connected
          conn.send({ type: 'slotAssign', slot: 2 });
          setTimeout(() => {
            conn.send({ type: 'bothConnected' });
            if (onBothConnected) onBothConnected();
          }, 400); // brief delay so guest processes slotAssign first
        });
      });

      _peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Room already exists — join as GUEST (P2)
          _peer.destroy();
          _peer = new Peer({ debug: 0 }); // auto-generated guest ID

          _peer.on('open', () => {
            const el = _statusEl();
            if (el) el.textContent = '⏳ Connecting to host…';
            const conn = _peer.connect(hostId, { reliable: true });
            _setupConn(conn);
          });

          _peer.on('error', (e2) => {
            _connected = false;
            const el = _statusEl();
            if (el) el.textContent = `❌ Connection failed: ${e2.message || e2.type}`;
          });

        } else {
          _connected = false;
          const el = _statusEl();
          if (el) el.textContent = `❌ Error: ${err.message || err.type}`;
        }
      });

      _peer.on('disconnected', () => {
        _connected = false;
        if (_onDisconnect) _onDisconnect();
      });
    },

    disconnect() {
      if (_peer) { _peer.destroy(); _peer = null; }
      _conn = null; _connected = false; _slot = 0; _room = null; _buf.length = 0;
    },

    // Send local player state (~20 Hz via tick())
    sendState(p) {
      if (!_conn || !_connected || !p) return;
      try {
        _conn.send({ type: 'playerState', state: {
          x: p.x, y: p.y, vx: p.vx, vy: p.vy,
          health: p.health, maxHealth: p.maxHealth,
          state: p.state, facing: p.facing,
          color: p.color, weaponKey: p.weaponKey,
          charClass: p.charClass || 'none',
          lives: p.lives,
          hat: p.hat || 'none', cape: p.cape || 'none',
          name: p.name || (_slot === 1 ? 'P1' : 'P2'),
          curses: (p.curses || []).map(c => ({ type: c.type, timer: c.timer })),
        }});
      } catch(e) {}
    },

    sendHit(dmg, kb, kbDir) {
      if (!_conn || !_connected) return;
      try { _conn.send({ type: 'hitEvent', dmg, kb, kbDir, ts: Date.now() }); } catch(e) {}
    },

    sendGameEvent(type, data) {
      if (!_conn || !_connected) return;
      try { _conn.send({ type: 'gameEvent', type: type, data, ts: Date.now() }); } catch(e) {}
    },

    // Interpolated remote state — called each render frame
    getRemoteState() {
      if (_buf.length === 0) return null;
      if (_buf.length === 1) return _buf[0];
      const now = Date.now() - 130;
      let lo = _buf[0], hi = _buf[_buf.length - 1];
      for (let i = 0; i < _buf.length - 1; i++) {
        if (_buf[i].ts <= now && _buf[i + 1].ts >= now) {
          lo = _buf[i]; hi = _buf[i + 1]; break;
        }
      }
      if (lo === hi) return hi;
      const dt = hi.ts - lo.ts;
      const t  = dt > 0 ? Math.min(1, (now - lo.ts) / dt) : 1;
      return {
        x:         _lerp(lo.x,  hi.x,  t),
        y:         _lerp(lo.y,  hi.y,  t),
        vx:        _lerp(lo.vx, hi.vx, t),
        vy:        _lerp(lo.vy, hi.vy, t),
        health:    hi.health, maxHealth: hi.maxHealth,
        state:     hi.state,  facing: hi.facing,
        color:     hi.color,  weaponKey: hi.weaponKey,
        charClass: hi.charClass, lives: hi.lives,
        hat:       hi.hat,    cape: hi.cape,
        name:      hi.name,   curses: hi.curses || [],
      };
    },

    // Called every game frame — sends state at 20 Hz
    tick(localPlayer) {
      _sendTimer++;
      if (_sendTimer >= 3) { _sendTimer = 0; this.sendState(localPlayer); }
    },

    // Send full game state to guest (called by host just before game starts)
    sendGameStateSync(stateObj) {
      if (!_conn || !_connected || _slot !== 1) return;
      try { _conn.send({ type: 'gameStateSync', state: stateObj }); } catch(e) {}
    },
  };
})();

// Apply game state received from host
function _applyRemoteGameState(state) {
  if (!state) return;
  // Arena
  if (state.arenaKey) {
    selectedArena   = state.arenaKey;
    currentArenaKey = state.arenaKey;
  }
  // Platform positions (randomized layout)
  if (state.platforms && currentArena) {
    for (let i = 0; i < state.platforms.length && i < currentArena.platforms.length; i++) {
      const sp = state.platforms[i];
      const lp = currentArena.platforms[i];
      if (sp.x !== undefined) lp.x  = sp.x;
      if (sp.y !== undefined) lp.y  = sp.y;
      if (sp.w !== undefined) lp.w  = sp.w;
    }
  }
  // Player weapons and classes
  if (state.p1Weapon) {
    const sel = document.getElementById('p1Weapon');
    if (sel) sel.value = state.p1Weapon;
  }
  if (state.p2Weapon) {
    const sel = document.getElementById('p2Weapon');
    if (sel) sel.value = state.p2Weapon;
  }
  if (state.p1Class) {
    const sel = document.getElementById('p1Class');
    if (sel) sel.value = state.p1Class;
  }
  if (state.p2Class) {
    const sel = document.getElementById('p2Class');
    if (sel) sel.value = state.p2Class;
  }
  // Chosen lives
  if (state.lives !== undefined) chosenLives = state.lives;
  // Game mode
  if (state.gameMode) { _onlineGameMode = state.gameMode; gameMode = state.gameMode; }
}

// ============================================================
// ONLINE MULTIPLAYER — connection + mode setup
// ============================================================
function networkJoinRoom() {
  const roomCode = (document.getElementById('onlineRoomCode')?.value || '').trim().toUpperCase();
  const statusEl = document.getElementById('onlineStatus');
  if (!roomCode) { if (statusEl) statusEl.textContent = '⚠ Enter a room code first.'; return; }
  if (statusEl) statusEl.textContent = '⏳ Connecting…';

  NetworkManager.connect(
    null, // serverUrl — unused, kept for API compat
    roomCode,
    // onJoined
    (slot) => {
      onlineLocalSlot = slot;
      onlineMode = true;
      if (slot === 1) _advertisePublicRoom(roomCode); // advertise if public
      if (statusEl) statusEl.textContent = slot === 1
        ? `✅ Room "${roomCode}" created — share this code with your opponent!`
        : `✅ Joined room "${roomCode}" — connecting to host…`;
      const modeRow = document.getElementById('onlineGameModeRow');
      if (modeRow) modeRow.style.display = slot === 1 ? 'flex' : 'none';
      const chatEl = document.getElementById('onlineChat');
      if (chatEl) chatEl.style.display = 'flex';
    },
    // onBothConnected
    () => {
      if (statusEl) statusEl.textContent = '🎮 Both connected! Starting…';
      onlineReady = true;
      if (onlineLocalSlot !== 1) {
        gameMode = _onlineGameMode;
        selectMode(gameMode);
      }
      setTimeout(() => startGame(), 600);
    },
    // onRemoteState — handled per-frame via getRemoteState()
    null,
    // onRemoteHit
    (ev) => {
      if (!gameRunning || !onlineMode) return;
      const me = players.find(p => !p.isRemote);
      if (me && me.health > 0) {
        me.health    = Math.max(0, me.health - (ev.dmg || 0));
        me.vx       += (ev.kbDir || 1) * (ev.kb || 0);
        me.vy        = Math.min(me.vy, -(ev.kb || 0) * 0.5);
        me.hurtTimer = 14;
        if (settings.screenShake) screenShake = Math.max(screenShake, Math.min(ev.dmg * 0.5, 18));
        if (settings.dmgNumbers)  damageTexts.push({ x: me.cx(), y: me.y, val: ev.dmg, timer: 45, color: '#ff4444' });
        spawnParticles(me.cx(), me.cy(), me.color, Math.min(ev.dmg, 16));
        SoundManager.hit();
      }
    },
    // onRemoteGameEvent
    (ev) => {
      if (!onlineMode) return;
      if (ev.type === 'achievementUnlocked') {
        if (ev.data?.id && !earnedAchievements.has(ev.data.id)) unlockAchievement(ev.data.id);
        return;
      }
      if (ev.type === 'chat') {
        _appendChatMsg(ev.data?.name || 'P2', ev.data?.text || '');
        return;
      }
      if (ev.type === 'gameModeSelected') {
        _onlineGameMode = ev.data?.mode || '2p';
        gameMode = _onlineGameMode;
        selectMode(gameMode);
        return;
      }
      if (!gameRunning) return;
      if (ev.type === 'respawn') {
        const remote = players.find(p => p.isRemote);
        if (remote) {
          remote.health = remote.maxHealth;
          remote.hurtTimer = 0; remote.stunTimer = 0; remote.ragdollTimer = 0;
        }
      }
    },
    // onDisconnect
    () => {
      if (gameRunning && onlineMode) {
        endGame();
        showToast('Opponent disconnected', 3000);
      } else {
        const el = document.getElementById('onlineStatus');
        if (el) el.textContent = '🔌 Disconnected.';
      }
    },
  );
}

// ---- Public / Private room type toggle ----
function setRoomType(type) {
  _isPublicRoom = (type === 'public');
  document.getElementById('roomTypePublicBtn')?.classList.toggle('active', _isPublicRoom);
  document.getElementById('roomTypePrivateBtn')?.classList.toggle('active', !_isPublicRoom);
  const browser = document.getElementById('publicRoomBrowser');
  if (browser) browser.style.display = _isPublicRoom ? 'flex' : 'none';
}

// Refresh public room list from PeerJS server (uses discovery peer trick)
function refreshPublicRooms() {
  const listEl = document.getElementById('publicRoomList');
  if (!listEl) return;
  listEl.innerHTML = '<span style="color:#556">Searching…</span>';
  // Public rooms store themselves in localStorage under a shared key prefix
  // so same-browser tabs can discover each other; cross-device relies on PeerJS
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('smcpub_'));
    _publicRooms = [];
    const now = Date.now();
    for (const k of keys) {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        if (d && d.code && (now - d.ts) < 120000) { // 2min TTL
          _publicRooms.push(d);
        } else {
          localStorage.removeItem(k); // expired
        }
      } catch(e) {}
    }
    _renderPublicRooms();
  } catch(e) {
    listEl.innerHTML = '<span style="color:#f88">Error loading rooms.</span>';
  }
}

function _renderPublicRooms() {
  const listEl = document.getElementById('publicRoomList');
  if (!listEl) return;
  if (!_publicRooms.length) {
    listEl.innerHTML = '<span style="color:#556">No public rooms. Create one above!</span>';
    return;
  }
  listEl.innerHTML = '';
  for (const r of _publicRooms) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 5px;margin:2px 0;background:rgba(0,100,200,0.2);border-radius:4px;cursor:pointer;';
    row.innerHTML = `<span style="color:#88ddff">🌍 ${r.code}</span><span style="color:#aab;font-size:0.65rem;">${r.host||'Host'}</span>`;
    row.onclick = () => {
      const inp = document.getElementById('onlineRoomCode');
      if (inp) { inp.value = r.code; }
    };
    listEl.appendChild(row);
  }
}

function _advertisePublicRoom(code) {
  if (!_isPublicRoom) return;
  try {
    const key = 'smcpub_' + code.toUpperCase();
    localStorage.setItem(key, JSON.stringify({ code: code.toUpperCase(), host: 'Player', ts: Date.now() }));
    // Refresh every 30s to keep TTL alive
    _publicRoomCheckTimer = setInterval(() => {
      if (!NetworkManager.connected) { clearInterval(_publicRoomCheckTimer); localStorage.removeItem(key); return; }
      localStorage.setItem(key, JSON.stringify({ code: code.toUpperCase(), host: 'Player', ts: Date.now() }));
    }, 30000);
  } catch(e) {}
}

function _removePublicRoom(code) {
  if (_publicRoomCheckTimer) clearInterval(_publicRoomCheckTimer);
  try { localStorage.removeItem('smcpub_' + (code||'').toUpperCase()); } catch(e) {}
}

function setOnlineGameMode(mode) {
  _onlineGameMode = mode;
  gameMode = mode;
  selectMode(mode);
  document.querySelectorAll('#onlineGameModeRow .btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (NetworkManager.connected) {
    NetworkManager.sendGameEvent('gameModeSelected', { mode });
  }
}

function sendChatMsg() {
  const inp = document.getElementById('chatInput');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  const name = onlineLocalSlot === 1 ? 'P1' : 'P2';
  _appendChatMsg(name, text);
  if (NetworkManager.connected) {
    NetworkManager.sendGameEvent('chat', { name, text });
  }
}

function onChatKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); sendChatMsg(); }
}

function _appendChatMsg(name, text) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const line = document.createElement('div');
  line.style.cssText = 'font-size:0.72rem;line-height:1.3;word-break:break-word;';
  const nameEl = document.createElement('span');
  nameEl.style.cssText = `color:${name === 'P1' ? '#66aaff' : '#ff8844'};font-weight:bold;margin-right:4px;`;
  nameEl.textContent = name + ':';
  const textEl = document.createElement('span');
  textEl.style.color = '#dde';
  textEl.textContent = text;
  line.appendChild(nameEl);
  line.appendChild(textEl);
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function showToast(msg, duration) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;padding:10px 22px;border-radius:22px;font-size:0.9rem;z-index:900;pointer-events:none;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, duration || 2500);
}
