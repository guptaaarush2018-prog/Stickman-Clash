'use strict';

// ============================================================
// GAME DIRECTOR — dynamic pacing & event controller
// ============================================================
// Tracks match intensity (0–1) from gameplay events.
// Spawns mini-bosses / hazards / camera effects to keep
// fights dramatic and prevent stale lulls.

const DIRECTOR_EVENT_COOLDOWN_FRAMES = 18 * 60; // 18 s @ 60fps

let director = {
  intensity:           0,     // 0–1, how chaotic the fight currently is
  lastEventFrame:      0,
  eventCooldownFrames: DIRECTOR_EVENT_COOLDOWN_FRAMES,
  lastMusicState:      null,  // 'normal' | 'high' | 'boss'
  // Smoothed metrics (updated every frame, used for event selection)
  _recentDmg:      0,         // EMA of damage dealt (reset on event)
  _timeSinceHit:   0,         // frames since last dealDamage call
  _playerMinHp:    1,         // lowest HP% across non-boss players (0–1)
  _lastMinHpLow:   0,         // frameCount when HP went below 0.25
};

function resetDirector() {
  director.intensity           = 0;
  director.lastEventFrame      = frameCount || 0;
  director.eventCooldownFrames = DIRECTOR_EVENT_COOLDOWN_FRAMES;
  director.lastMusicState      = null;
  director._recentDmg          = 0;
  director._timeSinceHit       = 0;
  director._playerMinHp        = 1;
  director._lastMinHpLow       = 0;
}

// Called from dealDamage in smc-particles.js
function directorAddIntensity(amount) {
  if (!gameRunning || !currentArena) return;
  if (!amount) return;
  director.intensity    = Math.max(0, Math.min(1, director.intensity + amount));
  director._recentDmg  += amount;
  director._timeSinceHit = 0;
}

// Spawn helpers
function directorSpawnMiniBoss(kind) {
  if (!gameRunning || !currentArena) return false;
  if (kind === 'forestBeast') {
    if (currentArenaKey !== 'forest') return false;
    if (typeof spawnForestBeastNow === 'function' && !forestBeast && forestBeastCooldown <= 0) {
      spawnForestBeastNow(); return true;
    }
    return false;
  }
  if (kind === 'yeti') {
    if (currentArenaKey !== 'ice') return false;
    if (typeof spawnYetiNow === 'function' && !yeti && yetiCooldown <= 0) {
      spawnYetiNow(); return true;
    }
    return false;
  }
  return false;
}

// Arena hazard acceleration — makes the next natural hazard fire sooner
function directorSpawnHazard() {
  if (!gameRunning || !currentArena) return false;
  const key = currentArenaKey;
  if (key === 'space') {
    if (mapPerkState.meteorCooldown !== undefined) {
      mapPerkState.meteorCooldown = Math.min(mapPerkState.meteorCooldown, 60); return true;
    }
  }
  if (key === 'city') {
    if (mapPerkState.carSpawnCd !== undefined) {
      mapPerkState.carSpawnCd = Math.min(mapPerkState.carSpawnCd, 60); return true;
    }
    if (mapPerkState.carCooldown !== undefined) {
      mapPerkState.carCooldown = Math.min(mapPerkState.carCooldown, 60); return true;
    }
  }
  if (key === 'lava' || key === 'creator') {
    if (mapPerkState.eruptCooldown !== undefined) {
      mapPerkState.eruptCooldown = Math.min(mapPerkState.eruptCooldown, 60); return true;
    }
  }
  if (key === 'ice') {
    if (!mapPerkState.blizzardActive && mapPerkState.blizzardTimer !== undefined) {
      mapPerkState.blizzardTimer = Math.min(mapPerkState.blizzardTimer, 60); return true;
    }
  }
  return false;
}

// Dramatic camera punch — brief zoom-in to heighten drama
function _directorCameraPunch(strength) {
  if (typeof camHitZoomTimer === 'number')
    camHitZoomTimer = Math.max(camHitZoomTimer, strength || 10);
}

