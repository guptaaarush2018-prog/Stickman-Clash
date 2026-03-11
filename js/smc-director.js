'use strict';

// ============================================================
// GAME DIRECTOR — dynamic pacing & event controller
// ============================================================
// Tracks match intensity and occasionally spawns mini-bosses / hazards
// and adjusts music/camera to keep fights feeling dynamic.

const DIRECTOR_EVENT_COOLDOWN_FRAMES = 20 * 60; // 20 seconds @ 60fps

let director = {
  intensity: 0,            // 0–1, how chaotic the fight currently is
  lastEventFrame: 0,       // frameCount when the last director event fired
  eventCooldownFrames: DIRECTOR_EVENT_COOLDOWN_FRAMES,
  lastMusicState: null,    // 'normal' | 'high' | 'boss'
};

function resetDirector() {
  director.intensity       = 0;
  director.lastEventFrame  = frameCount || 0;
  director.eventCooldownFrames = DIRECTOR_EVENT_COOLDOWN_FRAMES;
  director.lastMusicState  = null;
}

// Lightweight helper to add intensity from gameplay events (damage, explosions, etc.)
function directorAddIntensity(amount) {
  if (!gameRunning || !currentArena) return;
  if (!amount) return;
  director.intensity = Math.max(0, Math.min(1, director.intensity + amount));
}

// Spawn helpers so the Director can reuse existing mini-boss logic
function directorSpawnMiniBoss(kind) {
  if (!gameRunning || !currentArena) return false;
  if (kind === 'forestBeast') {
    if (currentArenaKey !== 'forest') return false;
    if (typeof spawnForestBeastNow === 'function' && !forestBeast && forestBeastCooldown <= 0) {
      spawnForestBeastNow();
      return true;
    }
    return false;
  }
  if (kind === 'yeti') {
    if (currentArenaKey !== 'ice') return false;
    if (typeof spawnYetiNow === 'function' && !yeti && yetiCooldown <= 0) {
      spawnYetiNow();
      return true;
    }
    return false;
  }
  return false;
}

// Arena hazard nudges — make the next hazard happen sooner without overriding its rules
function directorSpawnHazard() {
  if (!gameRunning || !currentArena) return false;
  const key = currentArenaKey;
  // Space: meteors
  if (key === 'space') {
    if (mapPerkState.meteorCooldown !== undefined) {
      mapPerkState.meteorCooldown = Math.min(mapPerkState.meteorCooldown, 60);
      return true;
    }
  }
  // City: cars
  if (key === 'city') {
    if (mapPerkState.carSpawnCd !== undefined) {
      mapPerkState.carSpawnCd = Math.min(mapPerkState.carSpawnCd, 60);
      return true;
    }
    if (mapPerkState.carCooldown !== undefined) {
      mapPerkState.carCooldown = Math.min(mapPerkState.carCooldown, 60);
      return true;
    }
  }
  // Lava/creator: eruptions
  if (key === 'lava' || key === 'creator') {
    if (mapPerkState.eruptCooldown !== undefined) {
      mapPerkState.eruptCooldown = Math.min(mapPerkState.eruptCooldown, 60);
      return true;
    }
  }
  // Ice: blizzard gusts
  if (key === 'ice') {
    if (!mapPerkState.blizzardActive && mapPerkState.blizzardTimer !== undefined) {
      mapPerkState.blizzardTimer = Math.min(mapPerkState.blizzardTimer, 60);
      return true;
    }
  }
  return false;
}

// Core per-frame update
// deltaSeconds is approximate real time per frame (e.g. 1/60).
function updateDirector(deltaSeconds) {
  if (!gameRunning || !currentArena) return;

  // --- Intensity decay ---
  const decay = 0.02 * (deltaSeconds || 0); // Matches spec: intensity -= dt * 0.02
  if (decay > 0) {
    director.intensity = Math.max(0, director.intensity - decay);
  }

  // --- Player spacing analysis ---
  let distanceBetweenPlayers = 0;
  const alivePlayers = players.filter(p => !p.isBoss && p.health > 0);
  if (alivePlayers.length >= 2) {
    const p1 = alivePlayers[0];
    const p2 = alivePlayers[1];
    const dx = p1.cx() - p2.cx();
    const dy = p1.cy() - p2.cy();
    distanceBetweenPlayers = Math.hypot(dx, dy);
  }

  // --- Event triggers (mini-boss / hazards / camera punch) ---
  const nowFrame = frameCount || 0;
  const timeSince = nowFrame - director.lastEventFrame;
  const canTrigger = timeSince >= director.eventCooldownFrames;

  if (canTrigger) {
    const lowIntensity = director.intensity < 0.4;
    const tooFarApart = distanceBetweenPlayers > GAME_W * 0.75;
    if (lowIntensity || tooFarApart) {
      let fired = false;
      // Prefer mini-boss events on themed arenas
      if (!fired && currentArenaKey === 'forest') {
        fired = directorSpawnMiniBoss('forestBeast');
      }
      if (!fired && currentArenaKey === 'ice') {
        fired = directorSpawnMiniBoss('yeti');
      }
      // Otherwise, gently advance the next arena hazard
      if (!fired) {
        fired = directorSpawnHazard();
      }
      // Fallback: small cinematic camera punch to heighten drama
      if (!fired && typeof camHitZoomTimer === 'number') {
        camHitZoomTimer = Math.max(camHitZoomTimer, 10);
        fired = true;
      }
      if (fired) {
        director.lastEventFrame = nowFrame;
      }
    }
  }

  // --- Music integration ---
  // Boss / True Form always use boss music; Director only adjusts intensity in other modes.
  if (gameMode === 'boss' || gameMode === 'trueform') {
    if (director.lastMusicState !== 'boss') {
      MusicManager.playBoss();
      director.lastMusicState = 'boss';
    }
  } else {
    if (director.intensity > 0.7 && director.lastMusicState !== 'high') {
      // Reuse boss track as high-intensity theme in regular matches.
      MusicManager.playBoss();
      director.lastMusicState = 'high';
    } else if (director.intensity < 0.3 && director.lastMusicState !== 'normal') {
      MusicManager.playNormal();
      director.lastMusicState = 'normal';
    }
  }
}

