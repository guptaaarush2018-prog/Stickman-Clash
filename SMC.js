'use strict';

// ============================================================
// CANVAS
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;

// ============================================================
// GLOBAL STATE
// ============================================================
let gameMode        = '2p';
let selectedArena   = 'grass';
let chosenLives     = 3;
let gameRunning     = false;
let paused          = false;
let players         = [];
let minions         = [];    // boss-spawned minions
let bossBeams       = [];    // boss beam attacks (warning + active)
let bossSpikes      = [];    // boss spike attacks rising from floor
let infiniteMode    = false; // if true, no game over — just win counter
let trainingMode    = false; // training mode flag
let trainingDummies = [];    // training dummies/bots
let winsP1 = 0, winsP2 = 0;
let bossDialogue    = { text: '', timer: 0 }; // speech bubble above boss
let projectiles        = [];
let particles          = [];
let damageTexts        = [];
let respawnCountdowns  = [];  // { color, x, y, framesLeft }
let screenShake     = 0;

let backstagePortals = [];    // {x,y,type,phase,timer,radius,maxRadius,codeChars,done}
let bossDeathScene   = null;  // boss defeat animation state
let fakeDeath       = { triggered: false, active: false, timer: 0, player: null };
let bossTwoPlayer   = false;
let mapItems        = [];   // arena-perk pickups
let randomWeaponPool = null; // null = use all; Set of weapon keys
let randomClassPool  = null; // null = use all; Set of class keys

// Boss fight floor hazard state machine
let bossFloorState = 'normal';  // 'normal' | 'warning' | 'hazard'
let bossFloorType  = 'lava';    // 'lava' | 'void'
let bossFloorTimer = 1500;      // frames until next state transition

// User-configurable settings (toggled from menu)
const settings = { particles: true, screenShake: true, dmgNumbers: true, landingDust: true };
let frameCount      = 0;
let currentArena    = null;  // the arena data object
let currentArenaKey = 'grass';

// Pre-generated bg elements (so they don't flicker each frame)
let bgStars     = [];
let bgBuildings = [];

// Arena order (used for menu background cycling)
const ARENA_KEYS_ORDERED = ['grass', 'city', 'space', 'lava', 'forest', 'ice', 'ruins'];

// Menu background cycling state
let menuBgArenaIdx   = 0;
let menuBgTimer      = 0;
let menuBgFade       = 0;      // 0→1 fade to black, 1→2 fade from black
let menuBgFrameCount = 0;
let menuLoopRunning  = false;

// ============================================================
// ARENA DEFINITIONS
// ============================================================
const ARENAS = {
  grass: {
    sky:         ['#68c0ea', '#aadaf5'],
    groundColor: '#4a8f3f',
    platColor:   '#5aae4e',
    platEdge:    '#3a7030',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x:   0, y: 480, w: 900, h: 40 }, // ground
      { x: 370, y: 265, w: 160, h: 18 }, // centre top
      { x: 175, y: 345, w: 165, h: 18 }, // left mid
      { x: 560, y: 345, w: 165, h: 18 }, // right mid
      { x:  30, y: 228, w: 115, h: 16 }, // far-left high
      { x: 755, y: 228, w: 115, h: 16 }, // far-right high
    ]
  },
  lava: {
    sky:            ['#1a0000', '#3d0800'],
    groundColor:    '#ff4500',
    platColor:      '#6b2b0a',
    platEdge:       '#8b3a0f',
    hasLava:        true,
    isHeavyGravity: true,
    lavaY:       442,
    deathY:      580,
    platforms: [
      { x: 360, y: 188, w: 180, h: 18 }, // top centre
      { x: 178, y: 278, w: 140, h: 18 }, // upper left
      { x: 582, y: 278, w: 140, h: 18 }, // upper right
      { x:  45, y: 362, w: 165, h: 18 }, // lower left
      { x: 690, y: 362, w: 165, h: 18 }, // lower right
      { x: 328, y: 348, w: 244, h: 18 }, // centre bridge
    ]
  },
  space: {
    sky:          ['#000010', '#000830'],
    groundColor:  '#2a2a4a',
    platColor:    '#3a3a6a',
    platEdge:     '#5a5a9a',
    hasLava:      false,
    deathY:       640,
    isLowGravity: true,
    platforms: [
      { x:   0, y: 480, w: 900, h: 40 }, // floor
      { x: 355, y: 255, w: 190, h: 15 }, // centre top
      { x: 145, y: 332, w: 165, h: 15 }, // left mid
      { x: 590, y: 332, w: 165, h: 15 }, // right mid
      { x:  22, y: 245, w: 105, h: 15 }, // far-left
      { x: 773, y: 245, w: 105, h: 15 }, // far-right
    ]
  },
  city: {
    sky:         ['#060614', '#121228'],
    groundColor: '#222233',
    platColor:   '#33334a',
    platEdge:    '#55556a',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x:   0, y: 438, w: 235, h: 82 }, // left building
      { x: 333, y: 458, w: 234, h: 62 }, // centre building
      { x: 665, y: 438, w: 235, h: 82 }, // right building
      { x:  52, y: 338, w: 132, h: 15 }, // left mid
      { x: 372, y: 322, w: 156, h: 15 }, // centre mid
      { x: 716, y: 338, w: 132, h: 15 }, // right mid
      { x: 198, y: 238, w: 122, h: 15 }, // left high
      { x: 580, y: 238, w: 122, h: 15 }, // right high
    ]
  },
  creator: {
    sky:         ['#050010', '#180030'],
    groundColor: '#1a0028',
    platColor:   '#3a0055',
    platEdge:    '#9900ee',
    hasLava:     false,
    deathY:      640,
    isBossArena: true,
    platforms: [
      { x: 0,   y: 460, w: 900, h: 60, isFloor: true, isFloorDisabled: false },
      { x: 300, y: 270, w: 300, h: 18, ox: 300, oscX: 80,  oscSpeed: 0.013, oscPhase: 0.0 },
      { x: 60,  y: 345, w: 150, h: 18, ox: 60,  oscX: 35,  oscSpeed: 0.019, oscPhase: 1.0 },
      { x: 690, y: 345, w: 150, h: 18, ox: 690, oscX: 35,  oscSpeed: 0.019, oscPhase: 2.1 },
      { x: 185, y: 220, w: 130, h: 18, oy: 220, oscY: 28,  oscSpeed: 0.022, oscPhase: 0.5 },
      { x: 585, y: 220, w: 130, h: 18, oy: 220, oscY: 28,  oscSpeed: 0.022, oscPhase: 1.6 },
      { x: 375, y: 155, w: 150, h: 18 },
    ]
  },
  forest: {
    sky:         ['#1a4020', '#2d6b3a'],
    groundColor: '#2a5a20',
    platColor:   '#4a8a38',
    platEdge:    '#2a5a18',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x:   0, y: 480, w: 900, h: 40 },
      { x: 340, y: 270, w: 220, h: 18 },
      { x: 120, y: 345, w: 145, h: 18 },
      { x: 635, y: 345, w: 145, h: 18 },
      { x:  18, y: 215, w: 110, h: 16 },
      { x: 772, y: 215, w: 110, h: 16 },
      { x: 375, y: 178, w: 150, h: 16 },
    ]
  },
  ice: {
    sky:         ['#99c8e8', '#cce8f8'],
    groundColor: '#b8d8ee',
    platColor:   '#7ab0d0',
    platEdge:    '#5090b8',
    hasLava:     false,
    deathY:      640,
    isIcy:       true,
    platforms: [
      { x:   0, y: 460, w: 900, h: 60 },
      { x: 310, y: 285, w: 280, h: 16 },
      { x:  70, y: 360, w: 170, h: 16 },
      { x: 660, y: 360, w: 170, h: 16 },
      { x: 185, y: 225, w: 130, h: 16 },
      { x: 585, y: 225, w: 130, h: 16 },
    ]
  },
  ruins: {
    sky:         ['#1f1008', '#3a2418'],
    groundColor: '#7a6445',
    platColor:   '#8a7455',
    platEdge:    '#5a4432',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x:   0, y: 440, w: 260, h: 80 },
      { x: 320, y: 440, w: 260, h: 80 },
      { x: 640, y: 440, w: 260, h: 80 },
      { x:  90, y: 330, w: 145, h: 18 },
      { x: 665, y: 330, w: 145, h: 18 },
      { x: 360, y: 260, w: 180, h: 18 },
      { x: 195, y: 200, w: 120, h: 15 },
      { x: 585, y: 200, w: 120, h: 15 },
    ]
  }
};

// ============================================================
// ARENA LAYOUT RANDOMIZATION
// ============================================================
// Stores base platform positions per arena for randomization reference
const ARENA_BASE_PLATFORMS = {};
for (const key of Object.keys(ARENAS)) {
  if (key === 'creator') continue; // boss arena — never randomize
  ARENA_BASE_PLATFORMS[key] = ARENAS[key].platforms.map(p => ({ ...p }));
}

function randomizeArenaLayout(key) {
  if (key === 'creator') return; // never randomize boss arena
  const base  = ARENA_BASE_PLATFORMS[key];
  if (!base) return;
  const arena = ARENAS[key];
  arena.platforms = base.map((p, idx) => {
    if (idx === 0) return { ...p }; // always keep ground platform fixed
    // Randomize within ±70px x, ±45px y (except ground)
    return {
      ...p,
      x: Math.max(10, Math.min(canvas.width - p.w - 10, p.x + (Math.random() - 0.5) * 140)),
      y: Math.max(80, Math.min(440, p.y + (Math.random() - 0.5) * 90))
    };
  });
}

// ============================================================
// MAP PERKS — per-arena special item/event state
// ============================================================
const MAP_PERK_DEFS = {
  ruins: {
    items: [
      { baseX: 135, baseY: 400 },  // on left block
      { baseX: 450, baseY: 400 },  // on center block
      { baseX: 765, baseY: 400 },  // on right block
    ],
    types: ['speed','power','heal','shield']
  },
  forest: {
    healZones: [{ x: 0, w: 900, healRate: 60 }]  // gentle healing every 60 frames
  },
  city: {
    carCooldown: 600  // frames between car runs
  },
  lava: {
    eruptionCooldown: 480
  }
};

let mapPerkState = {};  // runtime state per arena

function initMapPerks(key) {
  mapItems    = [];
  mapPerkState = {};
  if (key === 'ruins') {
    const def = MAP_PERK_DEFS.ruins;
    for (const pos of def.items) {
      mapItems.push({
        x: pos.baseX, y: pos.baseY - 22,
        type: def.types[Math.floor(Math.random() * def.types.length)],
        collected: false, respawnIn: 0, radius: 14, animPhase: Math.random() * Math.PI * 2
      });
    }
  }
  if (key === 'city') {
    mapPerkState.carCooldown = MAP_PERK_DEFS.city.carCooldown;
    mapPerkState.cars        = [];
  }
  if (key === 'lava') {
    mapPerkState.eruptCooldown = MAP_PERK_DEFS.lava.eruptionCooldown;
    mapPerkState.eruptions     = [];
  }
}

function updateMapPerks() {
  if (!currentArena || !gameRunning) return;

  // ---- RUINS: Artifact pickups ----
  if (currentArenaKey === 'ruins') {
    for (const item of mapItems) {
      item.animPhase += 0.06;
      if (item.collected) {
        item.respawnIn--;
        if (item.respawnIn <= 0) {
          item.collected = false;
          item.type = MAP_PERK_DEFS.ruins.types[Math.floor(Math.random() * 4)];
        }
        continue;
      }
      // Check proximity
      for (const p of players) {
        if (p.isBoss || p.health <= 0) continue;
        const dx = p.cx() - item.x, dy = (p.y + p.h/2) - item.y;
        if (Math.hypot(dx, dy) < 28) {
          item.collected  = true;
          item.respawnIn  = 1800 + Math.random() * 600; // 30–40 s
          applyMapPerk(p, item.type);
          spawnParticles(item.x, item.y, '#ffd700', 16);
          screenShake = Math.max(screenShake, 6);
          if (settings.dmgNumbers) {
            const labels = { speed:'SWIFT!', power:'POWER!', heal:'+30 HP', shield:'SHIELD!' };
            damageTexts.push(new DamageText(item.x, item.y - 20, labels[item.type] || '!', '#ffd700'));
          }
          break;
        }
      }
    }
  }

  // ---- FOREST: Gradual healing ----
  if (currentArenaKey === 'forest' && frameCount % 90 === 0) {
    for (const p of players) {
      if (p.isBoss || p.health <= 0 || p.hurtTimer > 0) continue;
      if (p.onGround && p.health < p.maxHealth) {
        p.health = Math.min(p.maxHealth, p.health + 1);
        if (settings.particles && Math.random() < 0.4) {
          spawnParticles(p.cx(), p.y, '#44ff44', 3);
        }
      }
    }
  }

  // ---- CITY: Occasional car ----
  if (currentArenaKey === 'city') {
    if (mapPerkState.carCooldown > 0) {
      mapPerkState.carCooldown--;
    } else {
      // Spawn a car
      const fromLeft = Math.random() < 0.5;
      mapPerkState.cars.push({ x: fromLeft ? -60 : canvas.width + 60, y: 432,
        vx: fromLeft ? 9 : -9, warned: false, warnTimer: 60 });
      mapPerkState.carCooldown = 1200 + Math.floor(Math.random() * 800);
    }
    if (!mapPerkState.cars) mapPerkState.cars = [];
    for (let ci = mapPerkState.cars.length - 1; ci >= 0; ci--) {
      const car = mapPerkState.cars[ci];
      if (car.warnTimer > 0) { car.warnTimer--; continue; }
      car.x += car.vx;
      if (car.x < -120 || car.x > canvas.width + 120) {
        mapPerkState.cars.splice(ci, 1); continue;
      }
      // Damage players in path
      for (const p of players) {
        if (p.health <= 0 || p.invincible > 0) continue;
        if (Math.abs(p.cx() - car.x) < 40 && Math.abs((p.y + p.h) - car.y) < 60) {
          dealDamage(players.find(q => q.isBoss) || players[1], p, 18, 16);
        }
      }
    }
  }

  // ---- LAVA: Eruptions ----
  if (currentArenaKey === 'lava') {
    if (!mapPerkState.eruptCooldown) mapPerkState.eruptCooldown = 480;
    if (!mapPerkState.eruptions)     mapPerkState.eruptions     = [];
    mapPerkState.eruptCooldown--;
    if (mapPerkState.eruptCooldown <= 0) {
      const ex = 60 + Math.random() * 780;
      mapPerkState.eruptions.push({ x: ex, timer: 80 });
      mapPerkState.eruptCooldown = 480 + Math.floor(Math.random() * 480);
    }
    for (let ei = mapPerkState.eruptions.length - 1; ei >= 0; ei--) {
      const er = mapPerkState.eruptions[ei];
      er.timer--;
      if (er.timer <= 0) { mapPerkState.eruptions.splice(ei, 1); continue; }
      if (er.timer % 5 === 0 && settings.particles) {
        const upA = -Math.PI/2 + (Math.random()-0.5)*0.5;
        particles.push({ x: er.x, y: currentArena.lavaY || 442,
          vx: Math.cos(upA)*5, vy: Math.sin(upA)*(8+Math.random()*8),
          color: Math.random() < 0.5 ? '#ff4400' : '#ff8800',
          size: 3+Math.random()*4, life: 30+Math.random()*20, maxLife: 50 });
      }
      // Damage nearby players
      for (const p of players) {
        if (p.isBoss || p.health <= 0 || p.invincible > 0) continue;
        if (Math.abs(p.cx() - er.x) < 40 && p.y + p.h > (currentArena.lavaY || 442) - 80) {
          if (er.timer % 10 === 0) dealDamage(players.find(q => q.isBoss) || players[1], p, 10, 8);
        }
      }
    }
  }
}

function applyMapPerk(player, type) {
  if (type === 'heal') {
    player.health = Math.min(player.maxHealth, player.health + 30);
  } else if (type === 'speed') {
    player._speedBuff = 360; // 6 seconds
  } else if (type === 'power') {
    player._powerBuff = 360;
  } else if (type === 'shield') {
    player.invincible = Math.max(player.invincible, 180);
    spawnParticles(player.cx(), player.cy(), '#88ddff', 20);
  }
}

function drawMapPerks() {
  // ---- RUINS artifacts ----
  if (currentArenaKey === 'ruins') {
    for (const item of mapItems) {
      if (item.collected) continue;
      const bob   = Math.sin(item.animPhase) * 5;
      const glow  = 0.6 + Math.sin(item.animPhase * 1.3) * 0.3;
      const colors = { speed:'#44aaff', power:'#ff4422', heal:'#44ff88', shield:'#88ddff' };
      const glowC  = colors[item.type] || '#ffd700';
      ctx.save();
      ctx.shadowColor = glowC;
      ctx.shadowBlur  = 12 * glow;
      ctx.fillStyle   = glowC;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      // Icon letter
      ctx.fillStyle   = '#000';
      ctx.shadowBlur  = 0;
      ctx.font        = 'bold 10px Arial';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      const icons = { speed:'\u26a1', power:'\ud83d\udca5', heal:'\u2764', shield:'\ud83d\udee1' };
      ctx.fillText(icons[item.type] || '?', item.x, item.y + bob);
      ctx.restore();
    }
  }

  // ---- CITY cars ----
  if (currentArenaKey === 'city' && mapPerkState.cars) {
    for (const car of mapPerkState.cars) {
      if (car.warnTimer > 0) {
        // Warning arrow
        const wx = car.vx > 0 ? 20 : canvas.width - 20;
        ctx.save();
        ctx.globalAlpha = Math.sin(frameCount * 0.3) * 0.5 + 0.5;
        ctx.fillStyle   = '#ff4400';
        ctx.font        = 'bold 18px Arial';
        ctx.textAlign   = 'center';
        ctx.fillText(car.vx > 0 ? '\u25b6 CAR!' : 'CAR! \u25c0', wx, car.y - 20);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.fillStyle = '#cc3300';
      ctx.fillRect(car.x - 30, car.y - 24, 60, 24);
      ctx.fillStyle = '#ff5500';
      ctx.fillRect(car.x - 24, car.y - 38, 48, 16);
      ctx.fillStyle = '#ffee88';
      ctx.fillRect(car.vx > 0 ? car.x + 26 : car.x - 34, car.y - 20, 8, 8);
      ctx.restore();
    }
  }
}

// ============================================================
// WEAPON DEFINITIONS
// ============================================================
const WEAPONS = {
  sword: {
    // Fast gap-closer. Good damage, moderate reach.
    name: 'Sword',   damage: 18, range: 74, cooldown: 28,
    kb: 11,          abilityCooldown: 140, type: 'melee', color: '#cccccc',
    abilityName: 'Dash Slash',
    ability(user, target) {
      user.vx = user.facing * 18;
      if (dist(user, target) < 140) dealDamage(user, target, 36, 18);
    }
  },
  hammer: {
    // Devastating but very slow. Short range forces commitment.
    name: 'Hammer',  damage: 28, range: 54, cooldown: 50,
    kb: 20,          abilityCooldown: 210, type: 'melee', color: '#888888',
    abilityName: 'Ground Slam',
    ability(user, target) {
      screenShake = Math.max(screenShake, 32);
      spawnRing(user.cx(), user.y + user.h);
      if (dist(user, target) < 145) dealDamage(user, target, 34, 26);
    }
  },
  gun: {
    // Ranged weapon. Each bullet deals 5–8 random damage.
    name: 'Gun',     damage: 10, range: 600, cooldown: 32,
    damageFunc: () => Math.floor(Math.random() * 4) + 5,
    superRateBonus: 2.8,
    kb: 6,           abilityCooldown: 150, type: 'ranged', color: '#666666',
    abilityName: 'Rapid Fire',
    ability(user, _target) {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          if (!gameRunning || user.health <= 0) return;
          spawnBullet(user, 14 + (Math.random()-0.5)*2, '#ffdd00');
        }, i * 80);
      }
    }
  },
  axe: {
    // Balanced all-rounder. Spin ability covers both sides.
    name: 'Axe',     damage: 22, range: 70, cooldown: 36,
    kb: 14,          abilityCooldown: 150, type: 'melee', color: '#cc4422',
    abilityName: 'Spin Attack',
    ability(user, target) {
      user.spinning = 30;
      if (dist(user, target) < 120) dealDamage(user, target, 30, 18);
    }
  },
  spear: {
    // Longest reach, consistent damage. Rewards spacing.
    name: 'Spear',   damage: 18, range: 105, cooldown: 28,
    kb: 10,          abilityCooldown: 155, type: 'melee', color: '#8888ff',
    abilityName: 'Lunge',
    ability(user, target) {
      user.vx = user.facing * 16;
      user.vy = -6;
      if (dist(user, target) < 155) dealDamage(user, target, 30, 15);
    }
  },
  gauntlet: {
    // Boss-only weapon. Low base contact damage, massive void slam ability.
    name: 'Gauntlet', damage: 5, range: 34, cooldown: 22,
    kb: 10,            abilityCooldown: 200, type: 'melee', color: '#9900ee',
    contactDmgMult: 0.4,
    abilityName: 'Void Slam',
    ability(user, _target) {
      screenShake = Math.max(screenShake, 28);
      spawnRing(user.cx(), user.cy());
      spawnRing(user.cx(), user.cy());
      for (const p of players) {
        if (p === user || p.health <= 0) continue;
        if (dist(user, p) < 165) dealDamage(user, p, 30, 40);
      }
      // Also hit training dummies
      for (const d of trainingDummies) {
        if (d.health <= 0) continue;
        if (dist(user, d) < 165) dealDamage(user, d, 7, 40);
      }
    }
  }
};

