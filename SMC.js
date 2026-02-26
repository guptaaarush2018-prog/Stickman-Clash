'use strict';

// ============================================================
// CANVAS
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ============================================================
// GLOBAL STATE
// ============================================================
let gameMode        = '2p';
let selectedArena   = 'grass';
let chosenLives     = 3;
let gameRunning     = false;
let paused          = false;
let players         = [];
let projectiles     = [];
let particles       = [];
let damageTexts     = [];
let screenShake     = 0;
let frameCount      = 0;
let currentArena    = null;  // the arena data object
let currentArenaKey = 'grass';

// Pre-generated bg elements (so they don't flicker each frame)
let bgStars     = [];
let bgBuildings = [];

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
    sky:         ['#1a0000', '#3d0800'],
    groundColor: '#ff4500',
    platColor:   '#6b2b0a',
    platEdge:    '#8b3a0f',
    hasLava:     true,
    lavaY:       442,
    deathY:      442,
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
    sky:         ['#000010', '#000830'],
    groundColor: '#2a2a4a',
    platColor:   '#3a3a6a',
    platEdge:    '#5a5a9a',
    hasLava:     false,
    deathY:      640,
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
  }
};

// ============================================================
// WEAPON DEFINITIONS
// ============================================================
const WEAPONS = {
  sword: {
    // Fast gap-closer. Good damage, moderate reach.
    name: 'Sword',   damage: 20, range: 72, cooldown: 20,
    kb: 10,          abilityCooldown: 155, type: 'melee', color: '#cccccc',
    abilityName: 'Dash Slash',
    ability(user, target) {
      user.vx = user.facing * 15;
      if (dist(user, target) < 130) dealDamage(user, target, 34, 17);
    }
  },
  hammer: {
    // Devastating but very slow. Short range forces commitment.
    name: 'Hammer',  damage: 26, range: 50, cooldown: 44,
    kb: 18,          abilityCooldown: 225, type: 'melee', color: '#888888',
    abilityName: 'Ground Slam',
    ability(user, target) {
      screenShake = Math.max(screenShake, 28);
      spawnRing(user.cx(), user.y + user.h);
      if (dist(user, target) < 135) dealDamage(user, target, 30, 22);
    }
  },
  gun: {
    // Light-damage ranged weapon. Rapid Fire burst is the win condition.
    name: 'Gun',     damage: 14, range: 600, cooldown: 16,
    kb: 6,           abilityCooldown: 120, type: 'ranged', color: '#666666',
    abilityName: 'Rapid Fire',
    ability(user, _target) {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (!gameRunning || user.health <= 0) return;
          spawnBullet(user, 14 + (Math.random()-0.5)*2, '#ffdd00');
        }, i * 70);
      }
    }
  },
  axe: {
    // Balanced all-rounder. Spin ability covers both sides.
    name: 'Axe',     damage: 22, range: 68, cooldown: 28,
    kb: 13,          abilityCooldown: 155, type: 'melee', color: '#cc4422',
    abilityName: 'Spin Attack',
    ability(user, target) {
      user.spinning = 26;
      if (dist(user, target) < 115) dealDamage(user, target, 28, 16);
    }
  },
  spear: {
    // Longest reach, consistent damage. Rewards spacing.
    name: 'Spear',   damage: 19, range: 96, cooldown: 22,
    kb: 9,           abilityCooldown: 165, type: 'melee', color: '#8888ff',
    abilityName: 'Lunge',
    ability(user, target) {
      user.vx = user.facing * 14;
      user.vy = -5;
      if (dist(user, target) < 145) dealDamage(user, target, 27, 13);
    }
  }
};

const WEAPON_KEYS = Object.keys(WEAPONS);

// ============================================================
// HELPERS
// ============================================================
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function lerp(a, b, t)   { return a + (b - a) * t; }
function clamp(v, mn, mx){ return Math.max(mn, Math.min(mx, v)); }
function dist(a, b)      { return Math.hypot(a.cx() - b.cx(), (a.y + a.h/2) - (b.y + b.h/2)); }