// Core per-frame update (called from gameLoop with dt ≈ 1/60)
function updateDirector(deltaSeconds) {
  if (!gameRunning || !currentArena) return;
  const dt = deltaSeconds || 0;

  // ── Intensity decay ───────────────────────────────────────
  // Decays at 0.025/s normally; faster during boss/trueform to keep it fresh
  const decayRate = (gameMode === 'boss' || gameMode === 'trueform') ? 0.018 : 0.025;
  director.intensity = Math.max(0, director.intensity - decayRate * dt);

  // ── Smooth metric updates ─────────────────────────────────
  director._timeSinceHit++;
  // EMA decay on recent damage
  director._recentDmg = Math.max(0, director._recentDmg - 0.0008);

  // Track lowest non-boss player HP (only in non-boss modes or 2P fights)
  if (gameMode !== 'boss' && gameMode !== 'trueform') {
    const alive = players.filter(p => !p.isBoss && p.health > 0);
    if (alive.length > 0) {
      director._playerMinHp = Math.min(...alive.map(p => p.health / p.maxHealth));
      if (director._playerMinHp < 0.25 && !director._lastMinHpLow) {
        director._lastMinHpLow = frameCount;
        // Urgent: boost intensity when someone is nearly dead
        director.intensity = Math.min(1, director.intensity + 0.25);
      }
      if (director._playerMinHp >= 0.3) director._lastMinHpLow = 0;
    }
  }

  // ── Player spacing analysis ───────────────────────────────
  let distanceBetweenPlayers = 0;
  const alivePlayers = players.filter(p => !p.isBoss && p.health > 0);
  if (alivePlayers.length >= 2) {
    const a = alivePlayers[0], b = alivePlayers[1];
    distanceBetweenPlayers = Math.hypot(a.cx() - b.cx(), a.cy() - b.cy());
  }

  // ── Event trigger ─────────────────────────────────────────
  const nowFrame  = frameCount || 0;
  const timeSince = nowFrame - director.lastEventFrame;
  const canTrigger = timeSince >= director.eventCooldownFrames;

  if (canTrigger) {
    const lowIntensity  = director.intensity < 0.35;
    const longIdle      = director._timeSinceHit > 360;        // 6 s without a hit
    const tooFarApart   = distanceBetweenPlayers > GAME_W * 0.72;
    const slowMatch     = director._recentDmg < 0.05 && timeSince > 900;

    if (lowIntensity || tooFarApart || longIdle || slowMatch) {
      let fired = false;

      // Boss / TrueForm modes: use TF arena hazard nudges
      if (!fired && (gameMode === 'boss' || gameMode === 'trueform')) {
        fired = directorSpawnHazard();
        if (!fired) { _directorCameraPunch(14); fired = true; }
      }

      // Themed arena mini-bosses
      if (!fired && currentArenaKey === 'forest') fired = directorSpawnMiniBoss('forestBeast');
      if (!fired && currentArenaKey === 'ice')    fired = directorSpawnMiniBoss('yeti');

      // Generic arena hazard acceleration
      if (!fired) fired = directorSpawnHazard();

      // Players are far apart: dramatic zoom-out + intensity spike to force engagement
      if (!fired && tooFarApart) {
        director.intensity = Math.min(1, director.intensity + 0.20);
        _directorCameraPunch(18);
        fired = true;
      }

      // Fallback: camera punch always works
      if (!fired) { _directorCameraPunch(12); fired = true; }

      if (fired) director.lastEventFrame = nowFrame;
    }
  }

  // ── Music integration ─────────────────────────────────────
  if (gameMode === 'boss' || gameMode === 'trueform') {
    if (director.lastMusicState !== 'boss') {
      MusicManager.playBoss();
      director.lastMusicState = 'boss';
    }
  } else {
    if (director.intensity > 0.65 && director.lastMusicState !== 'high') {
      MusicManager.playBoss();
      director.lastMusicState = 'high';
    } else if (director.intensity < 0.28 && director.lastMusicState !== 'normal') {
      MusicManager.playNormal();
      director.lastMusicState = 'normal';
    }
  }
}