const WEAPON_KEYS = Object.keys(WEAPONS).filter(k => k !== 'gauntlet');

// ============================================================
// CHARACTER CLASSES
// ============================================================
const CLASSES = {
  none:   { name: 'None',     emoji: '⚔️', desc: 'Standard balanced fighter',       weapon: null,     hp: 100, speedMult: 1.00, perk: null        },
  thor:   { name: 'Thor',     emoji: '⚡', desc: 'Hammer master, thunder on dash',  weapon: 'hammer', hp: 115, speedMult: 0.90, perk: 'thunder'   },
  kratos: { name: 'Kratos',   emoji: '🪓', desc: 'Axe specialist, rage on hit',     weapon: 'axe',    hp: 125, speedMult: 0.92, perk: 'rage'      },
  ninja:  { name: 'Ninja',    emoji: '🗡️', desc: 'Fast sword fighter, quick dash',  weapon: 'sword',  hp: 80,  speedMult: 1.22, perk: 'swift'     },
  gunner: { name: 'Gunner',   emoji: '🔫', desc: 'Dual-shot gunslinger',            weapon: 'gun',    hp: 95,  speedMult: 1.05, perk: 'dual_shot' },
};

// ============================================================
// WEAPON & CLASS DESCRIPTIONS  (shown in menu sidebar)
// ============================================================
const WEAPON_DESCS = {
  random:  { title: '🎲 Random Weapon',  what: 'Picks a random weapon each game — embrace the chaos.',                                                        ability: null,                                                    super: null,                                                      how:  'Adapt to whatever you get each round.' },
  sword:   { title: '⚔️ Sword',          what: 'Fast, balanced melee weapon with good range.',                                                                 ability: 'Q — Dash Slash: dashes forward and slices for 36 dmg.',  super: 'E — Power Thrust: massive forward lunge for 60 dmg.',      how:  'Great all-rounder. Use Dash Slash to chase and punish.' },
  hammer:  { title: '🔨 Hammer',         what: 'Slow but devastating. Huge knockback on every hit.',                                                           ability: 'Q — Ground Slam: shockwave AoE around you for 34 dmg.',  super: 'E — Mega Slam: screen-shaking AoE crush for 58 dmg.',      how:  'Get close, be patient, then smash hard.' },
  gun:     { title: '🔫 Gun',            what: 'Ranged weapon. Each bullet deals 5–8 damage. Super deals 9–12.',                                               ability: 'Q — Rapid Fire: 5-shot burst.',                          super: 'E — Bullet Storm: 14 rapid shots (9–12 dmg each).',        how:  'Keep your distance. Use Rapid Fire to pressure from afar.' },
  axe:     { title: '🪓 Axe',            what: 'Balanced melee with solid damage and good knockback.',                                                          ability: 'Q — Spin Attack: 360° slash that hits both sides.',       super: 'E — Berserker Spin: long spinning AoE for 52 dmg.',        how:  'Use Spin Attack in tight spots to cover all angles.' },
  spear:   { title: '🗡️ Spear',          what: 'Longest melee reach in the game. Rewards good spacing.',                                                       ability: 'Q — Lunge: leap forward with the spear for 30 dmg.',     super: 'E — Sky Piercer: aerial forward lunge for 50 dmg.',        how:  'Stay at optimal range. Poke safely from afar.' },
};

const CLASS_DESCS = {
  none:   { title: '⚔️ No Class',  what: 'No class modifier. Full freedom of weapon choice.',                                                                   perk: null,                                                                                                                        how:  'Choose any weapon — pure skill matters.' },
  thor:   { title: '⚡ Thor',      what: 'Hammer master. Slower movement but powerful strikes. Forces Hammer.',                                                  perk: '🌩️ Lightning Storm (≤20% HP, once): Summons 3 lightning bolts on the enemy — 8 dmg each + stun. Activates automatically.',   how:  'Tank hits to trigger the lightning perk when low. Then finish with your super.' },
  kratos: { title: '🪓 Kratos',    what: 'Axe specialist. More HP, builds rage when hit. Forces Axe.',                                                           perk: '🔥 Spartan Rage (≤15% HP, once): Auto-heals to 30% HP and boosts your damage by +50% for 5 seconds.',                        how:  'Survive the threat threshold — let the rage save you. Strike hard in the buff window.' },
  ninja:  { title: '🗡️ Ninja',     what: 'Extremely fast sword fighter. Fragile but elusive. Forces Sword.',                                                     perk: '👁 Shadow Step (≤25% HP, once): 2 seconds of full invincibility and all cooldowns instantly reset.',                          how:  'Use your speed advantage to dodge. The perk buys time to escape and counter.' },
  gunner: { title: '🔫 Gunner',    what: 'Dual-shot gunslinger — fires 2 bullets every shot. Forces Gun.',                                                       perk: '💥 Last Stand (≤20% HP, once): Fires 8 bullets in all directions for 3–5 dmg each.',                                         how:  'Keep distance at all times. The burst perk punishes enemies who close in when you\'re low.' },
};

// ============================================================
// HELPERS
// ============================================================
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function lerp(a, b, t)   { return a + (b - a) * t; }
function clamp(v, mn, mx){ return Math.max(mn, Math.min(mx, v)); }
function dist(a, b)      { return Math.hypot(a.cx() - b.cx(), (a.y + a.h/2) - (b.y + b.h/2)); }

function dealDamage(attacker, target, dmg, kbForce, stunMult = 1.0) {
  if (target.invincible > 0 || target.health <= 0) return;
  let actualDmg = (attacker && attacker.dmgMult !== undefined) ? Math.max(1, Math.round(dmg * attacker.dmgMult)) : dmg;
  // Kratos rage bonus
  if (attacker && attacker.charClass === 'kratos' && attacker.rageStacks > 0) {
    actualDmg = Math.round(actualDmg * (1 + Math.min(attacker.rageStacks, 30) * 0.015));
  }
  // Kratos: Spartan Rage active — +50% damage
  if (attacker && attacker.spartanRageTimer > 0) {
    actualDmg = Math.round(actualDmg * 1.5);
  }
  // Map perk: power buff
  if (attacker && attacker._powerBuff > 0) actualDmg = Math.round(actualDmg * 1.35);
  // Kratos: target being hit builds rage stacks
  if (target && target.charClass === 'kratos') {
    target.rageStacks = Math.min(30, (target.rageStacks || 0) + 1);
  }
  let actualKb  = kbForce;
  // Post-teleport critical hit window (boss only)
  if (attacker && attacker.isBoss && attacker.postTeleportCrit > 0) {
    if (Math.random() < 0.65) {
      actualDmg = Math.round(actualDmg * 2.2);
      spawnParticles(target.cx(), target.cy(), '#ff8800', 18);
      spawnParticles(target.cx(), target.cy(), '#ffff00', 10);
    }
  }
  if (target.shielding) {
    actualDmg = Math.max(1, Math.floor(dmg * 0.08));
    actualKb  = Math.floor(kbForce * 0.15);
    spawnParticles(target.cx(), target.cy(), '#88ddff', 6);
  } else {
    target.hurtTimer = 8;
  }
  // Boss modifier: deals double KB, takes half KB
  if (attacker.kbBonus) actualKb = Math.round(actualKb * attacker.kbBonus);
  if (target.kbResist)  actualKb = Math.round(actualKb * target.kbResist);

  // One-punch mode: training only — instantly kills on hit
  if (trainingMode && attacker && attacker.onePunchMode && !target.shielding) {
    actualDmg = target.health; // always lethal
  } else {
    // Class perk protection: can't be one-shot before their passive triggers
    if (!target.shielding && target.charClass !== 'none' && !target.classPerkUsed && target.health > 1) {
      actualDmg = Math.min(actualDmg, target.health - 1);
    }
  }
  target.health    = Math.max(0, target.health - actualDmg);
  target.invincible = 16;
  const dir        = target.cx() > attacker.cx() ? 1 : -1;
  target.vx        = dir * actualKb;
  target.vy        = -actualKb * 0.55;
  if (settings.screenShake) screenShake = Math.max(screenShake, target.shielding ? 3 : 9);
  if (!target.shielding) {
    spawnParticles(target.cx(), target.cy(), target.color, 12);
    // Chance-based stun / ragdoll (not guaranteed; boss is harder to ragdoll)
    const ragdollChance = target.kbResist ? 0.30 * target.kbResist : 0.30;
    const MAX_STUN = 90; // cap at 1.5s
    if (actualKb >= 16 && Math.random() < ragdollChance) {
      target.ragdollTimer = Math.min(70, 26 + Math.floor(actualKb * 1.6));
      target.stunTimer    = Math.min(MAX_STUN, target.ragdollTimer + 16);
      // Assign angular momentum for ragdoll spin
      target.ragdollSpin  = dir * (0.12 + Math.random() * 0.10);
    } else if (actualKb >= 8 && Math.random() < 0.45) {
      target.stunTimer    = Math.min(MAX_STUN, 18 + Math.floor(actualKb * 1.1));
    }
  }
  // Super charges for the attacker; gun charges faster via superRateBonus
  const superRate = (attacker.superChargeRate || 1) * (attacker.weapon && attacker.weapon.superRateBonus || 1);
  const prev = attacker.superReady;
  attacker.superMeter = Math.min(100, attacker.superMeter + Math.floor(actualDmg * 0.70 * superRate));
  if (!prev && attacker.superMeter >= 100) {
    attacker.superReady      = true;
    attacker.superFlashTimer = 90;
  }
  if (settings.dmgNumbers) damageTexts.push(new DamageText(target.cx(), target.y, actualDmg, target.shielding ? '#88ddff' : '#ffdd00'));
}

function spawnParticles(x, y, color, count) {
  if (!settings.particles) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      color, size: 1.5 + Math.random()*2.5, life: 18 + Math.random()*22, maxLife: 40 });
  }
}

function spawnRing(x, y) {
  if (!settings.particles) return;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(a)*7, vy: Math.sin(a)*3.5,
      color: '#ff8800', size: 3, life: 14, maxLife: 14 });
  }
}

function spawnBullet(user, speed, color, overrideDmg = null) {
  const dmg = overrideDmg !== null ? overrideDmg : (user.weapon.damageFunc ? user.weapon.damageFunc() : user.weapon.damage);
  projectiles.push(new Projectile(
    user.cx() + user.facing * 12, user.y + 22,
    user.facing * speed, 0, user, dmg, color
  ));
  // Gunner class: fire a second bullet at slight angle
  if (user.charClass === 'gunner') {
    const dmg2 = user.weapon.damageFunc ? user.weapon.damageFunc() : user.weapon.damage;
    projectiles.push(new Projectile(
      user.cx() + user.facing * 12, user.y + 26,
      user.facing * speed * 0.92, -0.8, user, dmg2, color
    ));
  }
}