function dealDamage(attacker, target, dmg, kbForce) {
  if (target.invincible > 0 || target.health <= 0) return;
  let actualDmg = dmg;
  let actualKb  = kbForce;
  if (target.shielding) {
    actualDmg = Math.max(1, Math.floor(dmg * 0.08));
    actualKb  = Math.floor(kbForce * 0.15);
    spawnParticles(target.cx(), target.cy(), '#88ddff', 6);
  } else {
    target.hurtTimer = 8;
  }
  target.health    = Math.max(0, target.health - actualDmg);
  target.invincible = 16;
  const dir        = target.cx() > attacker.cx() ? 1 : -1;
  target.vx        = dir * actualKb;
  target.vy        = -actualKb * 0.55;
  screenShake      = Math.max(screenShake, target.shielding ? 3 : 9);
  if (!target.shielding) {
    spawnParticles(target.cx(), target.cy(), target.color, 12);
    // High knockback → ragdoll; moderate → stun only
    if (actualKb >= 16) {
      target.ragdollTimer = 30 + Math.floor(actualKb * 1.8);
      target.stunTimer    = target.ragdollTimer + 20;
    } else if (actualKb >= 8) {
      target.stunTimer    = 22 + Math.floor(actualKb * 1.2);
    }
  }
  damageTexts.push(new DamageText(target.cx(), target.y, actualDmg, target.shielding ? '#88ddff' : '#ffdd00'));
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      color, size: 1.5 + Math.random()*2.5, life: 18 + Math.random()*22, maxLife: 40 });
  }
}

function spawnRing(x, y) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(a)*7, vy: Math.sin(a)*3.5,
      color: '#ff8800', size: 3, life: 14, maxLife: 14 });
  }
}

function spawnBullet(user, speed, color) {
  projectiles.push(new Projectile(
    user.cx() + user.facing * 12, user.y + 22,
    user.facing * speed, 0, user, user.weapon.damage, color
  ));
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
    this.abilityCooldown = 0;
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
    this.animTimer    = 0;
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
    this.invincible      = 100;
    spawnParticles(this.cx(), this.cy(), this.color, 22);
  }

  // ---- UPDATE ----
  update() {
    if (this.cooldown > 0)        this.cooldown--;
    if (this.abilityCooldown > 0) this.abilityCooldown--;
    if (this.invincible > 0)      this.invincible--;
    if (this.attackTimer > 0)     this.attackTimer--;
    if (this.hurtTimer > 0)       this.hurtTimer--;
    if (this.stunTimer > 0)       this.stunTimer--;
    if (this.ragdollTimer > 0)    this.ragdollTimer--;
    if (this.spinning > 0)        this.spinning--;
    if (this.boostCooldown > 0)   this.boostCooldown--;
    if (this.shieldCooldown > 0)  this.shieldCooldown--;
    this.animTimer++;

    // ---- WEAPON TIP HITBOX (melee only) ----
    if (this.attackTimer > 0 && !this.weaponHit && this.weapon.type === 'melee' && this.target) {
      const tip = this.getWeaponTipPos();
      if (tip) {
        const tgt = this.target;
        if (tgt.health > 0 &&
            tip.x > tgt.x - 10 && tip.x < tgt.x + tgt.w + 10 &&
            tip.y > tgt.y       && tip.y < tgt.y + tgt.h) {
          dealDamage(this, tgt, this.weapon.damage, this.weapon.kb);
          this.weaponHit = true;
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

    if (this.isAI && this.target) this.updateAI();

    // Gravity + motion
    this.vy += 0.65;
    this.x  += this.vx;
    this.y  += this.vy;

    // Friction
    this.vx *= this.onGround ? 0.80 : 0.94;
    this.vx  = clamp(this.vx, -13, 13);
    this.vy  = clamp(this.vy, -20, 19);

    this.onGround = false;
    for (const pl of currentArena.platforms) this.checkPlatform(pl);

    // Horizontal clamp (allow slight off-screen before death)
    this.x = clamp(this.x, -80, canvas.width + 60);

    // Death by falling / lava
    const dyY = currentArena.hasLava ? currentArena.lavaY : currentArena.deathY;
    if (this.y > dyY && this.health > 0) this.health = 0;

    this.updateState();

    // Auto-face target
    if (this.target) this.facing = this.target.cx() > this.cx() ? 1 : -1;
    else if (Math.abs(this.vx) > 0.5) this.facing = this.vx > 0 ? 1 : -1;
  }

  checkPlatform(pl) {
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
      this.y        = pl.y - this.h;
      this.vy       = 0;
      this.onGround = true;
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
    const tipLens = { sword: 26, hammer: 30, axe: 22, spear: 38 };
    const wLen    = tipLens[this.weaponKey] || 22;
    const reach   = armLen + wLen;
    return {
      x: cx         + Math.cos(ang) * reach,
      y: shoulderY  + Math.sin(ang) * reach
    };
  }

  // ---- ATTACK ----
  attack(target) {
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
    if (this.abilityCooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    this.weapon.ability(this, target);
    this.abilityCooldown = this.weapon.abilityCooldown;
    this.attackTimer     = this.attackDuration * 2;
  }

  // ---- AI ----

  // Returns true if moving in 'dir' (±1) would walk the AI off a platform
  // with no safe ground beneath within the next 40px.
  isEdgeDanger(dir) {
    if (!this.onGround) return false;
    const lookX = dir > 0 ? this.x + this.w + 36 : this.x - 36;
    const footY = this.y + this.h;
    for (const pl of currentArena.platforms) {
      if (lookX > pl.x && lookX < pl.x + pl.w &&
          footY <= pl.y + 22 && footY >= pl.y - 8) return false; // ground ahead
    }
    // No ground found — but only dangerous if we'd fall toward death/lava
    const dangerY = currentArena.hasLava ? currentArena.lavaY - 40 : canvas.height + 60;
    return this.y + this.h < dangerY;
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

    const spd     = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 3.6 : 4.8;
    const atkFreq = this.aiDiff === 'easy' ? 0.04 : this.aiDiff === 'medium' ? 0.09 : 0.16;
    const abiFreq = this.aiDiff === 'easy' ? 0.004 : this.aiDiff === 'medium' ? 0.012 : 0.024;

    // ---- DANGER: near lava / death zone ----
    if (currentArena.hasLava && this.y + this.h > currentArena.lavaY - 80 && this.onGround) {
      this.vy = -18;
      this.vx = this.cx() < canvas.width / 2 ? spd * 1.8 : -spd * 1.8;
      return;
    }

    // ---- STATE MACHINE ----
    if (this.health < 30 && d > 100 && Math.random() < 0.012) this.aiState = 'evade';
    else if (d < this.weapon.range + 20) this.aiState = 'attack';
    else                                  this.aiState = 'chase';

    // React to incoming attack (medium+): raise shield
    if (this.aiDiff !== 'easy' && t.attackTimer > 0 && d < 110 && Math.random() < 0.22) {
      this.shielding = true;
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
        // Jump to chase target that is on a higher platform
        if (this.onGround && t.y + t.h < this.y - 50 && Math.random() < 0.04 && !edgeDanger)
          this.vy = -17;
        break;

      case 'attack':
        this.vx *= 0.72;
        if (Math.random() < atkFreq) this.attack(t);
        if (Math.random() < abiFreq) this.ability(t);
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
          if (pd < 105 && this.onGround && !this.isEdgeDanger(pr.vx > 0 ? -1 : 1) && Math.random() < 0.16)
            this.vy = -16;
        }
      }
    }

    // Reaction lag for lower difficulties
    if (this.aiDiff === 'easy'   && Math.random() < 0.10) this.aiReact = 10;
    if (this.aiDiff === 'medium' && Math.random() < 0.05) this.aiReact =  5;
  }

  // ---- DRAW ----
  draw() {
    if (this.health <= 0 && this.invincible < 90) return;

    ctx.save();

    // Invincibility blink
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 1) {
      ctx.globalAlpha = 0.35;
    }

    const cx = this.cx();
    const ty = this.y;

    // Ragdoll body rotation — spin around center of mass
    if (this.ragdollTimer > 0) {
      const spinAngle = Math.atan2(this.vy, this.vx) * 0.6
                      + Math.sin(this.animTimer * 0.18) * 0.4;
      ctx.translate(cx, ty + this.h * 0.45);
      ctx.rotate(spinAngle);
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
      // Chaotic flailing based on velocity direction
      const flail = Math.sin(t * 0.38) * 1.9;
      rAng = Math.atan2(this.vy, this.vx) + flail;
      lAng = Math.atan2(this.vy, this.vx) + Math.PI - flail;
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

    // WEAPON in hand
    this.drawWeapon(rEx, rEy, rAng, s === 'attacking');

    // LEGS
    let rLeg, lLeg;
    if (s === 'ragdoll') {
      const legFlail = Math.sin(t * 0.35) * 1.2;
      rLeg = Math.PI * 0.5 + legFlail;
      lLeg = Math.PI * 0.5 - legFlail;
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

  drawWeapon(hx, hy, angle, attacking) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle + (attacking ? 0.6 : 0));
    ctx.lineCap   = 'round';

    const k = this.weaponKey;

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
    }

    ctx.restore();
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

  if (currentArenaKey === 'space') drawStars();
  if (currentArenaKey === 'grass') drawClouds();
  if (currentArenaKey === 'lava')  drawLava();
  if (currentArenaKey === 'city')  drawCityBuildings();
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

function drawPlatforms() {
  for (const pl of currentArena.platforms) {
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(pl.x + 4, pl.y + 4, pl.w, pl.h);
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
  }
}

// ============================================================
// DEATH / RESPAWN / WIN
// ============================================================
function checkDeaths() {
  for (const p of players) {
    if (p.health <= 0 && p.lives > 0 && p.invincible === 0) {
      p.lives--;
      p.invincible = 999; // block re-trigger until respawn clears it
      addKillFeed(p);
      if (p.lives > 0) {
        setTimeout(() => { if (gameRunning) p.respawn(); }, 1100);
      } else {
        setTimeout(endGame, 900);
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
  gameRunning = false;
  paused      = false;
  canvas.style.display = 'none';
  document.getElementById('hud').style.display           = 'none';
  document.getElementById('pauseOverlay').style.display   = 'none';
  document.getElementById('gameOverOverlay').style.display = 'none';
  document.getElementById('menu').style.display           = 'flex';
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
  for (let i = 0; i < 2; i++) {
    const p  = players[i];
    if (!p) continue;
    const pct    = Math.max(0, p.health / p.maxHealth * 100);
    const hEl    = document.getElementById(`p${i+1}Health`);
    const lEl    = document.getElementById(`p${i+1}Lives`);
    const nEl    = document.getElementById(`p${i+1}HudName`);
    if (hEl) {
      hEl.style.width      = pct + '%';
      const hue            = pct * 1.2;
      hEl.style.background = `hsl(${hue},100%,44%)`;
    }
    if (lEl) {
      const full  = '❤'.repeat(Math.max(0, p.lives));
      const empty = '<span style="opacity:0.18">❤</span>'.repeat(Math.max(0, chosenLives - p.lives));
      lEl.innerHTML = full + empty;
    }
    if (nEl) nEl.style.color = p.color;
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

  const sx = (Math.random() - 0.5) * screenShake;
  const sy = (Math.random() - 0.5) * screenShake;
  ctx.setTransform(1, 0, 0, 1, sx, sy);

  drawBackground();
  drawPlatforms();

  // Projectiles
  projectiles.forEach(p => p.update());
  projectiles = projectiles.filter(p => p.active);
  projectiles.forEach(p => p.draw());

  // Players
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.update(); });
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.draw(); });

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

  screenShake *= 0.84;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  checkDeaths();
  updateHUD();

  requestAnimationFrame(gameLoop);
}

// ============================================================
// INPUT
// ============================================================
const keysDown      = new Set();
const keyHeldFrames = {};   // key → frames held continuously

const SCROLL_BLOCK = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 's', 'S']);

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
const SHIELD_CD     = 1800; // 30-second cooldown at 60 fps