// ============================================================
// PROJECTILE
// ============================================================
class Projectile {
  constructor(x, y, vx, vy, owner, damage, color) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.owner  = owner;
    this.damage = damage;
    this.color  = color;
    this.life   = 90;
    this.active = true;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.08;
    if (--this.life <= 0) { this.active = false; return; }
    // platform collision
    for (const pl of currentArena.platforms) {
      if (this.x > pl.x && this.x < pl.x+pl.w && this.y > pl.y && this.y < pl.y+pl.h) {
        this.active = false;
        spawnParticles(this.x, this.y, this.color, 4);
        return;
      }
    }
    // player collision
    for (const p of players) {
      if (p === this.owner || p.health <= 0) continue;
      if (this.x > p.x && this.x < p.x+p.w && this.y > p.y && this.y < p.y+p.h) {
        dealDamage(this.owner, p, this.damage, 7);
        this.active = false;
        spawnParticles(this.x, this.y, this.color, 6);
        return;
      }
    }
    // minion collision — player/non-minion projectiles can kill minions
    if (!this.owner.isMinion && !(this.owner instanceof Boss)) {
      for (const mn of minions) {
        if (mn.health <= 0) continue;
        if (this.x > mn.x && this.x < mn.x+mn.w && this.y > mn.y && this.y < mn.y+mn.h) {
          dealDamage(this.owner, mn, this.damage, 9);
          this.active = false;
          spawnParticles(this.x, this.y, this.color, 6);
          return;
        }
      }
    }
    // training dummy collision
    if (!this.owner.isDummy) {
      for (const dum of trainingDummies) {
        if (dum.health <= 0) continue;
        if (this.x > dum.x && this.x < dum.x+dum.w && this.y > dum.y && this.y < dum.y+dum.h) {
          dealDamage(this.owner, dum, this.damage, 9);
          this.active = false;
          spawnParticles(this.x, this.y, this.color, 6);
          return;
        }
      }
    }
  }
  draw() {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // trail
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(this.x - this.vx * 2.5, this.y, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================
// DAMAGE TEXT
// ============================================================
class DamageText {
  constructor(x, y, amount, color) {
    this.x = x; this.y = y;
    this.amount = amount;
    this.color  = color;
    this.life   = 52;
    this.vx     = (Math.random() - 0.5) * 1.5;
  }
  update() { this.y -= 1.1; this.x += this.vx; this.life--; }
  draw() {
    const a = Math.min(1, this.life / 20);
    ctx.save();
    ctx.globalAlpha   = a;
    ctx.textAlign     = 'center';
    ctx.font          = `bold ${13 + Math.min(8, Math.floor(this.amount / 10))}px Arial`;
    ctx.strokeStyle   = 'rgba(0,0,0,0.85)';
    ctx.lineWidth     = 3;
    ctx.strokeText('-' + this.amount, this.x, this.y);
    ctx.fillStyle     = this.color;
    ctx.fillText('-'  + this.amount, this.x, this.y);
    ctx.restore();
  }
}

// ============================================================
// FIGHTER
// ============================================================
class Fighter {
  constructor(x, y, color, weaponKey, controls, isAI, aiDifficulty) {
    this.x = x; this.y = y;
    this.w = 22; this.h = 60;
    this.vx = 0; this.vy = 0;
    this.color       = color;
    this.weaponKey   = weaponKey;
    this.weapon      = WEAPONS[weaponKey];
    this.controls    = controls;
    this.isAI        = isAI || false;
    this.aiDiff      = aiDifficulty || 'medium';
    this.health      = 100;
    this.maxHealth   = 100;
    this.lives       = chosenLives;
    this.kills       = 0;
    this.onGround    = false;
    this.cooldown    = 0;
    this.cooldown2   = 0;
    this.abilityCooldown  = 0;
    this.abilityCooldown2 = 0;
    this.invincible  = 0;
    this.shielding   = false;
    this.spinning    = 0;
    this.facing      = 1;
    this.state       = 'idle';
    this.attackTimer = 0;
    this.attackDuration = 12;
    this.hurtTimer    = 0;
    this.stunTimer    = 0;   // frames unable to act (stars spin overhead)
    this.ragdollTimer = 0;   // frames of limp physics (flailing limbs)
    this.weaponHit    = false; // has weapon tip dealt damage this swing?
    this.boostCooldown   = 0;  // dash / super-jump cooldown
    this.shieldCooldown  = 0;  // 30-s boost-shield cooldown
    this.shieldHoldTimer = 0;  // frames S is held this activation
    this.canDoubleJump   = false; // allows one double-jump after leaving ground
    this.superMeter      = 0;    // 0-100 super charge
    this.superReady      = false; // true when super is fully charged
    this.superFlashTimer = 0;    // countdown for "SUPER!" text above player
    this.superChargeRate = 0.5;  // halved from default — boss overrides to 3
    this.charClass      = 'none';
    this.classSpeedMult = 1.0;
    this.rageStacks     = 0;
    this.godmode        = false;
    this.backstageHiding = false;
    this.classPerkUsed   = false;  // one-time class passive; resets each life
    this.spartanRageTimer = 0;     // Kratos: frames of +50% damage boost
    this.noCooldownsActive = false;
    this.lavaBurnTimer = 0;
    this.contactDamageCooldown = 0; // frames between passive weapon contact hits
    this.ragdollAngle    = 0;    // accumulated spin angle during ragdoll
    this.ragdollSpin     = 0;    // angular velocity (rad/frame) for ragdoll tumble
    this.animTimer    = 0;
    this._speedBuff   = 0;
    this._powerBuff   = 0;
    this._maxLives    = chosenLives; // for correct heart display
    this.onePunchMode = false;       // training: kills anything in one hit
    this.target       = null;
    this.aiState     = 'chase';
    this.aiReact     = 0;
    this.spawnX      = x;
    this.spawnY      = y;
    this.name        = '';
    this.playerNum   = 1;
  }

  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }

  respawn() {
    this.x  = this.spawnX;
    this.y  = this.spawnY - 60;
    this.vx = 0; this.vy = 0;
    this.health          = 100;
    this.shielding       = false;
    this.spinning        = 0;
    this.ragdollTimer    = 0;
    this.stunTimer       = 0;
    this.weaponHit       = false;
    this.boostCooldown   = 0;
    this.shieldHoldTimer = 0;
    this.canDoubleJump   = false;
    // superMeter / superReady intentionally NOT reset — supers carry over between lives
    this.contactDamageCooldown = 0;
    this.ragdollAngle    = 0;
    this.ragdollSpin     = 0;
    this.lavaBurnTimer   = 0;
    this._speedBuff      = 0;
    this._powerBuff      = 0;
    this.classPerkUsed    = false;
    this.spartanRageTimer = 0;
    this.invincible      = 100;
    spawnParticles(this.cx(), this.cy(), this.color, 22);
  }

  // ---- UPDATE ----
  update() {
    if (this.cooldown > 0)         this.cooldown--;
    if (this.cooldown2 > 0)        this.cooldown2--;
    if (this.abilityCooldown > 0)  this.abilityCooldown--;
    if (this.abilityCooldown2 > 0) this.abilityCooldown2--;
    if (this.invincible > 0)      this.invincible--;
    if (this.attackTimer > 0)     this.attackTimer--;
    if (this.hurtTimer > 0)       this.hurtTimer--;
    if (this.stunTimer > 0)       this.stunTimer--;
    if (this.ragdollTimer > 0)    this.ragdollTimer--;
    if (this.spinning > 0)        this.spinning--;
    if (this.boostCooldown > 0)        this.boostCooldown--;
    if (this.shieldCooldown > 0)       this.shieldCooldown--;
    if (this.contactDamageCooldown > 0) this.contactDamageCooldown--;
    if (this.superFlashTimer > 0)      this.superFlashTimer--;
    if (this.spartanRageTimer > 0) this.spartanRageTimer--;
    this.animTimer++;

    if (this.noCooldownsActive) {
      this.cooldown = 0; this.cooldown2 = 0;
      this.abilityCooldown = 0; this.abilityCooldown2 = 0;
      this.shieldCooldown = 0; this.boostCooldown = 0;
    }

    // ---- RAGDOLL SPIN PHYSICS ----
    if (this.ragdollTimer > 0) {
      this.ragdollAngle += this.ragdollSpin;
      this.ragdollSpin  *= 0.97; // gradually decelerate spin
    } else {
      this.ragdollAngle = 0;
      this.ragdollSpin  = 0;
    }

    // ---- WEAPON TIP HITBOX (melee only) ----
    if (this.attackTimer > 0 && !this.weaponHit && this.weapon.type === 'melee' && this.target) {
      const tip = this.getWeaponTipPos();
      if (tip) {
        const tgt = this.target;
        const hitPad = this.isAI ? 16 : 10;
        if (tgt.health > 0 &&
            tip.x > tgt.x - hitPad && tip.x < tgt.x + tgt.w + hitPad &&
            tip.y > tgt.y - 8      && tip.y < tgt.y + tgt.h + 8) {
          dealDamage(this, tgt, this.weapon.damage, this.weapon.kb);
          this.weaponHit = true;
        }
        // Player melee also hits minions
        if (!this.weaponHit && !this.isMinion && !(this instanceof Boss)) {
          for (const mn of minions) {
            if (mn.health > 0 &&
                tip.x > mn.x - 12 && tip.x < mn.x + mn.w + 12 &&
                tip.y > mn.y     && tip.y < mn.y + mn.h) {
              dealDamage(this, mn, this.weapon.damage, this.weapon.kb);
              this.weaponHit = true;
              break;
            }
          }
        }
        // Player melee also hits training dummies
        if (!this.weaponHit && !this.isDummy) {
          for (const dum of trainingDummies) {
            if (dum.health > 0 &&
                tip.x > dum.x - 8 && tip.x < dum.x + dum.w + 8 &&
                tip.y > dum.y     && tip.y < dum.y + dum.h) {
              dealDamage(this, dum, this.weapon.damage, this.weapon.kb);
              this.weaponHit = true;
              break;
            }
          }
        }
        // Weapon bounces off platform surfaces → sparks + recoil
        if (!this.weaponHit) {
          for (const pl of currentArena.platforms) {
            if (tip.x > pl.x && tip.x < pl.x + pl.w &&
                tip.y > pl.y && tip.y < pl.y + pl.h) {
              spawnParticles(tip.x, tip.y, '#ffee88', 5);
              spawnParticles(tip.x, tip.y, '#ffffff', 3);
              screenShake = Math.max(screenShake, 5);
              this.attackTimer = Math.min(this.attackTimer, 4); // cut swing short
              this.weaponHit   = true;
              break;
            }
          }
        }
      }
    }

    // ---- PASSIVE WEAPON CONTACT (melee only, while not mid-swing) ----
    if (this.weapon.type === 'melee' && this.attackTimer === 0 &&
        this.contactDamageCooldown === 0 && this.target) {
      const tgt = this.target;
      if (tgt.health > 0 && dist(this, tgt) < this.weapon.range * 0.62) {
        const movingToward = (tgt.cx() > this.cx() && this.vx > 0.8) ||
                             (tgt.cx() < this.cx() && this.vx < -0.8);
        if (movingToward) {
          const contactMult = this.weapon.contactDmgMult !== undefined ? this.weapon.contactDmgMult : 0.25;
          dealDamage(this, tgt, Math.max(1, Math.floor(this.weapon.damage * contactMult)),
                                Math.floor(this.weapon.kb * 0.35));
          this.contactDamageCooldown = 32;
        }
      }
    }

    if (this.isAI && this.target) this.updateAI();

    // Gravity + motion (arena-specific gravity)
    const arenaGravity = currentArena.isLowGravity ? 0.28 : (currentArena.isHeavyGravity ? 0.95 : 0.65);
    this.vy += arenaGravity;
    this.x  += this.vx;
    this.y  += this.vy;

    // Friction
    const friction = (this.onGround && currentArena.isIcy) ? 0.93 : (this.onGround ? 0.78 : 0.94);
    this.vx *= friction;
    this.vx  = clamp(this.vx, -13, 13);
    const vyMax = currentArena.isLowGravity ? 10 : 19;
    this.vy  = clamp(this.vy, -20, vyMax);

    this.onGround = false;
    for (const pl of currentArena.platforms) this.checkPlatform(pl);

    // Horizontal clamp — boss arena has hard walls; other arenas allow slight off-screen
    if (currentArena.isBossArena) {
      if (this.x < 0)                        { this.x = 0;                        this.vx =  Math.abs(this.vx) * 0.25; }
      if (this.x + this.w > canvas.width)    { this.x = canvas.width - this.w;    this.vx = -Math.abs(this.vx) * 0.25; }
    } else {
      this.x = clamp(this.x, -80, canvas.width + 60);
    }

    // Death by falling / lava
    const dyY = currentArena.deathY;
    // Lava burn: damage + bounce when feet touch lava surface
    if (currentArena.hasLava && !this.isBoss && this.y + this.h > currentArena.lavaY && this.health > 0) {
      this.lavaBurnTimer++;
      if (this.vy > 0) {
        this.vy = -20; // higher bounce
        this.canDoubleJump = true; // refill double jump on lava bounce
      }
      this.vx *= 0.88;
      // Apply immediate damage on first contact and every 6 frames thereafter
      if (this.lavaBurnTimer === 1 || this.lavaBurnTimer % 6 === 0) {
        this.health = Math.max(0, this.health - 8);
        this.hurtTimer = 8;
        if (settings.particles) spawnParticles(this.cx(), this.cy(), '#ff6600', 8);
        if (settings.particles) spawnParticles(this.cx(), this.cy(), '#ffaa00', 5);
        if (settings.screenShake) screenShake = Math.max(screenShake, 4);
      }
    } else {
      this.lavaBurnTimer = 0;
    }
    // Hard death (fell off screen or health ran out from lava)
    if (this.y > dyY && this.health > 0) {
      if (this.isBoss) bossTeleport(this, true);
      else this.health = 0;
    }

    this.updateState();

    // Auto-face target
    if (this.target) this.facing = this.target.cx() > this.cx() ? 1 : -1;
    else if (Math.abs(this.vx) > 0.5) this.facing = this.vx > 0 ? 1 : -1;

    if (this.godmode) { this.health = this.maxHealth; }

    // Apply speed/power buffs from map perks
    if (this._speedBuff > 0) this._speedBuff--;
    if (this._powerBuff > 0) this._powerBuff--;

    // ---- CLASS PASSIVE PERK (fires once per life at HP threshold) ----
    if (!this.classPerkUsed && this.charClass !== 'none' && this.health > 0 && this.target) {
      const pct = this.health / this.maxHealth;

      // THOR: Lightning Storm at ≤20% HP — 3 lightning strikes on opponent
      if (this.charClass === 'thor' && pct <= 0.20) {
        this.classPerkUsed = true;
        screenShake = Math.max(screenShake, 22);
        spawnParticles(this.cx(), this.cy(), '#ffff00', 28);
        spawnParticles(this.cx(), this.cy(), '#88ddff', 14);
        const _t = this.target;
        for (let _i = 0; _i < 3; _i++) {
          setTimeout(() => {
            if (!gameRunning || _t.health <= 0) return;
            spawnParticles(_t.cx(), _t.cy(), '#ffff00', 22);
            spawnParticles(_t.cx(), _t.cy(), '#ffffff', 12);
            if (settings.screenShake) screenShake = Math.max(screenShake, 12);
            _t.health = Math.max(0, _t.health - 8);
            _t.hurtTimer = 10;
            _t.stunTimer = Math.max(_t.stunTimer, 45);
            if (settings.dmgNumbers) damageTexts.push(new DamageText(_t.cx(), _t.y, 8, '#ffff00'));
          }, _i * 350);
        }
      }

      // KRATOS: Spartan Rage at ≤15% HP — heals to 30% max HP + 5s damage boost
      if (this.charClass === 'kratos' && pct <= 0.15) {
        this.classPerkUsed = true;
        const healTarget = Math.floor(this.maxHealth * 0.30);
        const healAmt    = Math.max(0, healTarget - this.health);
        this.health       = Math.max(this.health, healTarget);
        this.spartanRageTimer = 300;
        screenShake = Math.max(screenShake, 24);
        spawnParticles(this.cx(), this.cy(), '#ff4400', 30);
        spawnParticles(this.cx(), this.cy(), '#ff8800', 18);
        spawnParticles(this.cx(), this.cy(), '#ffffff',  8);
        if (healAmt > 0 && settings.dmgNumbers)
          damageTexts.push(new DamageText(this.cx(), this.y - 20, healAmt, '#44ff44'));
      }

      // NINJA: Shadow Step at ≤25% HP — 2s invincibility + all cooldowns reset
      if (this.charClass === 'ninja' && pct <= 0.25) {
        this.classPerkUsed = true;
        this.invincible = 120;
        this.cooldown = 0; this.abilityCooldown = 0; this.shieldCooldown = 0; this.boostCooldown = 0;
        screenShake = Math.max(screenShake, 14);
        spawnParticles(this.cx(), this.cy(), '#44ff88', 30);
        spawnParticles(this.cx(), this.cy(), '#ffffff', 14);
      }

      // GUNNER: Last Stand at ≤20% HP — 8 bullets burst in all directions
      if (this.charClass === 'gunner' && pct <= 0.20) {
        this.classPerkUsed = true;
        screenShake = Math.max(screenShake, 26);
        spawnParticles(this.cx(), this.cy(), '#ff6600', 28);
        spawnParticles(this.cx(), this.cy(), '#ffaa00', 14);
        for (let _j = 0; _j < 8; _j++) {
          const _ang = (_j / 8) * Math.PI * 2;
          const _spd = 11 + Math.random() * 3;
          const _dmg = Math.floor(Math.random() * 3) + 3;
          projectiles.push(new Projectile(
            this.cx(), this.cy(),
            Math.cos(_ang) * _spd, Math.sin(_ang) * _spd,
            this, _dmg, '#ff4400'
          ));
        }
      }
    }
  }

  checkPlatform(pl) {
    if (pl.isFloorDisabled) return;
    // Broad-phase: skip if no overlap at all
    if (this.x + this.w <= pl.x || this.x >= pl.x + pl.w ||
        this.y + this.h <= pl.y || this.y >= pl.y + pl.h) return;

    // Penetration depth on each side
    const dTop    = (this.y + this.h) - pl.y;      // player bottom into platform top
    const dBottom = (pl.y + pl.h)    - this.y;     // player top  into platform bottom
    const dLeft   = (this.x + this.w) - pl.x;      // player right into platform left
    const dRight  = (pl.x + pl.w)    - this.x;     // player left  into platform right

    const minPen = Math.min(dTop, dBottom, dLeft, dRight);

    if (minPen === dTop && this.vy >= 0) {
      // Fell onto top surface
      const landVy = this.vy;
      this.y           = pl.y - this.h;
      this.vy          = 0;
      this.onGround    = true;
      this.canDoubleJump = false; // reset on landing; re-enabled by jumping
      // Landing dust — harder landing = more particles
      if (settings.landingDust && landVy > 4) {
        spawnParticles(this.cx(), pl.y, 'rgba(200,200,200,0.9)', Math.min(14, Math.floor(landVy * 1.2)));
      }
      // Stop ragdoll spin on landing
      if (this.ragdollTimer > 0 && landVy > 2) {
        spawnParticles(this.cx(), pl.y, this.color, 10);
        this.ragdollSpin = 0;
      }
    } else if (minPen === dBottom && this.vy <= 0) {
      // Bumped head on underside
      this.y  = pl.y + pl.h;
      this.vy = Math.abs(this.vy) * 0.1; // small bounce so gravity takes over
    } else if (minPen === dLeft) {
      // Hit right face of platform (player moving right)
      this.x  = pl.x - this.w;
      this.vx = Math.min(this.vx, 0);
    } else if (minPen === dRight) {
      // Hit left face of platform (player moving left)
      this.x  = pl.x + pl.w;
      this.vx = Math.max(this.vx, 0);
    }
  }

  updateState() {
    if (this.ragdollTimer > 0)         this.state = 'ragdoll';
    else if (this.hurtTimer > 0)       this.state = 'hurt';
    else if (this.stunTimer > 0)       this.state = 'stunned';
    else if (this.attackTimer > 0)     this.state = 'attacking';
    else if (this.shielding)           this.state = 'shielding';
    else if (!this.onGround)           this.state = this.vy < 0 ? 'jumping' : 'falling';
    else if (Math.abs(this.vx) > 0.7)  this.state = 'walking';
    else                               this.state = 'idle';
  }

  // Returns weapon-tip world position during a melee swing, or null if not attacking.
  getWeaponTipPos() {
    if (this.attackTimer <= 0) return null;
    const cx         = this.cx();
    const shoulderY  = this.y + 24; // matches draw() layout: headR+1+headR+1+4
    const armLen     = 20;
    const atkP       = 1 - this.attackTimer / this.attackDuration;
    const ang = this.facing > 0
      ? lerp(-0.45, 1.1,          atkP)
      : lerp(Math.PI + 0.45, Math.PI - 1.1, atkP);
    const tipLens = { sword: 26, hammer: 30, axe: 22, spear: 38, gauntlet: 24 };
    const wLen    = tipLens[this.weaponKey] || 22;
    const reach   = armLen + wLen;
    return {
      x: cx         + Math.cos(ang) * reach,
      y: shoulderY  + Math.sin(ang) * reach
    };
  }

  // ---- ATTACK ----
  attack(target) {
    if (this.backstageHiding) return;
    if (this.cooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (this.weapon.type === 'melee') {
      // Damage is delivered via weapon-tip hitbox in update() — just start the swing
      if (dist(this, target) < this.weapon.range * 1.4) {
        this.weaponHit = false;
      }
    } else {
      spawnBullet(this, 13, '#ffdd00');
    }
    this.cooldown    = this.weapon.cooldown;
    this.attackTimer = this.attackDuration;
  }

  ability(target) {
    if (this.backstageHiding) return;
    if (this.abilityCooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    this.weapon.ability(this, target);
    this.abilityCooldown = this.weapon.abilityCooldown;
    this.attackTimer     = this.attackDuration * 2;
  }

  // Dedicated super / ultimate activation (separate button from Q)
  useSuper(target) {
    if (this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (!this.superReady) return;
    this.activateSuper(target);
  }

  activateSuper(target) {
    // Boss heals 5% of max HP (no max HP increase); players gain +20 max HP and heal 20
    if (this.isBoss) {
      // Boss no longer heals on super — super is purely offensive
    } else {
      this.maxHealth = Math.min(200, this.maxHealth + 20);
      this.health    = Math.min(this.maxHealth, this.health + 20);
    }
    this.superMeter  = 0;
    this.superReady  = false;
    screenShake      = Math.max(screenShake, 24);
    spawnParticles(this.cx(), this.cy(), this.color,   36);
    spawnParticles(this.cx(), this.cy(), '#ffffff',    18);
    spawnParticles(this.cx(), this.cy(), '#ffd700',    12);
    this.attackTimer = this.attackDuration * 3;
    this.weaponHit   = false;
    const superMoves = {
      sword:  () => {
        this.vx = this.facing * 24;
        if (dist(this, target) < 210) dealDamage(this, target, 60, 30);
      },
      hammer: () => {
        screenShake = Math.max(screenShake, 48);
        spawnRing(this.cx(), this.y + this.h);
        spawnRing(this.cx(), this.y + this.h);
        if (dist(this, target) < 230) dealDamage(this, target, 58, 38);
      },
      gun: () => {
        for (let i = 0; i < 14; i++) {
          setTimeout(() => {
            if (!gameRunning || this.health <= 0) return;
            spawnBullet(this, 14 + (Math.random() - 0.5) * 4, '#ff8800', Math.floor(Math.random() * 4) + 9);
          }, i * 50);
        }
      },
      axe:   () => {
        this.spinning = 75;
        if (dist(this, target) < 175) dealDamage(this, target, 52, 26);
      },
      spear: () => {
        this.vx = this.facing * 22;
        this.vy = -10;
        if (dist(this, target) < 230) dealDamage(this, target, 50, 24);
      },
      gauntlet: () => {
        screenShake = Math.max(screenShake, 60);
        spawnRing(this.cx(), this.cy());
        spawnRing(this.cx(), this.cy());
        spawnRing(this.cx(), this.cy());
        for (const p of players) {
          if (p === this || p.health <= 0) continue;
          if (dist(this, p) < 280) dealDamage(this, p, 15, 50);
        }
        for (const d of trainingDummies) {
          if (d.health <= 0) continue;
          if (dist(this, d) < 280) dealDamage(this, d, 15, 50);
        }
      }
    };
    (superMoves[this.weaponKey] || superMoves.sword)();
  }

  // ---- AI ----

  // Returns true if moving in 'dir' (±1) would walk the AI off a platform
  // with no safe ground beneath within the next 40px.
  isEdgeDanger(dir) {
    if (!this.onGround) return false;
    const lookX = dir > 0 ? this.x + this.w + 36 : this.x - 36;
    const footY = this.y + this.h;
    for (const pl of currentArena.platforms) {
      if (pl.isFloorDisabled) continue;
      if (lookX > pl.x && lookX < pl.x + pl.w &&
          footY <= pl.y + 22 && footY >= pl.y - 8) return false; // ground ahead
    }
    // On lava map stepping off any platform is immediately fatal — always dangerous
    if (currentArena.hasLava) return true;
    // Normal maps: only flag as dangerous close to the kill boundary
    return this.y + this.h < canvas.height + 40;
  }

  // Finds any reachable platform above (for jumping pathing).
  platformAbove() {
    for (const pl of currentArena.platforms) {
      if (pl.y < this.y - 20 &&
          pl.x < this.cx() + 130 && pl.x + pl.w > this.cx() - 130) return pl;
    }
    return null;
  }

  updateAI() {
    if (this.aiReact > 0) { this.aiReact--; return; }
    if (this.ragdollTimer > 0 || this.stunTimer > 0) return;

    const t  = this.target;
    const dx = t.cx() - this.cx();
    const d  = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;

    const spd     = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
    const atkFreq = this.aiDiff === 'easy' ? 0.04 : this.aiDiff === 'medium' ? 0.16 : 0.28;
    const abiFreq = this.aiDiff === 'easy' ? 0.004 : this.aiDiff === 'medium' ? 0.022 : 0.04;

    // ---- DANGER: near lava / death zone ----
    if (currentArena.hasLava) {
      const distToLava = currentArena.lavaY - (this.y + this.h);
      if (distToLava < 130) {
        if (this.onGround && distToLava < 85) {
          // Standing close to lava → jump hard toward safer half of map
          this.vy = -19;
          this.vx = this.cx() < canvas.width / 2 ? spd * 2.2 : -spd * 2.2;
        } else if (!this.onGround && distToLava < 110) {
          // Falling toward lava → steer toward nearest platform above
          let nearestX = canvas.width / 2;
          let nearestDist = Infinity;
          for (const pl of currentArena.platforms) {
            if (pl.y < this.y) {
              const dx = Math.abs(pl.x + pl.w / 2 - this.cx());
              if (dx < nearestDist) { nearestDist = dx; nearestX = pl.x + pl.w / 2; }
            }
          }
          this.vx = nearestX > this.cx() ? spd * 2.2 : -spd * 2.2;
        }
        return;
      }
    }

    // Use super immediately when health is critical and super is ready
    if (this.health < 40 && this.superReady) { this.useSuper(t); }

    // Better platform recovery — steer toward nearest platform when falling off-screen
    if (this.y > 350 && !this.onGround) {
      let nearestX = canvas.width / 2;
      let nearestDist = Infinity;
      for (const pl of currentArena.platforms) {
        if (pl.isFloorDisabled) continue;
        const pdx = Math.abs(pl.x + pl.w / 2 - this.cx());
        if (pdx < nearestDist) { nearestDist = pdx; nearestX = pl.x + pl.w / 2; }
      }
      this.vx = nearestX > this.cx() ? spd * 1.8 : -spd * 1.8;
    }

    // ---- STATE MACHINE ----
    if (this.health < 30 && d > 100 && Math.random() < 0.012) this.aiState = 'evade';
    else if (d < this.weapon.range + 20) this.aiState = 'attack';
    else                                  this.aiState = 'chase';

    // React to incoming attack (medium+): raise shield — respects cooldown
    if (this.aiDiff !== 'easy' && t.attackTimer > 0 && d < 110 &&
        this.shieldCooldown === 0 && Math.random() < 0.22) {
      this.shielding = true;
      this.shieldCooldown = SHIELD_CD;
      setTimeout(() => { this.shielding = false; }, 320);
    }

    // ---- EDGE CHECK ----
    const edgeDanger  = this.isEdgeDanger(dir);
    const safeToChase = !edgeDanger || !this.onGround;

    switch (this.aiState) {
      case 'chase':
        if (safeToChase) {
          this.vx = dir * spd;
        } else {
          // At cliff edge — stop and try to reach target via a platform above
          this.vx = 0;
          if (this.onGround && this.platformAbove() && Math.random() < 0.05) this.vy = -17;
        }
        // Jump to chase target on a higher platform — extra conservative on lava
        if (this.onGround && t.y + t.h < this.y - 50 && Math.random() < 0.04 &&
            !edgeDanger && (!currentArena.hasLava || this.platformAbove()))
          this.vy = -17;
        // Jump to chase airborne target more often
        if (this.onGround && !t.onGround && Math.random() < 0.06 && !edgeDanger)
          this.vy = -17;
        break;

      case 'attack':
        this.vx *= 0.72;
        if (Math.random() < atkFreq) this.attack(t);
        if (Math.random() < abiFreq) this.ability(t);
        if (this.superReady && Math.random() < 0.12) this.useSuper(t);
        // Small hop to stay on target's level
        if (this.onGround && t.y + t.h < this.y - 30 && !edgeDanger && Math.random() < 0.02)
          this.vy = -15;
        break;

      case 'evade': {
        const evadeDir  = -dir;
        const evadeEdge = this.isEdgeDanger(evadeDir);
        if (!evadeEdge) {
          this.vx = evadeDir * spd;
        } else {
          // Trapped — fight back instead of walking off
          if (Math.random() < atkFreq * 0.8) this.attack(t);
          this.vx = 0;
        }
        if (this.onGround && !evadeEdge && Math.random() < 0.03) this.vy = -14;
        if (Math.random() < atkFreq * 0.35) this.attack(t);
        break;
      }
    }

    // Dodge bullets (medium+)
    if (this.aiDiff !== 'easy') {
      for (const pr of projectiles) {
        if (pr.owner !== this) {
          const pd = Math.hypot(pr.x - this.cx(), pr.y - this.cy());
          if (pd < 130 && !this.isEdgeDanger(pr.vx > 0 ? -1 : 1) && Math.random() < 0.30) {
            if (this.onGround) this.vy = -16;
            else if (this.canDoubleJump) { this.vy = -13; this.canDoubleJump = false; }
          }
        }
      }
    }

    // Reaction lag for lower difficulties
    if (this.aiDiff === 'easy'   && Math.random() < 0.08) this.aiReact = 8;
    if (this.aiDiff === 'medium' && Math.random() < 0.03) this.aiReact = 3;
  }

  // ---- DRAW ----
  draw() {
    if (this.backstageHiding) return;
    if (this.health <= 0 && this.invincible < 90) return;

    ctx.save();

    // Scale transform for oversized fighters (e.g., boss)
    if (this.drawScale && this.drawScale !== 1) {
      const pivX = this.cx();
      const pivY = this.y;
      ctx.translate(pivX, pivY);
      ctx.scale(this.drawScale, this.drawScale);
      ctx.translate(-pivX, -pivY);
    }

    // Invincibility blink
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 1) {
      ctx.globalAlpha = 0.35;
    }

    const cx = this.cx();
    const ty = this.y;

    // Ragdoll body rotation — use accumulated angular momentum
    if (this.ragdollTimer > 0) {
      ctx.translate(cx, ty + this.h * 0.45);
      ctx.rotate(this.ragdollAngle);
      ctx.translate(-cx, -(ty + this.h * 0.45));
    }
    const f  = this.facing;
    const s  = this.state;
    const t  = this.animTimer;

    const headR     = 9;
    const headCY    = ty + headR + 1;
    const neckY     = headCY + headR + 1;
    const shoulderY = neckY + 4;
    const hipY      = shoulderY + 24;
    const armLen    = 20;
    const legLen    = 22;

    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    // HEAD
    ctx.beginPath();
    ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + f * 3, headCY - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s === 'hurt' ? '#ff0000' : '#111';
    ctx.beginPath();
    ctx.arc(cx + f * 4.2, headCY - 2, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Expression (mouth)
    ctx.strokeStyle = s === 'hurt' || s === 'attacking' ? '#ff3333' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    if (s === 'hurt') {
      ctx.arc(cx + f * 3, headCY + 3, 3, 0, Math.PI);
    } else {
      ctx.arc(cx + f * 3, headCY + 2, 3, 0, Math.PI, true);
    }
    ctx.stroke();

    // BODY
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, neckY);
    ctx.lineTo(cx, hipY);
    ctx.stroke();

    // ARM ANGLES
    const atkProgress = this.attackDuration > 0 ? 1 - this.attackTimer / this.attackDuration : 0;
    let rAng, lAng;

    if (s === 'ragdoll') {
      // Limbs trail behind the body's angular momentum
      const flail = Math.sin(t * 0.38) * 1.4;
      rAng = this.ragdollAngle * 1.2 + flail;
      lAng = this.ragdollAngle * 1.2 + Math.PI - flail;
    } else if (s === 'stunned') {
      // Limp arms hanging
      rAng = Math.PI * 0.75 + Math.sin(t * 0.1) * 0.08;
      lAng = Math.PI * 0.25 - Math.sin(t * 0.1) * 0.08;
    } else if (this.spinning > 0) {
      const spinA = (this.spinning / 24) * Math.PI * 4;
      rAng = spinA;
      lAng = spinA + Math.PI;
    } else if (s === 'attacking') {
      if (f > 0) { rAng = lerp(-0.45, 1.1, atkProgress); lAng = lerp(Math.PI*0.8, Math.PI*0.55, atkProgress); }
      else       { rAng = lerp(Math.PI+0.45, Math.PI-1.1, atkProgress); lAng = lerp(Math.PI*0.2, Math.PI*0.45, atkProgress); }
    } else if (s === 'walking') {
      const sw = Math.sin(t * 0.24) * 0.52;
      rAng = Math.PI * 0.58 + sw;
      lAng = Math.PI * 0.42 - sw;
    } else if (s === 'jumping' || s === 'falling') {
      rAng = -0.25; lAng = Math.PI + 0.25;
    } else if (s === 'shielding') {
      rAng = f > 0 ? -0.25 : Math.PI + 0.25;
      lAng = f > 0 ? -0.55 : Math.PI + 0.55;
    } else {
      const b = Math.sin(t * 0.045) * 0.045;
      rAng = Math.PI * 0.58 + b;
      lAng = Math.PI * 0.42 - b;
    }

    const rEx = cx + Math.cos(rAng) * armLen;
    const rEy = shoulderY + Math.sin(rAng) * armLen;
    const lEx = cx + Math.cos(lAng) * armLen;
    const lEy = shoulderY + Math.sin(lAng) * armLen;

    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(rEx, rEy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(lEx, lEy); ctx.stroke();

    // WEAPON in right hand (boss draws gauntlet on both hands for visual flair)
    this.drawWeapon(rEx, rEy, rAng, s === 'attacking');
    if (this.isBoss && this.weaponKey === 'gauntlet') {
      this.drawWeapon(lEx, lEy, lAng + Math.PI, s === 'attacking', 'gauntlet');
    }

    // LEGS
    let rLeg, lLeg;
    if (s === 'ragdoll') {
      const legFlail = Math.sin(t * 0.35) * 1.1 + this.ragdollAngle * 0.8;
      rLeg = Math.PI * 0.5 + legFlail;
      lLeg = Math.PI * 0.5 - legFlail + this.ragdollAngle * 0.5;
    } else if (s === 'stunned') {
      rLeg = Math.PI * 0.6; lLeg = Math.PI * 0.4;
    } else if (s === 'jumping')      { rLeg = Math.PI*0.65; lLeg = Math.PI*0.35; }
    else if (s === 'falling') { rLeg = Math.PI*0.56; lLeg = Math.PI*0.44; }
    else if (s === 'walking') {
      const sw = Math.sin(t * 0.24) * 0.44;
      rLeg = Math.PI * 0.5 + sw;
      lLeg = Math.PI * 0.5 - sw;
    } else { rLeg = Math.PI*0.62; lLeg = Math.PI*0.38; }

    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx + Math.cos(rLeg)*legLen, hipY + Math.sin(rLeg)*legLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx + Math.cos(lLeg)*legLen, hipY + Math.sin(lLeg)*legLen); ctx.stroke();

    // SHIELD bubble
    if (this.shielding) {
      ctx.beginPath();
      ctx.arc(cx + f * 15, shoulderY + 12, 23, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,210,255,0.88)';
      ctx.lineWidth   = 3;
      ctx.stroke();
      ctx.fillStyle   = 'rgba(100,210,255,0.14)';
      ctx.fill();
    }

    // Stun stars orbiting head
    if (this.stunTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.stunTimer / 15);
      for (let i = 0; i < 3; i++) {
        const starA  = t * 0.14 + (i * Math.PI * 2 / 3);
        const starX  = cx  + Math.cos(starA) * 15;
        const starY  = ty  - 4 + Math.sin(starA * 2) * 5;
        ctx.fillStyle   = i % 2 === 0 ? '#ffdd00' : '#ffffff';
        ctx.font        = '10px Arial';
        ctx.textAlign   = 'center';
        ctx.fillText('★', starX, starY);
      }
      ctx.restore();
    }

    // SUPER READY flash
    if (this.superFlashTimer > 0) {
      const pulse = Math.abs(Math.sin(this.superFlashTimer * 0.18));
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.superFlashTimer / 20);
      ctx.font        = `bold ${12 + Math.floor(pulse * 4)}px Arial`;
      ctx.fillStyle   = '#ffd700';
      ctx.textAlign   = 'center';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur  = 10 + pulse * 8;
      ctx.fillText('SUPER!', cx, ty - 20);
      ctx.restore();
    }

    // Name tag
    ctx.globalAlpha  = 1;
    ctx.font         = 'bold 10px Arial';
    ctx.fillStyle    = this.color;
    ctx.textAlign    = 'center';
    ctx.shadowColor  = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur   = 4;
    ctx.fillText(this.name, cx, ty - 5);
    ctx.shadowBlur   = 0;

    ctx.restore();
  }

  drawWeapon(hx, hy, angle, attacking, overrideKey = null) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle + (attacking ? 0.6 : 0));
    ctx.lineCap   = 'round';

    const k = overrideKey || this.weaponKey;

    if (k === 'sword') {
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(26,-3); ctx.stroke();
      ctx.strokeStyle = '#ffee99';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.stroke();

    } else if (k === 'hammer') {
      ctx.strokeStyle = '#888';
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(20,0); ctx.stroke();
      ctx.fillStyle   = '#777';
      ctx.fillRect(17, -9, 13, 15);
      ctx.fillStyle   = '#999';
      ctx.fillRect(17, -9, 13, 4);

    } else if (k === 'gun') {
      ctx.fillStyle = '#444';
      ctx.fillRect(0, -4, 18, 8);
      ctx.fillStyle = '#333';
      ctx.fillRect(15, -2, 12, 4);
      ctx.fillStyle = '#555';
      ctx.fillRect(4, 4, 6, 5);

    } else if (k === 'axe') {
      ctx.strokeStyle = '#cc4422';
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(18,0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14,-11); ctx.lineTo(23,2); ctx.lineTo(13,5);
      ctx.closePath();
      ctx.fillStyle = '#cc4422';
      ctx.fill();

    } else if (k === 'spear') {
      ctx.strokeStyle = '#8888ff';
      ctx.lineWidth   = 2.5;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(30,0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(27,-7); ctx.lineTo(38,0); ctx.lineTo(27,7);
      ctx.closePath();
      ctx.fillStyle = '#aaaaff';
      ctx.fill();

    } else if (k === 'gauntlet') {
      // Large dark-energy fist/gauntlet around the hand
      ctx.save();
      ctx.shadowColor = '#bb00ff';
      ctx.shadowBlur  = 14;
      // Main gauntlet body
      ctx.fillStyle   = '#7700cc';
      ctx.beginPath();
      ctx.roundRect(-10, -10, 26, 20, 5);
      ctx.fill();
      // Bright outline
      ctx.strokeStyle = '#bb00ff';
      ctx.lineWidth   = 2;
      ctx.stroke();
      // Knuckle arcs
      ctx.fillStyle = '#9900ee';
      for (let ki = 0; ki < 3; ki++) {
        ctx.beginPath();
        ctx.arc(2 + ki * 6, -10, 4, Math.PI, 0);
        ctx.fill();
      }
      // Energy glow core
      ctx.globalAlpha = 0.5;
      ctx.fillStyle   = '#ee88ff';
      ctx.beginPath();
      ctx.arc(5, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.restore();
  }
}

// ============================================================
// MINION  (lightweight boss-spawned enemy)
// ============================================================
class Minion extends Fighter {
  constructor(x, y) {
    const wKey = Math.random() < 0.5 ? 'axe' : 'sword';
    super(x, y, '#bb00ee', wKey,
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      true, 'hard');
    this.name      = 'MINION';
    this.isMinion  = true;
    this.w         = 32;
    this.h         = 62;
    this.health    = 25;
    this.maxHealth = 25;
    this.lives     = 1;
    this.dmgMult   = 0.10; // deals 10% damage
    this.spawnX    = x;
    this.spawnY    = y;
    this.playerNum = 2;
  }

  // Minions never super
  useSuper() {}
  activateSuper() {}

  // Flat respawn override — minions just die, no countdown
  respawn() { this.health = 0; }
}

// ============================================================
// DUMMY  (training-mode target — stands still, auto-heals)
// ============================================================
class Dummy extends Fighter {
  constructor(x, y) {
    super(x, y, '#888888', 'sword',
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      false);
    this.name     = 'DUMMY';
    this.isDummy  = true;
    this.health   = 200;
    this.maxHealth = 200;
    this.lives    = 999;
    this.spawnX   = x;
    this.spawnY   = y;
  }

  update() {
    // Timers
    if (this.cooldown > 0)         this.cooldown--;
    if (this.invincible > 0)       this.invincible--;
    if (this.hurtTimer > 0)        this.hurtTimer--;
    if (this.stunTimer > 0)        this.stunTimer--;
    if (this.ragdollTimer > 0) {
      this.ragdollTimer--;
      this.ragdollAngle += this.ragdollSpin;
      this.ragdollSpin  *= 0.97;
    } else {
      this.ragdollAngle = 0;
      this.ragdollSpin  = 0;
    }
    // Gravity + minimal physics
    this.vy += 0.65;
    this.x  += this.vx;
    this.y  += this.vy;
    this.vx *= 0.80;
    this.vy  = clamp(this.vy, -20, 19);
    this.onGround = false;
    for (const pl of currentArena.platforms) this.checkPlatform(pl);
    // Auto-reset if falls off
    if (this.y > 640) { this.x = this.spawnX; this.y = this.spawnY - 60; this.vy = 0; this.health = this.maxHealth; }
    // Auto-heal when health hits 0
    if (this.health <= 0) {
      this.health = this.maxHealth;
      this.invincible = 120;
      spawnParticles(this.cx(), this.cy(), this.color, 12);
    }
    this.animTimer++;
    this.updateState();
  }

  respawn() { this.health = this.maxHealth; }
  useSuper() {}
  activateSuper() {}
  updateAI() {}
}

// ============================================================
// TRAINING COMMANDS
// ============================================================
function trainingCmd(cmd) {
  if (!gameRunning || !trainingMode) return;
  const p = players[0];
  if (!p) return;
  if (cmd === 'giveSuper')   { p.superMeter = 100; p.superReady = true; p.superFlashTimer = 90; }
  if (cmd === 'noCooldowns') {
    p.noCooldownsActive = !p.noCooldownsActive;
    if (p.noCooldownsActive) { p.cooldown = 0; p.cooldown2 = 0; p.abilityCooldown = 0; p.abilityCooldown2 = 0; p.shieldCooldown = 0; p.boostCooldown = 0; }
  }
  if (cmd === 'fullHealth')  { p.health = p.maxHealth; }
  if (cmd === 'spawnDummy') {
    const x = 200 + Math.random() * 500;
    const d = new Dummy(x, 300);
    trainingDummies.push(d);
  }
  if (cmd === 'spawnBot') {
    const x   = Math.random() < 0.5 ? 160 : 720;
    const wKey = randChoice(WEAPON_KEYS);
    const bot  = new Fighter(x, 300, '#ff8800', wKey,
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      true, 'hard');
    bot.name = 'BOT'; bot.lives = 1; bot.spawnX = x; bot.spawnY = 300;
    bot.target = p; bot.playerNum = 2;
    trainingDummies.push(bot);
  }
  if (cmd === 'clearEnemies') { trainingDummies = []; }
  if (cmd === 'godmode') { p.godmode = !p.godmode; }
  if (cmd === 'spawnBoss') {
    const bossX = 450, bossY = 200;
    const tb = new Fighter(bossX, bossY, '#cc00ee', 'hammer',
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      true, 'hard');
    tb.name      = 'CREATOR';  tb.lives    = 1;
    tb.spawnX    = bossX;      tb.spawnY   = bossY;
    tb.health    = 2000;       tb.maxHealth = 2000;
    tb.w         = 33;         tb.h        = 90;
    tb.kbResist  = 0.5;        tb.kbBonus  = 1.5;
    tb.target    = p;          tb.playerNum = 2;
    trainingDummies.push(tb);
  }
  if (cmd === 'onePunch') {
    p.onePunchMode = !p.onePunchMode;
  }
}

function applyClass(fighter, classKey) {
  const cls = CLASSES[classKey || 'none'];
  if (!cls || classKey === 'none') return;
  fighter.charClass       = classKey;
  fighter.maxHealth       = cls.hp;
  fighter.health          = cls.hp;
  fighter.classSpeedMult  = cls.speedMult;
  if (cls.weapon) {
    fighter.weaponKey = cls.weapon;
    fighter.weapon    = WEAPONS[cls.weapon];
  }
}

function updateClassWeapon(player) {
  const clsKey = document.getElementById(player + 'Class').value;
  const cls    = CLASSES[clsKey];
  const wEl    = document.getElementById(player + 'Weapon');
  if (cls && cls.weapon) {
    wEl.value    = cls.weapon;
    wEl.disabled = true;
  } else {
    wEl.disabled = false;
  }
  showDesc(player, 'class', clsKey);
}

function showDesc(player, type, key) {
  const data  = type === 'weapon' ? WEAPON_DESCS[key] : CLASS_DESCS[key];
  const panel = document.getElementById(player + 'Desc');
  const title = document.getElementById(player + 'DescTitle');
  const body  = document.getElementById(player + 'DescBody');
  if (!panel || !title || !body) return;
  if (!data || key === 'none' || key === 'random') {
    panel.style.display = 'none';
    return;
  }
  title.textContent = data.title;
  let html = `<span class="desc-what">${data.what}</span>`;
  if (data.ability) html += `<br><span class="desc-ability">\u2694\ufe0f ${data.ability}</span>`;
  if (data.super)   html += `<br><span class="desc-super">\u2728 ${data.super}</span>`;
  if (data.perk)    html += `<br><span class="desc-perk">${data.perk}</span>`;
  html += `<br><span class="desc-tip">\ud83d\udca1 ${data.how}</span>`;
  // Randomizer toggle
  const inPool = type === 'weapon'
    ? (!randomWeaponPool || randomWeaponPool.has(key))
    : (!randomClassPool  || randomClassPool.has(key));
  html += `<br><button id="randBtn_${type}_${key}" class="rand-toggle-btn"
    onclick="toggleRandomPool('${type}','${key}')"
    style="margin-top:6px;padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);cursor:pointer;font-size:11px;background:${inPool ? 'rgba(0,200,100,0.25)' : 'rgba(200,50,50,0.25)'}">
    ${inPool ? '\u2713 In Random Pool' : '\u2717 Excluded'}</button>`;
  body.innerHTML = html;
  panel.style.display = 'block';
}

// ============================================================
// BOSS  (special Fighter — 3× HP, gauntlet weapon, ½ cooldowns)
// ============================================================
class Boss extends Fighter {
  constructor() {
    const noCtrl = { left:null, right:null, jump:null, attack:null, ability:null, super:null };
    super(450, 200, '#cc00ee', 'gauntlet', noCtrl, true, 'hard');
    this.name           = 'CREATOR';
    this.health         = 2000;
    this.maxHealth      = 2000;
    this.w              = 33;   // double Fighter hitbox width
    this.h              = 90;  // double Fighter hitbox height
    this.drawScale      = 1.5;    // visual 2× scale in draw()
    this.isBoss         = true;
    this.lives          = 1;
    this.spawnX         = 450;
    this.spawnY         = 200;
    this.playerNum      = 2;
    // Boss combat modifiers
    this.kbResist       = 0.5;  // takes half knockback
    this.kbBonus        = 1.5;  // deals 1.5x knockback
    this.attackCooldownMult = 0.5;
    this.superChargeRate = 1.7;   // charges super 1.7× faster
    // Gauntlet weapon (single weapon only)
    this.weaponKey      = 'gauntlet';
    this.weapon         = WEAPONS['gauntlet'];
    // Minion spawning
    this.minionCooldown = 600;  // frames until first spawn (~10 s)
    // Beam attacks
    this.beamCooldown   = 900;  // frames until first beam (~15 s)
    // Teleport
    this.teleportCooldown = 0;
    this.teleportMaxCd    = 900;
    this.postTeleportCrit = 0;
    this.forcedTeleportFlash = 0;
    // Spike attacks
    this.spikeCooldown  = 1200; // 20 seconds initial
    // Monologue tracking
    this.phaseDialogueFired = new Set();
    this._maxLives          = 1; // boss shows phase indicator, not hearts
  }

  getPhase() {
    if (this.health > 1334) return 1;   // > 66% HP
    if (this.health > 667)  return 2;   // 33–66% HP
    return 3;                            // < 33% HP
  }

  // Override attack: gauntlet melee only, half cooldowns
  attack(target) {
    if (this.backstageHiding) return;
    if (this.cooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    // Gauntlet is melee-only — start swing, damage delivered via weapon-tip hitbox
    if (dist(this, target) < this.weapon.range * 1.4) this.weaponHit = false;
    this.cooldown    = Math.max(1, Math.ceil(this.weapon.cooldown * (this.attackCooldownMult || 0.5)));
    this.attackTimer = this.attackDuration;
  }

  // Override ability: half cooldown
  ability(target) {
    if (this.abilityCooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    this.weapon.ability(this, target);
    this.abilityCooldown = Math.max(1, Math.ceil(this.weapon.abilityCooldown * (this.attackCooldownMult || 0.5)));
    this.attackTimer     = this.attackDuration * 2;
  }

  // Override AI: phase-based, more aggressive, respects shield cooldown
  updateAI() {
    if (this.aiReact > 0) { this.aiReact--; return; }
    if (this.ragdollTimer > 0 || this.stunTimer > 0) return;

    // In 2P boss mode, always target the nearest alive human player
    if (gameMode === 'boss2p') {
      let nearDist = Infinity, nearP = null;
      for (const p of players) {
        if (p.isBoss || p.health <= 0) continue;
        const d2 = dist(this, p);
        if (d2 < nearDist) { nearDist = d2; nearP = p; }
      }
      if (nearP) this.target = nearP;
    }

    const phase   = this.getPhase();
    // Phase-based stats
    const spd     = phase === 3 ? 5.5 : phase === 2 ? 4.5 : 3.8;
    const atkFreq = phase === 3 ? 0.30 : phase === 2 ? 0.20 : 0.13;
    const abiFreq = phase === 3 ? 0.05 : phase === 2 ? 0.035 : 0.018;

    // Count down post-teleport crit window
    if (this.postTeleportCrit > 0) this.postTeleportCrit--;
    if (this.forcedTeleportFlash > 0) this.forcedTeleportFlash--;

    const t  = this.target;
    if (!t || t.health <= 0) return;
    const dx  = t.cx() - this.cx();
    const d   = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;

    // Lava / void floor — flee toward elevated platforms
    if (currentArena.hasLava) {
      const distToLava = currentArena.lavaY - (this.y + this.h);
      if (distToLava < 110) {
        if (this.onGround) {
          this.vy = -19; this.vx = this.cx() < canvas.width/2 ? spd*2.2 : -spd*2.2;
        } else {
          let nearX = canvas.width/2, nearDist = Infinity;
          for (const pl of currentArena.platforms) {
            if (pl.y < this.y && !pl.isFloorDisabled) {
              const pdx = Math.abs(pl.x + pl.w/2 - this.cx());
              if (pdx < nearDist) { nearDist = pdx; nearX = pl.x + pl.w/2; }
            }
          }
          this.vx = nearX > this.cx() ? spd*2 : -spd*2;
        }
        return;
      }
    }

    // Flee floor during void warning/hazard
    const floorDanger = currentArena.isBossArena &&
      (bossFloorState === 'hazard' || (bossFloorState === 'warning' && bossFloorTimer < 90)) &&
      this.y + this.h > 440;
    if (floorDanger && this.onGround) {
      const above = this.platformAbove();
      if (above) { this.vy = -18; this.vx = (above.x + above.w/2 - this.cx()) > 0 ? spd*1.5 : -spd*1.5; }
      return;
    }

    // State machine — boss stays in attack range more aggressively
    if (d < this.weapon.range + 50) this.aiState = 'attack';
    else if (this.health < 100 && d > 160 && Math.random() < 0.008) this.aiState = 'evade';
    else this.aiState = 'chase';

    // Reactive shield (respects cooldown) — responds to both attacks AND incoming bullets
    if (this.shieldCooldown === 0) {
      const incomingBullet = projectiles.some(pr =>
        pr.owner !== this && Math.hypot(pr.x - this.cx(), pr.y - this.cy()) < 160 &&
        ((pr.vx > 0 && pr.x < this.cx()) || (pr.vx < 0 && pr.x > this.cx()))
      );
      if ((t.attackTimer > 0 && d < 150) || incomingBullet) {
        if (Math.random() < (phase === 3 ? 0.55 : 0.35)) {
          this.shielding = true;
          this.shieldCooldown = Math.ceil(SHIELD_CD * 0.5);
          setTimeout(() => { this.shielding = false; }, 350);
        }
      }
    }

    // Dodge bullets by jumping
    for (const pr of projectiles) {
      if (pr.owner === this) continue;
      const pd = Math.hypot(pr.x - this.cx(), pr.y - this.cy());
      if (pd < 130 && this.onGround && Math.random() < (phase >= 2 ? 0.35 : 0.20)) {
        this.vy = -18;
        break;
      }
    }

    const edgeDanger = this.isEdgeDanger(dir);

    switch (this.aiState) {
      case 'chase':
        if (!edgeDanger) this.vx = dir * spd;
        else { this.vx = 0; if (this.onGround && this.platformAbove() && Math.random() < 0.10) this.vy = -18; }
        // Jump toward target on platforms above
        if (this.onGround && t.y + t.h < this.y - 40 && !edgeDanger && Math.random() < 0.07) this.vy = -19;
        break;
      case 'attack':
        this.vx *= 0.75;
        if (Math.random() < atkFreq)       this.attack(t);
        if (Math.random() < abiFreq)       this.ability(t);
        if (this.superReady && Math.random() < (phase === 3 ? 0.15 : 0.10)) this.useSuper(t);
        if (this.onGround && t.y + t.h < this.y - 30 && !edgeDanger && Math.random() < 0.05) this.vy = -17;
        break;
      case 'evade': {
        const eDir  = -dir;
        const eEdge = this.isEdgeDanger(eDir);
        if (!eEdge) this.vx = eDir * spd * 1.2;
        else if (Math.random() < atkFreq)  this.attack(t);
        if (Math.random() < atkFreq * 0.5) this.attack(t);
        break;
      }
    }

    // Phase 3 bonus: aggressive jumps + burst attacks
    if (phase === 3) {
      if (this.onGround && !edgeDanger && Math.random() < 0.030) this.vy = -17;
      if (Math.random() < 0.035) this.attack(t);
    }

    // Teleport (phase 2+)
    if (phase >= 2) {
      if (this.teleportCooldown > 0) {
        this.teleportCooldown--;
      } else {
        if (!this.backstageHiding) bossTeleport(this);
        this.teleportCooldown = phase === 3 ? 600 : 900;
      }
    }

    // Ability more often when target is close
    if (t && dist(this, t) < 120 && Math.random() < 0.06) this.ability(t);

    // Boss leads attacks when player moves toward it
    if (t && t.vx !== 0) {
      const playerMovingToward = (t.cx() < this.cx() && t.vx > 0) || (t.cx() > this.cx() && t.vx < 0);
      if (playerMovingToward && dist(this, t) < this.weapon.range * 2 && Math.random() < 0.15) {
        this.attack(t);
      }
    }

    // Spike attacks
    if (this.spikeCooldown > 0) {
      this.spikeCooldown--;
    } else if (phase >= 2 && t) {
      const numSpikes = 5;
      for (let i = 0; i < numSpikes; i++) {
        const sx = clamp(t.cx() + (i - 2) * 35, 20, 880);
        bossSpikes.push({ x: sx, maxH: 90 + Math.random() * 50, h: 0, phase: 'rising', stayTimer: 0, done: false });
      }
      this.spikeCooldown = phase === 3 ? 480 : 720;
      showBossDialogue(randChoice(['Rise!', 'The ground betrays you!', 'Watch your feet!']));
    }

    // Minion spawning (up to 2 at a time, every ~15 s, not on phase 1)
    if (this.minionCooldown > 0) {
      this.minionCooldown--;
    } else if (phase >= 2 && minions.filter(m => m.health > 0).length < 2) {
      const spawnX = Math.random() < 0.5 ? 60 : 840;
      const spawnY = 200;
      const mn     = new Minion(spawnX, spawnY);
      mn.target    = players[0];
      minions.push(mn);
      spawnParticles(spawnX, spawnY, '#bb00ee', 24);
      if (settings.screenShake) screenShake = Math.max(screenShake, 12);
      this.minionCooldown = 60 * (phase === 3 ? 10 : 15);
      showBossDialogue(randChoice(['Deal with my guests!', 'MINIONS, arise!', 'Handle this!', 'You\'ll need backup...']));
    }

    // Beam attacks — summons floor beams with 5-second warning (phase 2+)
    if (this.beamCooldown > 0) {
      this.beamCooldown--;
    } else if (phase >= 2 && t) {
      const numBeams = phase === 3 ? 3 : 2;
      for (let i = 0; i < numBeams; i++) {
        const spread = (i - Math.floor(numBeams / 2)) * 95;
        const bx = clamp(t.cx() + spread + (Math.random() - 0.5) * 70, 40, 860);
        bossBeams.push({ x: bx, warningTimer: 300, activeTimer: 0, phase: 'warning', done: false });
      }
      this.beamCooldown = phase === 3 ? 400 : 560;
      showBossDialogue(randChoice(['Nowhere to hide!', 'Feel the void!', 'Dodge THIS!', 'From below!', 'The light will take you!']));
    }

    // HP-threshold monologue (fires once per threshold crossing)
    const hpLines = [
      { hp: 1999, text: 'I have taught you everything you know, but not everything I know, bring it on!' },
      { hp: 1750, text: 'Ha. You tickle.' },
      { hp: 1500, text: 'Interesting... you\'re persistent.' },
      { hp: 1334, text: 'I\'m just warming up.' },
      { hp: 1000, text: 'Fine. No more holding back!' },
      { hp: 667,  text: 'You\'re stronger than I thought...' },
      { hp: 400,  text: 'Impossible... HOW?!' },
      { hp: 150,  text: 'I... WILL NOT... FALL HERE!' },
    ];
    for (const { hp, text } of hpLines) {
      if (this.health <= hp && !this.phaseDialogueFired.has(hp)) {
        this.phaseDialogueFired.add(hp);
        showBossDialogue(text, 280);
        break; // one at a time
      }
    }

    if (Math.random() < 0.025) this.aiReact = 2; // tighter reaction window than base AI
  }
}

// ============================================================
// BACKSTAGE PORTAL HELPERS
// ============================================================
function openBackstagePortal(cx, cy, type) {
  const words = ['if','for','let','const','function','return','true','false','null',
                 '&&','||','=>','{','}','()','0','1','new','this','class','extends',
                 'import','export','while','switch','break','typeof','void'];
  const chars = [];
  for (let _i = 0; _i < 35; _i++) {
    chars.push({
      x:     (Math.random() * 90) - 45,
      y:     (Math.random() * 160) - 80,
      char:  words[Math.floor(Math.random() * words.length)],
      speed: 0.6 + Math.random() * 1.8,
      alpha: 0.35 + Math.random() * 0.55,
      color: ['#00ff88','#00cc66','#88ffaa','#44ff00','#aaffaa','#ffffff'][Math.floor(Math.random()*6)]
    });
  }
  backstagePortals.push({ x: cx, y: cy, type, phase: 'opening', timer: 0, radius: 0, maxRadius: 58, codeChars: chars, done: false });
}

function drawBackstagePortals() {
  for (const bp of backstagePortals) {
    if (bp.done) continue;
    bp.timer++;
    if (bp.phase === 'opening') {
      bp.radius = bp.maxRadius * Math.min(1, (bp.timer / 35) * (bp.timer / 35) * 2);
      if (bp.timer >= 35) bp.phase = 'open';
    } else if (bp.phase === 'open') {
      bp.radius = bp.maxRadius;
    } else if (bp.phase === 'closing') {
      bp.radius = Math.max(0, bp.radius - 2.8);
      if (bp.radius <= 0) { bp.done = true; continue; }
    }
    const rw = bp.radius * 0.55;
    const rh = bp.radius;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y, Math.max(0.1, rw), Math.max(0.1, rh), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000008';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y, Math.max(0.1, rw - 2), Math.max(0.1, rh - 2), 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    for (const c of bp.codeChars) {
      c.y += c.speed;
      if (c.y > rh + 14) c.y = -rh - 14;
      ctx.globalAlpha = c.alpha * (bp.radius / bp.maxRadius);
      ctx.fillStyle   = c.color;
      ctx.fillText(c.char, bp.x + c.x - 28, bp.y + c.y);
    }
    ctx.restore();
    ctx.globalAlpha = bp.radius / bp.maxRadius;
    ctx.strokeStyle = '#cc00ff';
    ctx.lineWidth   = 3.5;
    ctx.shadowColor = '#9900ee';
    ctx.shadowBlur  = 22;
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y, Math.max(0.1, rw), Math.max(0.1, rh), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,0,255,0.4)';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 8;
    for (let _i = 0; _i < 3; _i++) {
      const _sa = (frameCount * 0.04 + _i * 2.1) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, rw * (0.35 + _i * 0.18), _sa, _sa + Math.PI * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }
  backstagePortals = backstagePortals.filter(bp => !bp.done);
}

// ============================================================
// BOSS TELEPORT
// ============================================================
function bossTeleport(boss, isForced = false) {
  if (!currentArena) return;
  const validPlatforms = currentArena.platforms.filter(pl => !pl.isFloor && !pl.isFloorDisabled);
  let target = validPlatforms.length > 0 ? randChoice(validPlatforms)
    : currentArena.platforms.find(pl => !pl.isFloorDisabled);

  let destX, destY;
  if (target) {
    destX = clamp(target.x + target.w / 2 - boss.w / 2, 0, canvas.width - boss.w);
    destY = target.y - boss.h - 2;
  } else {
    destX = canvas.width / 2 - boss.w / 2;
    destY = 200;
  }

  const oldX = boss.cx();
  const oldY = boss.cy();

  if (!isForced) {
    // === BACKSTAGE PORTAL TELEPORT (3-second animation) ===
    openBackstagePortal(oldX, oldY, 'entry');
    boss.backstageHiding = true;
    boss.invincible      = 9999;
    boss.teleportCooldown = 900;
    boss.vx = 0;
    boss.vy = 0;

    // t=1.5s: open exit portal at destination
    setTimeout(() => {
      if (!gameRunning) return;
      openBackstagePortal(destX + boss.w / 2, destY + boss.h / 2, 'exit');
    }, 1500);

    // t=2.5s: boss reappears
    setTimeout(() => {
      if (!gameRunning) return;
      boss.x = destX;
      boss.y = destY;
      boss.vx = 0;
      boss.vy = 0;
      boss.backstageHiding = false;
      boss.invincible      = 60;
      boss.postTeleportCrit = 60;
      showBossDialogue(randChoice(['Now you see me...', 'Try to follow me!', 'Blink!', 'You\'re too slow!']));
      // Close entry portal
      setTimeout(() => {
        for (const bp of backstagePortals) { if (bp.type === 'entry' && bp.phase === 'open') bp.phase = 'closing'; }
      }, 500);
      // Close exit portal
      setTimeout(() => {
        for (const bp of backstagePortals) { if (bp.type === 'exit'  && bp.phase === 'open') bp.phase = 'closing'; }
      }, 1200);
    }, 2500);

  } else {
    // Forced teleport: instant (falling into hazard)
    boss.x = destX;
    boss.y = destY;
    boss.vx = 0;
    boss.vy = 0;
    spawnParticles(oldX, oldY, '#9900ee', 18);
    spawnParticles(oldX, oldY, '#cc00ff', 10);
    spawnParticles(boss.cx(), boss.cy(), '#9900ee', 18);
    spawnParticles(boss.cx(), boss.cy(), '#cc00ff', 10);
    boss.forcedTeleportFlash = 20;
    showBossDialogue('You really thought I would go down that easily?', 300);
  }
}

// ============================================================
// BACKGROUND GENERATION (pre-computed to avoid flicker)
// ============================================================
function generateBgElements() {
  bgStars = Array.from({ length: 110 }, () => ({
    x:       Math.random() * 900,
    y:       Math.random() * 420,
    r:       0.4 + Math.random() * 1.8,
    phase:   Math.random() * Math.PI * 2,
    speed:   0.02 + Math.random() * 0.04
  }));

  bgBuildings = [];
  let bx = 0;
  while (bx < 940) {
    const bw = 55 + Math.random() * 85;
    const bh = 110 + Math.random() * 260;
    const wins = [];
    for (let wy = canvas.height - bh + 14; wy < canvas.height - 18; wy += 17) {
      for (let wx = bx + 8; wx < bx + bw - 8; wx += 14) {
        wins.push({ x: wx, y: wy, on: Math.random() > 0.28 });
      }
    }
    bgBuildings.push({ x: bx, w: bw, h: bh, wins });
    bx += bw + 4;
  }
}

// ============================================================
// DRAWING
// ============================================================
function drawBackground() {
  const a = currentArena;
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, a.sky[0]);
  g.addColorStop(1, a.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (currentArenaKey === 'space')   drawStars();
  if (currentArenaKey === 'grass')   drawClouds();
  if (currentArenaKey === 'lava')    drawLava();
  if (currentArenaKey === 'city')    drawCityBuildings();
  if (currentArenaKey === 'creator') drawCreatorArena();
  if (currentArenaKey === 'forest')  drawForest();
  if (currentArenaKey === 'ice')     drawIce();
  if (currentArenaKey === 'ruins')   drawRuins();
}

function drawCreatorArena() {
  // Pulsing void portals in the background
  for (let i = 0; i < 6; i++) {
    const bx = (i * 160 + Math.sin(frameCount * 0.007 + i * 1.1) * 55) % 900;
    const by = 80 + Math.sin(frameCount * 0.011 + i * 1.4) * 70;
    const r  = 35 + Math.sin(frameCount * 0.019 + i) * 12;
    const g  = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, 'rgba(200,0,255,0.14)');
    g.addColorStop(1, 'rgba(80,0,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  }
  // Draw lava on floor if active hazard
  if (bossFloorState === 'hazard' && bossFloorType === 'lava') {
    const ly = 460;
    const lg = ctx.createLinearGradient(0, ly, 0, canvas.height);
    lg.addColorStop(0,   '#ff6600');
    lg.addColorStop(0.3, '#cc2200');
    lg.addColorStop(1,   '#880000');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    for (let x = 0; x <= canvas.width; x += 18) {
      ctx.lineTo(x, ly + Math.sin(x * 0.055 + frameCount * 0.07) * 7);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = 'rgba(255,80,0,0.22)';
    ctx.fillRect(0, ly - 10, canvas.width, 12);
    ctx.shadowBlur  = 0;
  }

  // Invisible walls — glowing neon energy barriers on left and right
  const wallPulse = 0.35 + Math.abs(Math.sin(frameCount * 0.04)) * 0.45;
  ctx.save();
  for (const wallX of [0, canvas.width]) {
    const grad = ctx.createLinearGradient(
      wallX === 0 ? 0 : canvas.width - 14, 0,
      wallX === 0 ? 14 : canvas.width, 0
    );
    grad.addColorStop(0, `rgba(180,0,255,${wallPulse})`);
    grad.addColorStop(1, 'rgba(180,0,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(wallX === 0 ? 0 : canvas.width - 14, 0, 14, canvas.height);
  }
  ctx.restore();
}

function drawStars() {
  for (const s of bgStars) {
    const alpha = 0.3 + Math.abs(Math.sin(frameCount * s.speed + s.phase)) * 0.7;
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = s.r < 1 ? '#ffffff' : '#aabbff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawClouds() {
  const offsets = [100, 420, 700];
  const speeds  = [0.18, 0.12, 0.22];
  const sizes   = [30, 24, 36];
  const ys      = [55, 88, 45];
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  for (let i = 0; i < 3; i++) {
    const cx = ((frameCount * speeds[i] + offsets[i]) % 1000) - 60;
    const cy = ys[i];
    const r  = sizes[i];
    ctx.beginPath();
    ctx.arc(cx,         cy,       r,       0, Math.PI*2);
    ctx.arc(cx + r*0.8, cy - r*0.3, r*0.7, 0, Math.PI*2);
    ctx.arc(cx - r*0.6, cy - r*0.2, r*0.6, 0, Math.PI*2);
    ctx.fill();
  }
}

function drawLava() {
  const ly = currentArena.lavaY;
  const lg = ctx.createLinearGradient(0, ly, 0, canvas.height);
  lg.addColorStop(0,   '#ff6600');
  lg.addColorStop(0.3, '#cc2200');
  lg.addColorStop(1,   '#880000');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(0, ly);
  for (let x = 0; x <= canvas.width; x += 18) {
    ctx.lineTo(x, ly + Math.sin(x * 0.055 + frameCount * 0.07) * 7);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();
  // glow
  ctx.shadowColor = '#ff4400';
  ctx.shadowBlur  = 22;
  ctx.fillStyle   = 'rgba(255,80,0,0.28)';
  ctx.fillRect(0, ly - 10, canvas.width, 12);
  ctx.shadowBlur  = 0;
}

function drawCityBuildings() {
  for (const b of bgBuildings) {
    const shade = 14 + Math.floor(b.h / 20);
    ctx.fillStyle = `rgb(${shade},${shade},${shade+12})`;
    ctx.fillRect(b.x, canvas.height - b.h, b.w, b.h);
    // windows
    for (const w of b.wins) {
      ctx.fillStyle = w.on ? 'rgba(255,245,160,0.65)' : 'rgba(40,40,60,0.5)';
      ctx.fillRect(w.x, w.y, 7, 9);
    }
  }
}

function drawForest() {
  // Animated trees in background
  const treeXs = [45, 140, 280, 480, 620, 760, 860];
  for (let i = 0; i < treeXs.length; i++) {
    const tx   = treeXs[i];
    const sway = Math.sin(frameCount * 0.008 + i * 1.2) * 3;
    // trunk
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(tx - 5, 400, 10, 80);
    // canopy layers
    const shades = ['rgba(30,90,30,0.7)', 'rgba(45,120,40,0.65)', 'rgba(60,150,50,0.6)'];
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = shades[j];
      ctx.beginPath();
      ctx.arc(tx + sway, 380 - j * 28, 32 - j * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Fireflies / floating particles
  for (let i = 0; i < 6; i++) {
    const fx = (frameCount * (0.4 + i * 0.15) + i * 150) % 920 - 10;
    const fy = 200 + Math.sin(frameCount * 0.02 + i * 2.1) * 80;
    const fa = 0.4 + Math.sin(frameCount * 0.08 + i) * 0.4;
    ctx.globalAlpha = Math.max(0, fa);
    ctx.fillStyle   = '#ccff44';
    ctx.beginPath();
    ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawIce() {
  // Snow particles falling
  for (let i = 0; i < 12; i++) {
    const sx = ((frameCount * (0.6 + i * 0.1) + i * 75) % 930) - 15;
    const sy = ((frameCount * (1.2 + i * 0.08) + i * 42) % 520);
    const sa = 0.3 + (i % 3) * 0.2;
    ctx.globalAlpha = sa;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Ice crystals on ground
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#aaddff';
  ctx.lineWidth   = 1.5;
  for (let i = 0; i < 8; i++) {
    const cx2 = 60 + i * 115;
    const cy2 = 455;
    for (let a = 0; a < 3; a++) {
      const ang = (a / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 + Math.cos(ang) * 14, cy2 + Math.sin(ang) * 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 - Math.cos(ang) * 14, cy2 - Math.sin(ang) * 14);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth   = 1;
}

function drawRuins() {
  // Stone columns / pillars in background
  const cols = [50, 200, 360, 540, 700, 850];
  for (let i = 0; i < cols.length; i++) {
    const cx2 = cols[i];
    const broken = i % 3 === 0;
    const colH   = broken ? 180 + (i % 2) * 60 : 260;
    // Column body
    ctx.fillStyle = `rgba(80,65,48,0.55)`;
    ctx.fillRect(cx2 - 10, canvas.height - colH, 20, colH);
    // Column cap
    ctx.fillStyle = `rgba(100,82,58,0.65)`;
    ctx.fillRect(cx2 - 14, canvas.height - colH, 28, 12);
    // Column base
    ctx.fillStyle = `rgba(100,82,58,0.65)`;
    ctx.fillRect(cx2 - 14, canvas.height - 16, 28, 16);
  }
  // Ambient dust motes
  for (let i = 0; i < 5; i++) {
    const dx  = ((frameCount * (0.18 + i * 0.06) + i * 180) % 960) - 30;
    const dy  = 200 + ((frameCount * (0.22 + i * 0.04) + i * 90) % 280);
    const da  = 0.08 + Math.sin(frameCount * 0.03 + i) * 0.06;
    ctx.globalAlpha = Math.max(0, da);
    ctx.fillStyle   = '#c8a86a';
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlatforms() {
  const isBoss = !!currentArena.isBossArena;
  for (const pl of currentArena.platforms) {
    if (pl.isFloorDisabled) continue;

    // shadow (skip for moving boss platforms — cheaper and avoids ghost trails)
    if (!pl.ox && !pl.oy) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(pl.x + 4, pl.y + 4, pl.w, pl.h);
    }
    // body
    ctx.fillStyle = currentArena.platColor;
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(pl.x, pl.y, pl.w, 3);
    // border
    ctx.strokeStyle = currentArena.platEdge;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);

    // Boss arena: purple glow on moving platforms
    if (isBoss && (pl.ox !== undefined || pl.oy !== undefined)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,0,255,0.7)';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#aa00ff';
      ctx.shadowBlur  = 10;
      ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
      ctx.restore();
    }

    // Floor hazard flash during warning
    if (isBoss && pl.isFloor && bossFloorState === 'warning') {
      const flash = Math.sin(frameCount * 0.35) > 0;
      if (flash) {
        ctx.save();
        ctx.fillStyle = bossFloorType === 'lava' ? 'rgba(255,70,0,0.55)' : 'rgba(20,0,60,0.70)';
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.restore();
      }
    }
  }

  // Floor hazard countdown banner
  if (isBoss && bossFloorState === 'warning') {
    const secs = Math.ceil(bossFloorTimer / 60);
    const isLava = bossFloorType === 'lava';
    ctx.save();
    ctx.font        = 'bold 20px Arial';
    ctx.fillStyle   = isLava ? '#ff5500' : '#bb88ff';
    ctx.textAlign   = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur  = 10;
    ctx.fillText(`${isLava ? '🌋 LAVA' : '🌑 VOID'} IN ${secs}s`, canvas.width / 2, 444);
    ctx.restore();
  }
}

// ============================================================
// DEATH / RESPAWN / WIN
// ============================================================
function checkDeaths() {
  for (const p of players) {
    if (p.health <= 0 && p.invincible === 0) {
      // Boss defeat: trigger cinematic scene instead of normal death
      if (p.isBoss && !bossDeathScene) { startBossDeathScene(p); continue; }
      if (p.isBoss && bossDeathScene)  { continue; } // handled by death scene
      if (trainingMode && !p.isBoss) {
        // Training mode: player respawns infinitely, no game-over
        addKillFeed(p);
        p.invincible = 999;
        p.ragdollTimer = 55;
        p.ragdollSpin  = (Math.random() > 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.14);
        p.vy = -10; p.vx = (Math.random() - 0.5) * 14;
        respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
        setTimeout(() => { if (gameRunning) p.respawn(); }, 1100);
      } else if (infiniteMode && !p.isBoss) {
        // Infinite mode: award win to opponent, always respawn
        const other = players.find(q => q !== p);
        if (other) { if (p === players[0]) winsP2++; else winsP1++; }
        addKillFeed(p);
        p.invincible = 999;
        respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
        setTimeout(() => { if (gameRunning) p.respawn(); }, 1100);
      } else if (p.lives > 0) {
        p.lives--;
        p.invincible = 999; // block re-trigger until respawn clears it
        addKillFeed(p);
        if (p.lives > 0) {
          respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
          setTimeout(() => { if (gameRunning) p.respawn(); }, 1100);
        } else {
          // Check if boss fake-death should trigger (boss < 1000 HP, once per game)
          const boss = players.find(q => q.isBoss);
          if (boss && boss.health < 1000 && !fakeDeath.triggered && (gameMode === 'boss' || gameMode === 'boss2p')) {
            triggerFakeDeath(p);
          } else {
            // Check if other human players are still alive (2P boss mode)
            const otherHumansAlive = players.some(q => !q.isBoss && q !== p && q.lives > 0 && q.health > 0);
            if (otherHumansAlive) {
              // Stay dead but don't end game — teammate still fighting
              p.ragdollTimer = 90;
              p.ragdollSpin  = (Math.random() > 0.5 ? 1 : -1) * (0.18 + Math.random() * 0.18);
              p.vy           = -14 - Math.random() * 6;
              p.vx           = (Math.random() - 0.5) * 20;
              p.invincible   = 9999; // stay dead
            } else {
              // Launch death ragdoll
              p.ragdollTimer = 90;
              p.ragdollSpin  = (Math.random() > 0.5 ? 1 : -1) * (0.18 + Math.random() * 0.18);
              p.vy           = -14 - Math.random() * 6;
              p.vx           = (Math.random() - 0.5) * 20;
              setTimeout(endGame, 900);
            }
          }
        }
      }
    }
  }
}

function addKillFeed(loser) {
  const killer = players.find(q => q !== loser);
  if (killer) killer.kills++;
  const feed = document.getElementById('killFeed');
  const msg  = document.createElement('div');
  msg.className   = 'kill-msg';
  msg.textContent = `${killer ? killer.name : '?'} KO'd ${loser.name}!`;
  msg.style.color = killer ? killer.color : '#fff';
  feed.prepend(msg);
  setTimeout(() => msg.remove(), 3200);
}

function endGame() {
  gameRunning = false;
  document.getElementById('hud').style.display = 'none';
  const alive  = players.filter(p => p.lives > 0);
  const winner = alive.length === 1 ? alive[0] : null;
  const wt     = document.getElementById('winnerText');
  if (winner) { wt.textContent = winner.name + ' WINS!'; wt.style.color = winner.color; }
  else        { wt.textContent = 'DRAW!';                wt.style.color = '#ffffff'; }
  document.getElementById('statsDisplay').innerHTML =
    players.map(p => `<div class="stat-row" style="color:${p.color}">${p.name}: ${p.kills} KO${p.kills !== 1 ? 's' : ''}</div>`).join('');
  document.getElementById('gameOverOverlay').style.display = 'flex';
}

function backToMenu() {
  gameRunning  = false;
  paused       = false;
  trainingMode = false;
  canvas.style.display = 'block'; // keep visible as animated menu background
  document.getElementById('hud').style.display            = 'none';
  document.getElementById('pauseOverlay').style.display    = 'none';
  document.getElementById('gameOverOverlay').style.display = 'none';
  document.getElementById('menu').style.display            = 'grid';
  const trainingHud = document.getElementById('trainingHud');
  if (trainingHud) trainingHud.style.display = 'none';
  resizeGame();
  if (!menuLoopRunning) {
    menuLoopRunning = true;
    requestAnimationFrame(menuBgLoop);
  }
}

function pauseGame() {
  if (!gameRunning) return;
  paused = !paused;
  document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
}

function resumeGame() {
  paused = false;
  document.getElementById('pauseOverlay').style.display = 'none';
}

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  // Slot 1 = first non-boss player; Slot 2 = boss (normal boss mode) or second human (boss2p)
  const nonBoss = players.filter(p => !p.isBoss);
  const boss    = players.find(p => p.isBoss);
  const hudP1   = nonBoss[0];
  const hudP2   = (gameMode === 'boss2p') ? nonBoss[1] : (boss || nonBoss[1]);
  const hudPlayers = [hudP1, hudP2];

  for (let i = 0; i < 2; i++) {
    const p = hudPlayers[i];
    if (!p) continue;
    const n  = i + 1;
    const pct = Math.max(0, p.health / p.maxHealth * 100);
    const hEl  = document.getElementById(`p${n}Health`);
    const lEl  = document.getElementById(`p${n}Lives`);
    const nEl  = document.getElementById(`p${n}HudName`);
    const sEl  = document.getElementById(`p${n}Super`);
    const cdEl = document.getElementById(`p${n}CdBar`);
    if (hEl) {
      hEl.style.width      = pct + '%';
      hEl.style.background = `hsl(${pct * 1.2},100%,44%)`;
    }
    if (lEl) {
      if (p.isBoss) {
        // Boss: show a phase indicator instead of hearts
        const phase = p.getPhase ? p.getPhase() : 1;
        lEl.innerHTML = `<span style="font-size:10px;letter-spacing:1px;color:#cc00ee">PHASE ${phase}</span>`;
      } else if (infiniteMode || p.isDummy || p.lives >= 50) {
        lEl.innerHTML = '∞';
      } else {
        const capped    = Math.min(p.lives, 10);
        const cappedMax = Math.min(p._maxLives !== undefined ? p._maxLives : chosenLives, 10);
        const full  = '❤'.repeat(Math.max(0, capped));
        const empty = '<span style="opacity:0.18">❤</span>'.repeat(Math.max(0, cappedMax - capped));
        lEl.innerHTML = full + empty;
      }
    }
    if (nEl) nEl.style.color = p.color;
    if (sEl) {
      sEl.style.width = p.superMeter + '%';
      if (p.superReady) sEl.classList.add('ready');
      else              sEl.classList.remove('ready');
    }
    if (cdEl) {
      // Show how much of the Q cooldown has recovered (full = ready)
      const maxCd = p.weapon.abilityCooldown;
      const cdPct = maxCd > 0
        ? Math.max(0, 100 - (p.abilityCooldown / maxCd) * 100)
        : 100;
      cdEl.style.width = cdPct + '%';
    }
    const shEl = document.getElementById(`p${n}ShieldBar`);
    if (shEl) {
      const shPct = p.shieldCooldown > 0
        ? Math.max(0, 100 - (p.shieldCooldown / 1800) * 100)
        : 100;
      shEl.style.width = shPct + '%';
      shEl.style.background = p.shieldCooldown > 0
        ? 'linear-gradient(90deg, #4488ff, #88ccff)'
        : 'linear-gradient(90deg, #44ddff, #ffffff)';
    }
    const wEl = document.getElementById(`p${n}WeaponHud`);
    if (wEl) wEl.textContent = p.weapon.name;
  }
}

// ============================================================
// MENU BACKGROUND LOOP  (animated arena showcase behind the menu)
// ============================================================
function menuBgLoop() {
  if (!menuLoopRunning) return;

  menuBgTimer++;
  menuBgFrameCount++;

  // Cycle to next arena every ~5 seconds (300 frames)
  if (menuBgTimer >= 300 && menuBgFade === 0) {
    menuBgFade  = 0.01;
    menuBgTimer = 0;
  }
  if (menuBgFade > 0) {
    menuBgFade = Math.min(2, menuBgFade + 0.028);
    if (menuBgFade >= 1 && menuBgFade < 1.03) {
      // Peak darkness: switch to next arena
      menuBgArenaIdx = (menuBgArenaIdx + 1) % ARENA_KEYS_ORDERED.length;
    }
    if (menuBgFade >= 2) menuBgFade = 0;
  }

  // Temporarily borrow arena + frame state for the background draw
  const savedKey   = currentArenaKey;
  const savedArena = currentArena;
  const savedFrame = frameCount;
  currentArenaKey  = ARENA_KEYS_ORDERED[menuBgArenaIdx];
  currentArena     = ARENAS[currentArenaKey];
  frameCount       = menuBgFrameCount;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground();

  // Semi-transparent dark overlay so menu text stays readable
  ctx.save();
  ctx.fillStyle = 'rgba(7,7,15,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Cross-fade overlay during arena transitions
  if (menuBgFade > 0) {
    const fadeA = menuBgFade <= 1 ? menuBgFade : 2 - menuBgFade;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, fadeA));
    ctx.fillStyle   = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Restore game state
  currentArenaKey = savedKey;
  currentArena    = savedArena;
  frameCount      = savedFrame;

  requestAnimationFrame(menuBgLoop);
}

// ============================================================
// BOSS DIALOGUE  (speech bubble above boss)
// ============================================================
function showBossDialogue(text, dur = 220) {
  bossDialogue.text  = text;
  bossDialogue.timer = dur;
}

function drawBossDialogue() {
  if (bossDialogue.timer <= 0) return;
  const boss = players.find(p => p.isBoss);
  if (!boss || boss.health <= 0) return;
  bossDialogue.timer--;

  const alpha = Math.min(1, bossDialogue.timer < 45 ? bossDialogue.timer / 45 : 1);
  const text  = bossDialogue.text;
  const bx    = boss.cx();
  const by    = boss.y - 18;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font        = 'bold 13px Arial';
  ctx.textAlign   = 'center';
  const tw  = ctx.measureText(text).width;
  const pad = 11;
  const bw  = tw + pad * 2;
  const bh  = 28;
  const rx  = bx - bw / 2;
  const ry  = by - bh;

  // Bubble background
  ctx.fillStyle   = 'rgba(18,0,32,0.90)';
  ctx.strokeStyle = '#cc00ee';
  ctx.lineWidth   = 1.8;
  ctx.beginPath();
  ctx.roundRect(rx, ry, bw, bh, 7);
  ctx.fill();
  ctx.stroke();

  // Tail pointer
  ctx.beginPath();
  ctx.moveTo(bx - 8, by);
  ctx.lineTo(bx,     by + 12);
  ctx.lineTo(bx + 8, by);
  ctx.closePath();
  ctx.fillStyle = 'rgba(18,0,32,0.90)';
  ctx.fill();
  ctx.strokeStyle = '#cc00ee';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Text
  ctx.fillStyle   = '#f0aaff';
  ctx.shadowColor = '#aa00ee';
  ctx.shadowBlur  = 8;
  ctx.fillText(text, bx, ry + bh - 9);
  ctx.restore();
}

// ============================================================
// BOSS BEAMS
// ============================================================
function drawBossBeams() {
  for (const b of bossBeams) {
    ctx.save();
    if (b.phase === 'warning') {
      const progress = 1 - b.warningTimer / 300;
      const flicker  = Math.sin(frameCount * 0.35 + b.x * 0.05) * 0.1;
      ctx.globalAlpha = clamp(0.15 + progress * 0.40 + flicker, 0.05, 0.65);
      ctx.strokeStyle = '#dd77ff';
      ctx.lineWidth   = 5 + progress * 7;
      ctx.shadowColor = '#9900ee';
      ctx.shadowBlur  = 20;
      ctx.setLineDash([22, 14]);
      ctx.beginPath();
      ctx.moveTo(b.x, 462);
      ctx.lineTo(b.x, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      // Pulsing ground indicator
      const pulse = 8 + progress * 14 + Math.sin(frameCount * 0.4) * 4;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle   = '#ff44ff';
      ctx.shadowBlur  = 24;
      ctx.beginPath();
      ctx.arc(b.x, 462, pulse, 0, Math.PI * 2);
      ctx.fill();
      // Countdown text
      const secs = Math.ceil(b.warningTimer / 60);
      ctx.globalAlpha = 0.9;
      ctx.font        = 'bold 11px Arial';
      ctx.fillStyle   = '#ffffff';
      ctx.textAlign   = 'center';
      ctx.shadowBlur  = 6;
      ctx.fillText(secs + 's', b.x, 448);
    } else if (b.phase === 'active') {
      ctx.globalAlpha = 0.9;
      // Outer glow
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth   = 24;
      ctx.shadowColor = '#cc00ff';
      ctx.shadowBlur  = 55;
      ctx.beginPath();
      ctx.moveTo(b.x, canvas.height);
      ctx.lineTo(b.x, 0);
      ctx.stroke();
      // Core beam
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 8;
      ctx.shadowBlur  = 20;
      ctx.beginPath();
      ctx.moveTo(b.x, canvas.height);
      ctx.lineTo(b.x, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ============================================================
// BOSS SPIKES
// ============================================================
function drawBossSpikes() {
  for (const sp of bossSpikes) {
    if (sp.done || sp.h <= 0) continue;
    const baseY = 460;
    const tipY  = baseY - sp.h;
    ctx.save();
    ctx.shadowColor = '#cc00ff';
    ctx.shadowBlur  = 12;
    // Spike body (tapered rectangle, 10px base → 2px tip)
    ctx.beginPath();
    ctx.moveTo(sp.x - 3,   baseY);
    ctx.lineTo(sp.x + 3,   baseY);
    ctx.lineTo(sp.x + 0.5, tipY);
    ctx.lineTo(sp.x - 0.5, tipY);
    ctx.closePath();
    ctx.fillStyle = '#aaaacc';
    ctx.fill();
    ctx.strokeStyle = '#cc00ff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// ============================================================
// SPARTAN RAGE VISUALS  (Kratos class perk active)
// ============================================================
function drawSpartanRageEffects() {
  let anyRage = false;
  for (const p of players) {
    if (p.spartanRageTimer <= 0) continue;
    anyRage = true;
    const pct = p.spartanRageTimer / 300;
    const pcx = p.cx(), pcy = p.cy();
    ctx.save();
    // Radial aura
    const grad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, 52 + Math.sin(frameCount * 0.12) * 6);
    grad.addColorStop(0,   `rgba(255,100,0,${0.32 * pct})`);
    grad.addColorStop(0.5, `rgba(255,60,0,${0.18 * pct})`);
    grad.addColorStop(1,   'rgba(255,30,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pcx, pcy, 58, 0, Math.PI * 2);
    ctx.fill();
    // Pulsing outline ring
    ctx.strokeStyle = `rgba(255,140,0,${0.65 * pct})`;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(pcx, pcy, 34 + Math.sin(frameCount * 0.18) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Floating ember particles every 3 frames
    if (frameCount % 3 === 0 && settings.particles) {
      const _ang = Math.random() * Math.PI * 2;
      const _r   = 16 + Math.random() * 24;
      particles.push({
        x: pcx + Math.cos(_ang) * _r, y: pcy + Math.sin(_ang) * _r,
        vx: (Math.random() - 0.5) * 1.8, vy: -2.0 - Math.random() * 2.2,
        color: Math.random() < 0.65 ? '#ff6600' : '#ff9900',
        size: 1.6 + Math.random() * 2.2, life: 28 + Math.random() * 22, maxLife: 50
      });
    }
  }
  // Screen orange tint — only once regardless of how many have rage
  if (anyRage) {
    const _tintA = 0.055 + Math.sin(frameCount * 0.09) * 0.025;
    ctx.save();
    ctx.globalAlpha = _tintA;
    ctx.fillStyle   = '#ff5500';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// ============================================================
// CLASS VISUAL EFFECTS (Thor lightning arcs, Ninja shadow trail, etc.)
// ============================================================
const classTrails = []; // {x, y, color, alpha, size, life}

function drawClassEffects() {
  // Update + draw shadow trails
  for (let i = classTrails.length - 1; i >= 0; i--) {
    const t = classTrails[i];
    t.alpha -= 0.04;
    t.life--;
    if (t.life <= 0) { classTrails.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = Math.max(0, t.alpha);
    ctx.fillStyle   = t.color;
    ctx.beginPath();
    ctx.roundRect(t.x, t.y, 22, 60, 4);
    ctx.fill();
    ctx.restore();
  }

  for (const p of players) {
    if (p.health <= 0 || p.backstageHiding) continue;

    // THOR: Periodic lightning arc toward target + electric sparks on body
    if (p.charClass === 'thor') {
      // Ambient crackling particles
      if (frameCount % 8 === 0 && settings.particles) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: p.cx() + Math.cos(a) * 14, y: p.cy() + Math.sin(a) * 14,
          vx: (Math.random()-0.5)*2, vy: -1.5 - Math.random()*1.5,
          color: Math.random() < 0.6 ? '#ffff44' : '#aaddff',
          size: 1.5 + Math.random()*2, life: 14 + Math.random()*10, maxLife: 24
        });
      }
      // Lightning arc toward target every 55 frames
      if (p.target && p.target.health > 0 && frameCount % 55 === 0) {
        const tx = p.target.cx(), ty = p.target.cy();
        const sx2 = p.cx(), sy2 = p.cy();
        const steps = 7;
        for (let si = 0; si < steps; si++) {
          const prog = si / steps;
          const jx   = sx2 + (tx - sx2) * prog + (Math.random()-0.5)*30;
          const jy   = sy2 + (ty - sy2) * prog + (Math.random()-0.5)*20;
          particles.push({ x: jx, y: jy, vx: 0, vy: 0,
            color: '#ffffaa', size: 2.5, life: 8, maxLife: 8 });
        }
      }
    }

    // NINJA: Shadow trail during fast movement
    if (p.charClass === 'ninja' && Math.abs(p.vx) > 5 && frameCount % 4 === 0) {
      classTrails.push({ x: p.x, y: p.y, color: 'rgba(0,200,80,0.45)', alpha: 0.45, size: 1, life: 14 });
    }

    // KRATOS: Ember sparks when in Spartan Rage (already handled by drawSpartanRageEffects)
    // Extra hit flash crackle when rage is active and hit
    if (p.charClass === 'kratos' && p.spartanRageTimer > 0 && p.hurtTimer > 0) {
      if (settings.particles) {
        for (let k = 0; k < 3; k++) {
          particles.push({ x: p.cx() + (Math.random()-0.5)*20, y: p.cy() + (Math.random()-0.5)*20,
            vx: (Math.random()-0.5)*4, vy: -2-Math.random()*3,
            color: '#ff8800', size: 2+Math.random()*2, life: 12, maxLife: 12 });
        }
      }
    }

    // GUNNER: Muzzle flash lingering glow on weapon arm (cosmetic)
    if (p.charClass === 'gunner' && p.attackTimer > 0 && p.attackTimer === p.attackDuration) {
      if (settings.particles) {
        spawnParticles(p.cx() + p.facing * 28, p.y + 22, '#ffdd00', 5);
      }
    }
  }
}

// ============================================================
// BOSS DEFEAT SCENE
// ============================================================
function startBossDeathScene(boss) {
  bossDeathScene = { phase: 'shatter', timer: 0, orbX: boss.cx(), orbY: boss.cy(), orbR: 0, orbVx: 0, orbVy: 0 };
  boss.invincible = 9999;
  screenShake     = 55;
  for (let _i = 0; _i < 80; _i++) {
    const _a = Math.random() * Math.PI * 2;
    const _s = 2 + Math.random() * 12;
    particles.push({ x: boss.cx(), y: boss.cy(),
      vx: Math.cos(_a)*_s, vy: Math.sin(_a)*_s,
      color: ['#cc00ee','#9900bb','#ff00ff','#000000','#ffffff','#6600aa'][Math.floor(Math.random()*6)],
      size: 2 + Math.random() * 7, life: 70 + Math.random() * 80, maxLife: 150 });
  }
  showBossDialogue('N-no... this is not over...', 360);
}

function updateBossDeathScene() {
  const sc   = bossDeathScene;
  if (!sc) return;
  sc.timer++;
  const boss = players.find(p => p.isBoss);

  if (sc.phase === 'shatter') {
    if (boss && sc.timer % 6 === 0) {
      spawnParticles(boss.cx() + (Math.random()-0.5)*44, boss.cy() + (Math.random()-0.5)*44,
        Math.random() < 0.5 ? '#cc00ee' : '#000000', 5);
      screenShake = Math.max(screenShake, 8);
    }
    if (sc.timer >= 100) {
      sc.phase = 'orb_form';
      if (boss) { sc.orbX = boss.cx(); sc.orbY = boss.cy(); boss.backstageHiding = true; }
      screenShake = 40;
      spawnParticles(sc.orbX, sc.orbY, '#9900ee', 50);
      spawnParticles(sc.orbX, sc.orbY, '#000000', 30);
    }
  } else if (sc.phase === 'orb_form') {
    sc.orbR = Math.min(26, sc.orbR + 0.55);
    if (sc.timer >= 158) {
      sc.phase = 'portal_open';
      const _px = Math.min(sc.orbX + 220, canvas.width - 60);
      openBackstagePortal(_px, sc.orbY, 'exit');
    }
  } else if (sc.phase === 'portal_open') {
    if (sc.timer >= 192) {
      sc.phase    = 'orb_fly';
      sc.orbVx    = 4;
      sc.orbVy    = -0.8;
    }
  } else if (sc.phase === 'orb_fly') {
    sc.orbX += sc.orbVx;
    sc.orbY += sc.orbVy;
    sc.orbVx  = Math.min(sc.orbVx * 1.1, 24);
    sc.orbR   = Math.max(0, sc.orbR - 0.18);
    if (sc.orbX > canvas.width + 50 || sc.orbR <= 0) {
      sc.phase  = 'portal_close';
      for (const bp of backstagePortals) bp.phase = 'closing';
    }
  } else if (sc.phase === 'portal_close') {
    if (sc.timer >= 310) {
      bossDeathScene = null;
      endGame();
    }
  }
}

function drawBossDeathScene() {
  const sc = bossDeathScene;
  if (!sc || sc.orbR <= 0) return;
  ctx.save();
  const _g = ctx.createRadialGradient(sc.orbX, sc.orbY, 0, sc.orbX, sc.orbY, sc.orbR);
  _g.addColorStop(0,   'rgba(0,0,12,1)');
  _g.addColorStop(0.6, 'rgba(50,0,80,0.92)');
  _g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle   = _g;
  ctx.shadowColor = '#6600aa';
  ctx.shadowBlur  = 20;
  ctx.beginPath();
  ctx.arc(sc.orbX, sc.orbY, sc.orbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// FAKE DEATH SCENE  (boss < 1000 HP + player loses last life)
// ============================================================
function triggerFakeDeath(player) {
  fakeDeath.active    = true;
  fakeDeath.triggered = true;
  fakeDeath.timer     = 0;
  fakeDeath.player    = player;
  player.invincible   = 9999;
  player.ragdollTimer = 80;
  player.ragdollSpin  = (Math.random() > 0.5 ? 1 : -1) * (0.18 + Math.random() * 0.14);
  player.vy           = -12;
  player.vx           = (Math.random() - 0.5) * 14;
  screenShake         = Math.max(screenShake, 20);
  const boss = players.find(p => p.isBoss);
  if (boss) {
    // Force-interrupt any current dialogue after 1.2s
    setTimeout(() => {
      if (gameRunning) {
        bossDialogue = { text: "We aren't finished yet..", timer: 320 };
      }
    }, 1200);
  }
}

function updateFakeDeathScene() {
  if (!fakeDeath.active) return;
  fakeDeath.timer++;
  const p = fakeDeath.player;

  // Phase 1 (t=0–150): dark overlay + boss dialogue
  // Phase 2 (t=150–220): purple light column rises
  if (fakeDeath.timer === 150 && p) {
    screenShake = Math.max(screenShake, 32);
    if (settings.particles) {
      for (let i = 0; i < 60; i++) {
        const angle = -Math.PI/2 + (Math.random()-0.5)*0.4;
        const spd   = 4 + Math.random() * 10;
        particles.push({ x: p.spawnX, y: p.spawnY,
          vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
          color: Math.random() < 0.6 ? '#aa44ff' : '#ffffff',
          size: 2 + Math.random()*5, life: 60 + Math.random()*40, maxLife: 100 });
      }
    }
  }

  // Phase 3 (t=220): revive player with 2 lives
  if (fakeDeath.timer === 220 && p) {
    p.lives        = 2;
    p.invincible   = 150;
    p.ragdollTimer = 0;
    p.ragdollSpin  = 0;
    p.ragdollAngle = 0;
    p.respawn();
    fakeDeath.active = false;
  }
}

function drawFakeDeathScene() {
  if (!fakeDeath.active && fakeDeath.timer === 0) return;
  if (!fakeDeath.active) return; // scene ended
  const t = fakeDeath.timer;
  const p = fakeDeath.player;

  // Dim overlay (builds up in first 60 frames, stays)
  const overlayAlpha = Math.min(0.72, t / 80 * 0.72);
  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.fillStyle   = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // "DEFEATED" text at top (fades in at t=40)
  if (t > 40) {
    const a = Math.min(1, (t - 40) / 30);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font        = 'bold 42px Arial';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#ff3333';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur  = 24;
    ctx.fillText('DEFEATED', canvas.width / 2, canvas.height / 2 - 40);
    ctx.restore();
  }

  // Purple column of light (t=130–220)
  if (t > 130 && p) {
    const colAlpha = Math.min(1, (t - 130) / 40);
    const colPulse = Math.abs(Math.sin((t - 130) * 0.15));
    ctx.save();
    ctx.globalAlpha = colAlpha * (0.7 + colPulse * 0.3);
    const colGrad = ctx.createLinearGradient(p.spawnX, canvas.height, p.spawnX, 0);
    colGrad.addColorStop(0, 'rgba(160,0,255,0.85)');
    colGrad.addColorStop(0.5, 'rgba(200,100,255,0.55)');
    colGrad.addColorStop(1, 'rgba(160,0,255,0)');
    ctx.fillStyle = colGrad;
    ctx.fillRect(p.spawnX - 18, 0, 36, canvas.height);
    // Bright core
    ctx.fillStyle = `rgba(255,200,255,${colAlpha * 0.55})`;
    ctx.fillRect(p.spawnX - 6, 0, 12, canvas.height);
    ctx.restore();
  }

  // "REVIVING..." text (t=160)
  if (t > 160) {
    const a2 = Math.min(1, (t - 160) / 20);
    ctx.save();
    ctx.globalAlpha = a2;
    ctx.font        = 'bold 22px Arial';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#dd88ff';
    ctx.shadowColor = '#aa00ff';
    ctx.shadowBlur  = 14;
    ctx.fillText('REVIVING...', canvas.width / 2, canvas.height / 2 + 10);
    ctx.restore();
  }
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop() {
  if (!gameRunning) return;
  if (paused) { requestAnimationFrame(gameLoop); return; }
  frameCount++;

  processInput();

  // ---- BOSS ARENA: oscillating platforms + floor hazard state machine ----
  if (currentArena.isBossArena) {
    // Animate moving platforms — random-lerp targets for unpredictable movement
    for (const pl of currentArena.platforms) {
      if (pl.ox !== undefined) {
        if (pl.rx === undefined || pl.rTimer <= 0) {
          // Pick a completely random X anywhere in the platform's range
          pl.rx    = pl.ox + (Math.random() - 0.5) * pl.oscX * 2;
          pl.rx    = clamp(pl.rx, pl.ox - pl.oscX, pl.ox + pl.oscX);
          pl.rTimer = 30 + Math.floor(Math.random() * 50); // 0.5–1.3 s
        }
        pl.rTimer--;
        pl.x = lerp(pl.x, pl.rx, 0.07); // faster chase
      }
      if (pl.oy !== undefined) {
        if (pl.ry === undefined || pl.ryTimer <= 0) {
          pl.ry    = pl.oy + (Math.random() - 0.5) * pl.oscY * 2;
          pl.ry    = clamp(pl.ry, pl.oy - pl.oscY, pl.oy + pl.oscY);
          pl.ryTimer = 30 + Math.floor(Math.random() * 50);
        }
        pl.ryTimer--;
        pl.y = lerp(pl.y, pl.ry, 0.07);
      }
    }

    // Floor hazard state machine
    bossFloorTimer--;
    if (bossFloorTimer <= 0) {
      if (bossFloorState === 'normal') {
        bossFloorState = 'warning';
        bossFloorType  = Math.random() < 0.5 ? 'lava' : 'void';
        bossFloorTimer = 300; // 5-second warning
        showBossDialogue(bossFloorType === 'lava'
          ? randChoice(['The floor... will burn!', 'Enjoy the heat!', 'Stand still... I dare you.'])
          : randChoice(['The void... opens below!', 'Nowhere to stand!', 'Fall into darkness!']), 220);
      } else if (bossFloorState === 'warning') {
        bossFloorState = 'hazard';
        bossFloorTimer = 900; // 15-second hazard
        const floorPl  = currentArena.platforms.find(p => p.isFloor);
        if (bossFloorType === 'lava') {
          if (floorPl) floorPl.isFloorDisabled = true;
          currentArena.hasLava = true;
          currentArena.lavaY   = 462;
          currentArena.deathY  = 560;
        } else {
          if (floorPl) floorPl.isFloorDisabled = true;
          currentArena.deathY = 530;
        }
      } else { // 'hazard' → back to normal
        bossFloorState = 'normal';
        bossFloorTimer = 1200 + Math.floor(Math.random() * 600); // 20–30 s until next
        const floorPl  = currentArena.platforms.find(p => p.isFloor);
        if (floorPl) floorPl.isFloorDisabled = false;
        currentArena.hasLava = false;
        currentArena.deathY  = 640;
      }
    }
  }

  const sx = (Math.random() - 0.5) * screenShake;
  const sy = (Math.random() - 0.5) * screenShake;
  ctx.setTransform(1, 0, 0, 1, sx, sy);

  drawBackground();
  drawPlatforms();
  drawBackstagePortals();
  drawMapPerks();

  // Boss beams — update logic + draw
  if (currentArena.isBossArena) {
    for (const b of bossBeams) {
      if (b.phase === 'warning') {
        if (--b.warningTimer <= 0) { b.phase = 'active'; b.activeTimer = 110; }
      } else if (b.phase === 'active') {
        if (--b.activeTimer <= 0) { b.done = true; }
        else {
          // Deal damage each frame to players caught in beam
          const boss = players.find(p => p.isBoss);
          for (const p of players) {
            if (p.isBoss || p.health <= 0 || p.invincible > 0) continue;
            if (Math.abs(p.cx() - b.x) < 24) dealDamage(boss || players[1], p, 12, 5);
          }
        }
      }
    }
    bossBeams = bossBeams.filter(b => !b.done);
    drawBossBeams();

    // Boss spikes — update and draw
    const bossRef = players.find(p => p.isBoss);
    for (const sp of bossSpikes) {
      if (sp.done) continue;
      if (sp.phase === 'rising') {
        sp.h += 8;
        if (sp.h >= sp.maxH) { sp.h = sp.maxH; sp.phase = 'staying'; sp.stayTimer = 180; }
      } else if (sp.phase === 'staying') {
        sp.stayTimer--;
        if (sp.stayTimer <= 0) sp.phase = 'falling';
      } else if (sp.phase === 'falling') {
        sp.h -= 6;
        if (sp.h <= 0) { sp.h = 0; sp.done = true; }
      }
      // Damage players caught by spike
      if (sp.phase === 'rising' || sp.phase === 'staying') {
        const spikeTopY = 460 - sp.h;
        for (const p of players) {
          if (p.isBoss || p.health <= 0 || p.invincible > 0) continue;
          if (Math.abs(p.cx() - sp.x) < 9 && p.y + p.h > spikeTopY) {
            dealDamage(bossRef || players.find(q => q.isBoss) || players[1], p, 20, 14);
          }
        }
      }
    }
    bossSpikes = bossSpikes.filter(sp => !sp.done);
    drawBossSpikes();
    if (bossDeathScene) updateBossDeathScene();
  }

  // Projectiles
  projectiles.forEach(p => p.update());
  projectiles = projectiles.filter(p => p.active);
  projectiles.forEach(p => p.draw());

  // Minions (boss-spawned)
  minions.forEach(m => { if (m.health > 0) m.update(); });
  minions.forEach(m => { if (m.health > 0) m.draw(); });
  minions = minions.filter(m => m.health > 0);

  // Training dummies / bots
  if (trainingMode) {
    trainingDummies.forEach(d => { if (d.health > 0 || d.invincible > 0) d.update(); });
    trainingDummies.forEach(d => { if (d.health > 0 || d.invincible > 0) d.draw(); });
    // Remove dead bots (lives=0), keep dummies (they auto-heal)
    trainingDummies = trainingDummies.filter(d => {
      if (d.isDummy) return true; // dummies auto-heal, never remove
      return d.health > 0 || d.invincible > 0 || d.lives > 0;
    });
  }

  // Players
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.update(); });
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.draw(); });
  drawSpartanRageEffects();
  drawClassEffects();
  if (bossDeathScene) drawBossDeathScene();
  updateMapPerks();
  updateFakeDeathScene();
  drawFakeDeathScene();

  // Particles — filter dead ones first so life never goes below 1 during draw
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12; p.vx *= 0.96;
    p.life--;
    if (p.life <= 0) return;
    const a = p.life / p.maxLife;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.01, p.size * a), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Damage texts
  damageTexts.forEach(d => { d.update(); d.draw(); });
  damageTexts = damageTexts.filter(d => d.life > 0);

  // Respawn countdowns
  for (const cd of respawnCountdowns) {
    cd.framesLeft--;
    if (cd.framesLeft <= 0) continue;
    const num = Math.ceil(cd.framesLeft / 22);
    const a   = Math.min(1, cd.framesLeft / 18) * (1 - Math.max(0, (22 - cd.framesLeft % 22) / 22) * 0.3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font        = 'bold 32px Arial';
    ctx.fillStyle   = cd.color;
    ctx.textAlign   = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur  = 8;
    ctx.fillText(num, cd.x, cd.y);
    ctx.restore();
  }
  respawnCountdowns = respawnCountdowns.filter(cd => cd.framesLeft > 0);

  // Boss speech bubble (drawn last so it's above everything)
  if (currentArena.isBossArena) drawBossDialogue();

  screenShake *= 0.84;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  checkDeaths();
  updateHUD();

  // Infinite mode: draw win score on canvas (outside shake transform)
  if (infiniteMode && gameRunning) {
    const p1c = players[0] ? players[0].color : '#00d4ff';
    const p2c = players[1] ? players[1].color : '#ff4455';
    ctx.save();
    ctx.textAlign   = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur  = 14;
    ctx.font        = 'bold 30px Arial';
    ctx.fillStyle   = p1c;
    ctx.fillText(winsP1, canvas.width / 2 - 48, 40);
    ctx.fillStyle   = 'rgba(255,255,255,0.7)';
    ctx.fillText('—', canvas.width / 2, 40);
    ctx.fillStyle   = p2c;
    ctx.fillText(winsP2, canvas.width / 2 + 48, 40);
    ctx.restore();
  }

  requestAnimationFrame(gameLoop);
}

// ============================================================
// INPUT
// ============================================================
const keysDown      = new Set();
const keyHeldFrames = {};   // key → frames held continuously

const SCROLL_BLOCK = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 's', 'S', '/']);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { pauseGame(); return; }
  if (SCROLL_BLOCK.has(e.key)) e.preventDefault();
  if (keysDown.has(e.key)) return; // already tracked — let held-frame counter run
  keysDown.add(e.key);

  if (!gameRunning || paused) return;

  players.forEach((p, i) => {
    if (p.isAI || p.health <= 0) return;
    const other         = players[i === 0 ? 1 : 0];
    const incapacitated = p.ragdollTimer > 0 || p.stunTimer > 0;
    if (!incapacitated && e.key === p.controls.attack)  { e.preventDefault(); p.attack(other); }
    if (!incapacitated && e.key === p.controls.ability) { e.preventDefault(); p.ability(other); }
    if (!incapacitated && p.controls.super && e.key === p.controls.super) { e.preventDefault(); p.useSuper(other); }
  });
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key);
  delete keyHeldFrames[e.key];
});

const BOOST_HOLD    = 14;   // frames to hold before boost fires
const BOOST_VX      = 16;   // horizontal dash speed
const BOOST_VY      = -22;  // super-jump velocity
const BOOST_CD      = 60;   // frames before next boost
const SHIELD_MAX    = 140;  // max frames shield stays up (~2.3 s)
const SHIELD_CD     = 900; // 30-second cooldown at 60 fps

function processInput() {
  if (!gameRunning || paused) return;

  // Update key-held counters
  for (const k of keysDown) keyHeldFrames[k] = (keyHeldFrames[k] || 0) + 1;

  players.forEach(p => {
    if (p.isAI || p.health <= 0) return;
    if (p.ragdollTimer > 0 || p.stunTimer > 0) { p.shielding = false; return; }

    const spd  = 5.2 * (p.classSpeedMult || 1.0) * (p._speedBuff > 0 ? 1.35 : 1.0);
    const lHeld = keyHeldFrames[p.controls.left]  || 0;
    const rHeld = keyHeldFrames[p.controls.right] || 0;
    const wHeld = keyHeldFrames[p.controls.jump]  || 0;

    // --- Regular movement ---
    if (keysDown.has(p.controls.left))  p.vx = -spd;
    if (keysDown.has(p.controls.right)) p.vx =  spd;

    // --- Jump (ground jump + double jump) ---
    if (wHeld === 1) {
      if (p.onGround) {
        // Ground jump
        p.vy = -16;
        p.canDoubleJump = true; // enable one double-jump after leaving ground
        spawnParticles(p.cx(), p.y + p.h, '#ffffff', 5);
      } else if (p.canDoubleJump) {
        // Double jump in air
        p.vy = -13;
        p.canDoubleJump = false;
        spawnParticles(p.cx(), p.cy(), p.color,  8);
        spawnParticles(p.cx(), p.cy(), '#ffffff', 5);
      }
    }
    // Hold jump for super jump (ground only)
    if (keysDown.has(p.controls.jump) && p.onGround &&
        wHeld === BOOST_HOLD && p.boostCooldown === 0) {
      p.vy = BOOST_VY;
      p.boostCooldown = BOOST_CD;
      p.canDoubleJump = true;
      spawnParticles(p.cx(), p.y + p.h, '#00d4ff', 12);
      spawnParticles(p.cx(), p.cy(),    '#ffffff',  5);
    }

    // --- Directional boost (hold threshold) ---
    if (p.boostCooldown === 0) {
      if (lHeld === BOOST_HOLD && keysDown.has(p.controls.left)) {
        p.vx = -BOOST_VX;
        p.boostCooldown = BOOST_CD;
        spawnParticles(p.cx(), p.cy(), '#00d4ff', 8);
        // Thor: thunder shockwave on dash
        if (p.charClass === 'thor') {
          spawnRing(p.cx(), p.cy());
          if (p.target && dist(p, p.target) < 130) dealDamage(p, p.target, 8, 6);
        }
        // Ninja: reduced dash cooldown
        if (p.charClass === 'ninja') p.boostCooldown = 20;
      }
      if (rHeld === BOOST_HOLD && keysDown.has(p.controls.right)) {
        p.vx = BOOST_VX;
        p.boostCooldown = BOOST_CD;
        spawnParticles(p.cx(), p.cy(), '#00d4ff', 8);
        // Thor: thunder shockwave on dash
        if (p.charClass === 'thor') {
          spawnRing(p.cx(), p.cy());
          if (p.target && dist(p, p.target) < 130) dealDamage(p, p.target, 8, 6);
        }
        // Ninja: reduced dash cooldown
        if (p.charClass === 'ninja') p.boostCooldown = 20;
      }
    }

    // --- S / ArrowDown = boost shield (30-second cooldown) ---
    const sHeld = keysDown.has(p.controls.shield);
    if (sHeld && p.shieldCooldown === 0) {
      p.shielding       = true;
      p.shieldHoldTimer = (p.shieldHoldTimer || 0) + 1;
      if (p.shieldHoldTimer >= SHIELD_MAX) {
        // Max duration exhausted → forced break and start cooldown
        p.shielding       = false;
        p.shieldCooldown  = SHIELD_CD;
        p.shieldHoldTimer = 0;
      }
    } else {
      if (p.shielding && !sHeld) {
        // Player released S — start cooldown if they used it for more than 3 frames
        if ((p.shieldHoldTimer || 0) > 3) p.shieldCooldown = SHIELD_CD;
        p.shielding       = false;
        p.shieldHoldTimer = 0;
      }
      if (!sHeld) p.shielding = false;
    }
  });
}

// ============================================================
// MENU UI HANDLERS
// ============================================================
function selectMode(mode) {
  gameMode = mode;
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
  const isBot      = mode === 'bot';
  const isBoss     = mode === 'boss';
  const isBoss2p   = mode === 'boss2p';
  const isTraining = mode === 'training';
  // Boss 1P: hide P2 controls. Boss 2P: show P2 controls.
  document.getElementById('p2Title').textContent          = isBoss ? 'CREATOR' : (isBoss2p ? 'Player 2' : (isBot ? 'BOT' : (isTraining ? 'TRAINING' : 'Player 2')));
  document.getElementById('p2Hint').textContent           = isBoss ? 'Boss — AI Controlled' : (isBoss2p ? '← → ↑ move · Enter attack · . ability · / super · ↓ shield' : (isBot ? 'AI Controlled' : (isTraining ? 'Practice mode' : '← → ↑ move · Enter attack · . ability · / super · ↓ shield')));
  document.getElementById('difficultyRow').style.display  = isBot  ? 'flex'  : 'none';
  document.getElementById('p2ColorRow').style.display     = (isBoss || isTraining) ? 'none'  : 'flex';
  document.getElementById('p2WeaponRow').style.display    = (isBoss || isTraining) ? 'none'  : 'flex';
  document.getElementById('p2ClassRow').style.display     = (isBoss || isTraining) ? 'none'  : 'flex';
  // Training panel visibility
  const trainingPanel = document.getElementById('trainingPanel');
  if (trainingPanel) trainingPanel.style.display = isTraining ? 'block' : 'none';
  // Boss/training mode: hide arena picker and ∞ infinite
  document.getElementById('arenaSection').style.display   = (isBoss || isBoss2p || isTraining) ? 'none'  : '';
  document.getElementById('infiniteOption').style.display = (isBoss || isBoss2p || isTraining) ? 'none'  : '';
  if ((isBoss || isBoss2p || isTraining) && infiniteMode) {
    infiniteMode = false;
    selectLives(3);
  }
}

function selectArena(name) {
  selectedArena = name;
  document.querySelectorAll('.arena-card[data-arena]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-arena="${name}"]`).classList.add('active');
}

function selectLives(n) {
  infiniteMode = (n === 0);
  chosenLives  = infiniteMode ? 3 : n; // placeholder when infinite
  document.querySelectorAll('.arena-card[data-lives]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-lives="${n}"]`).classList.add('active');
}

function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function toggleCard(id) {
  const card  = document.getElementById(id);
  const arrow = card.querySelector('.expand-arrow');
  card.classList.toggle('expanded');
  if (arrow) arrow.textContent = card.classList.contains('expanded') ? '▾' : '▸';
}

function updateSettings() {
  settings.particles   = document.getElementById('settingParticles').checked;
  settings.screenShake = document.getElementById('settingShake').checked;
  settings.dmgNumbers  = document.getElementById('settingDmgNums').checked;
  settings.landingDust = document.getElementById('settingLandDust').checked;
}

function getWeaponChoice(id) {
  const v = document.getElementById(id).value;
  return v === 'random' ? getWeaponChoiceFromPool() : v;
}

function getClassChoice(id) {
  const v = document.getElementById(id) ? document.getElementById(id).value : 'none';
  if (v !== 'random') return v;
  const pool = randomClassPool ? [...randomClassPool] : ['none', 'thor', 'kratos', 'ninja', 'gunner'];
  if (pool.length === 0) return 'none';
  return pool[Math.floor(Math.random() * pool.length)];
}

function getWeaponChoiceFromPool() {
  const pool = randomWeaponPool ? [...randomWeaponPool] : WEAPON_KEYS;
  if (pool.length === 0) return WEAPON_KEYS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

function toggleRandomPool(type, key) {
  if (type === 'weapon') {
    if (!randomWeaponPool) randomWeaponPool = new Set(WEAPON_KEYS);
    if (randomWeaponPool.has(key)) randomWeaponPool.delete(key);
    else randomWeaponPool.add(key);
    // Keep at least 1 weapon
    if (randomWeaponPool.size === 0) randomWeaponPool.add(key);
  } else if (type === 'class') {
    if (!randomClassPool) randomClassPool = new Set(['none', 'thor', 'kratos', 'ninja', 'gunner']);
    if (randomClassPool.has(key)) randomClassPool.delete(key);
    else randomClassPool.add(key);
    if (randomClassPool.size === 0) randomClassPool.add(key);
  }
  // Update button label
  const btn = document.getElementById(`randBtn_${type}_${key}`);
  if (btn) {
    const inPool = type === 'weapon'
      ? (!randomWeaponPool || randomWeaponPool.has(key))
      : (!randomClassPool  || randomClassPool.has(key));
    btn.textContent  = inPool ? '\u2713 In Random Pool' : '\u2717 Excluded';
    btn.style.background = inPool ? 'rgba(0,200,100,0.25)' : 'rgba(200,50,50,0.25)';
  }
}

// ============================================================
// START GAME
// ============================================================
function startGame() {
  document.getElementById('menu').style.display            = 'none';
  document.getElementById('gameOverOverlay').style.display  = 'none';
  document.getElementById('pauseOverlay').style.display     = 'none';
  canvas.style.display = 'block';
  document.getElementById('hud').style.display = 'flex';

  // Resolve arena
  const isBossMode     = gameMode === 'boss' || gameMode === 'boss2p';
  const isTrainingMode = gameMode === 'training';
  trainingMode = isTrainingMode;
  if (isBossMode) {
    currentArenaKey = 'creator';
  } else {
    const arenaPool = Object.keys(ARENAS).filter(k => k !== 'creator');
    currentArenaKey = selectedArena === 'random' ? randChoice(arenaPool) : selectedArena;
  }
  if (currentArenaKey !== 'creator') randomizeArenaLayout(currentArenaKey);
  currentArena = ARENAS[currentArenaKey];
  initMapPerks(currentArenaKey);

  // Resolve weapons & colours
  const w1   = getWeaponChoice('p1Weapon');
  const w2   = getWeaponChoice('p2Weapon');
  const c1   = document.getElementById('p1Color').value;
  const c2   = document.getElementById('p2Color').value;
  const diff = document.getElementById('difficulty').value;
  const isBot = gameMode === 'bot';

  // Generate bg elements fresh each game
  generateBgElements();

  // Reset state — stop menu background loop
  menuLoopRunning    = false;
  projectiles        = [];
  particles          = [];
  damageTexts        = [];
  respawnCountdowns  = [];
  minions            = [];
  bossBeams          = [];
  bossSpikes         = [];
  trainingDummies    = [];
  bossDialogue       = { text: '', timer: 0 };
  backstagePortals   = [];
  bossDeathScene     = null;
  fakeDeath          = { triggered: false, active: false, timer: 0, player: null };
  mapItems           = [];
  mapPerkState       = {};
  winsP1             = 0;
  winsP2             = 0;
  screenShake     = 0;
  frameCount      = 0;
  paused          = false;

  // Reset boss floor state for every game start
  bossFloorState = 'normal';
  bossFloorType  = 'lava';
  bossFloorTimer = 1500;
  // Restore creator arena floor platform in case a previous game left it disabled
  if (ARENAS.creator) {
    const floorPl = ARENAS.creator.platforms.find(p => p.isFloor);
    if (floorPl) floorPl.isFloorDisabled = false;
    ARENAS.creator.hasLava = false;
    ARENAS.creator.deathY  = 640;
  }

  // Player 1  (W/A/D move+boost · S=shield · Space=attack · Q=ability)
  const p1 = new Fighter(160, 300, c1, w1, { left:'a', right:'d', jump:'w', attack:' ', shield:'s', ability:'q', super:'e' }, false);
  p1.playerNum = 1; p1.name = 'P1'; p1.lives = chosenLives;
  p1.spawnX = 160; p1.spawnY = 300;
  applyClass(p1, getClassChoice('p1Class'));

  // Player 2 / Bot / Boss / Training Dummy
  let p2;
  if (isBossMode || gameMode === 'boss2p') {
    const boss = new Boss();
    if (gameMode === 'boss2p') {
      // 2P boss: harder boss
      boss.attackCooldownMult = 0.38; // ~1.3x faster attacks than 1P
      boss.kbBonus            = 2.0;  // 1.33x more KB than 1P
      boss.health             *= 1.5; // 1.5x more HP
      boss.maxHealth          = boss.health;
      // Spawn real P2 alongside boss
      const w2b  = getWeaponChoice('p2Weapon');
      const c2b  = document.getElementById('p2Color').value;
      const p2h  = new Fighter(720, 300, c2b, w2b, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'.', super:'/' }, false);
      p2h.playerNum = 2; p2h.name = 'P2'; p2h.lives = chosenLives;
      p2h.spawnX = 720; p2h.spawnY = 300;
      applyClass(p2h, getClassChoice('p2Class'));
      players = [p1, p2h, boss];
      p1.target  = boss;
      p2h.target = boss;
      boss.target = p1;
      p2 = p2h; // for HUD reference
    } else {
      p2 = boss;
      players = [p1, p2];
      p1.target = p2;
      p2.target = p1;
    }
  } else if (isTrainingMode) {
    p2 = new Dummy(720, 300);
    p2.playerNum = 2; p2.name = 'DUMMY';
    players = [p1, p2];
    p1.target = p2; p2.target = p1;
  } else {
    p2 = new Fighter(720, 300, c2, w2, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'Shift', super:'/' }, isBot, diff);
    p2.playerNum = 2; p2.name = isBot ? 'BOT' : 'P2'; p2.lives = chosenLives;
    p2.spawnX = 720; p2.spawnY = 300;
    applyClass(p2, getClassChoice('p2Class'));
    players = [p1, p2];
    p1.target = p2; p2.target = p1;
  }

  // Training mode: show in-game HUD
  const trainingHud = document.getElementById('trainingHud');
  if (trainingHud) trainingHud.style.display = isTrainingMode ? 'flex' : 'none';

  // HUD labels
  document.getElementById('p1HudName').textContent = p1.name;
  document.getElementById('p2HudName').textContent = p2.name;
  document.getElementById('killFeed').innerHTML = '';

  updateHUD();
  gameRunning = true;
  resizeGame();
  requestAnimationFrame(gameLoop);
}

// ============================================================
// FULLSCREEN / RESIZE
// ============================================================
function resizeGame() {
  const hud    = document.getElementById('hud');
  const hudH   = (hud && hud.offsetHeight) || 0;
  const availW = window.innerWidth;
  const availH = window.innerHeight - hudH;
  const aspect = canvas.width / canvas.height; // 900/520

  let w = availW;
  let h = availW / aspect;
  if (h > availH) { h = availH; w = h * aspect; }

  canvas.style.width      = Math.floor(w) + 'px';
  canvas.style.height     = Math.floor(h) + 'px';
  canvas.style.marginLeft = Math.floor((availW - w) / 2) + 'px';
  canvas.style.marginTop  = '0';
}

window.addEventListener('resize', resizeGame);

// ============================================================
// PAGE LOAD — start menu background animation immediately
// ============================================================
currentArenaKey = ARENA_KEYS_ORDERED[menuBgArenaIdx];
currentArena    = ARENAS[currentArenaKey];
generateBgElements();
canvas.style.display = 'block';
resizeGame();
menuLoopRunning = true;
requestAnimationFrame(menuBgLoop);