function processInput() {
  if (!gameRunning || paused) return;

  // Update key-held counters
  for (const k of keysDown) keyHeldFrames[k] = (keyHeldFrames[k] || 0) + 1;

  players.forEach(p => {
    if (p.isAI || p.health <= 0) return;
    if (p.ragdollTimer > 0 || p.stunTimer > 0) { p.shielding = false; return; }

    const spd  = 5.2;
    const lHeld = keyHeldFrames[p.controls.left]  || 0;
    const rHeld = keyHeldFrames[p.controls.right] || 0;
    const wHeld = keyHeldFrames[p.controls.jump]  || 0;

    // --- Regular movement ---
    if (keysDown.has(p.controls.left))  p.vx = -spd;
    if (keysDown.has(p.controls.right)) p.vx =  spd;

    // --- Jump (single press, on keydown; here handle hold for super-jump) ---
    if (keysDown.has(p.controls.jump) && p.onGround) {
      // First press: handled in keydown event. Here only the BOOST threshold.
      if (wHeld === 1) {
        // Normal jump on first frame
        p.vy = -16;
        spawnParticles(p.cx(), p.y + p.h, '#ffffff', 5);
      } else if (wHeld === BOOST_HOLD && p.boostCooldown === 0) {
        // Hold → super jump
        p.vy = BOOST_VY;
        p.boostCooldown = BOOST_CD;
        spawnParticles(p.cx(), p.y + p.h, '#00d4ff', 12);
        spawnParticles(p.cx(), p.cy(),    '#ffffff',  5);
      }
    }

    // --- Directional boost (hold threshold) ---
    if (p.boostCooldown === 0) {
      if (lHeld === BOOST_HOLD && keysDown.has(p.controls.left)) {
        p.vx = -BOOST_VX;
        p.boostCooldown = BOOST_CD;
        spawnParticles(p.cx(), p.cy(), '#00d4ff', 8);
      }
      if (rHeld === BOOST_HOLD && keysDown.has(p.controls.right)) {
        p.vx = BOOST_VX;
        p.boostCooldown = BOOST_CD;
        spawnParticles(p.cx(), p.cy(), '#00d4ff', 8);
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
  const isBot = mode === 'bot';
  document.getElementById('p2Title').textContent          = isBot ? 'BOT' : 'Player 2';
  document.getElementById('p2Hint').textContent           = isBot ? 'AI Controlled' : '←→↑↓ · Enter · .';
  document.getElementById('difficultyRow').style.display  = isBot ? 'flex' : 'none';
}

function selectArena(name) {
  selectedArena = name;
  document.querySelectorAll('.arena-card[data-arena]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-arena="${name}"]`).classList.add('active');
}

function selectLives(n) {
  chosenLives = n;
  document.querySelectorAll('.arena-card[data-lives]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-lives="${n}"]`).classList.add('active');
}

function getWeaponChoice(id) {
  const v = document.getElementById(id).value;
  return v === 'random' ? randChoice(WEAPON_KEYS) : v;
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
  currentArenaKey = selectedArena === 'random' ? randChoice(Object.keys(ARENAS)) : selectedArena;
  currentArena    = ARENAS[currentArenaKey];

  // Resolve weapons & colours
  const w1   = getWeaponChoice('p1Weapon');
  const w2   = getWeaponChoice('p2Weapon');
  const c1   = document.getElementById('p1Color').value;
  const c2   = document.getElementById('p2Color').value;
  const diff = document.getElementById('difficulty').value;
  const isBot = gameMode === 'bot';

  // Generate bg elements fresh each game
  generateBgElements();

  // Reset state
  projectiles  = [];
  particles    = [];
  damageTexts  = [];
  screenShake  = 0;
  frameCount   = 0;
  paused       = false;

  // Player 1  (W/A/D move+boost · S=shield · Space=attack · Q=ability)
  const p1 = new Fighter(160, 300, c1, w1, { left:'a', right:'d', jump:'w', attack:' ', shield:'s', ability:'q' }, false);
  p1.playerNum = 1; p1.name = 'P1'; p1.lives = chosenLives;
  p1.spawnX = 160; p1.spawnY = 300;

  // Player 2 / Bot  (←→↑ move+boost · ↓=shield · Enter=attack · .=ability)
  const p2 = new Fighter(720, 300, c2, w2, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'.' }, isBot, diff);
  p2.playerNum = 2; p2.name = isBot ? 'BOT' : 'P2'; p2.lives = chosenLives;
  p2.spawnX = 720; p2.spawnY = 300;

  players = [p1, p2];
  p1.target = p2;
  p2.target = p1;

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
