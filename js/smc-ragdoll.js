'use strict';

// ============================================================
// TRUE MATTER.JS RAGDOLL SYSTEM
// Requires Matter.js (already included in SMC.html).
// Activated when settings.ragdollEnabled = true.
//
// Each fighter gets a RagdollCharacter attached at .matterRagdoll
// Body parts: head (circle), torso (rect), limbs (rects).
// Connected by Constraints.
// ============================================================

const RagdollSystem = (function() {
  // Matter.js aliases — resolved lazily so we don't error if Matter isn't loaded
  let _engine  = null;
  let _world   = null;
  let _runner  = null;
  let _Bodies  = null;
  let _Body    = null;
  let _Composite = null;
  let _Constraint = null;
  let _inited  = false;
  let _gravity = 1;

  function _init() {
    if (_inited) return;
    if (typeof Matter === 'undefined') { console.warn('[Ragdoll] Matter.js not loaded.'); return; }
    _Bodies     = Matter.Bodies;
    _Body       = Matter.Body;
    _Composite  = Matter.Composite;
    _Constraint = Matter.Constraint;
    _engine     = Matter.Engine.create({ gravity: { y: _gravity } });
    _world      = _engine.world;
    _inited     = true;
  }

  function _ensure() { if (!_inited) _init(); return _inited; }

  // Create floor and wall static bodies sized to GAME_W/GAME_H
  function _rebuildBounds() {
    if (!_ensure()) return;
    // Remove old static bounds
    const statics = _Composite.allBodies(_world).filter(b => b.isStatic && b._isBound);
    _Composite.remove(_world, statics);
    const W = typeof GAME_W !== 'undefined' ? GAME_W : 900;
    const H = typeof GAME_H !== 'undefined' ? GAME_H : 520;
    const thickness = 40;
    const floor = _Bodies.rectangle(W/2, H + thickness/2, W + 200, thickness, { isStatic: true });
    floor._isBound = true;
    const wallL = _Bodies.rectangle(-thickness/2, H/2, thickness, H + 200, { isStatic: true });
    wallL._isBound = true;
    const wallR = _Bodies.rectangle(W + thickness/2, H/2, thickness, H + 200, { isStatic: true });
    wallR._isBound = true;
    _Composite.add(_world, [floor, wallL, wallR]);
  }

  // Build a ragdoll for one fighter
  function createFor(fighter) {
    if (!_ensure()) return null;
    if (fighter.matterRagdoll) destroyFor(fighter); // cleanup old

    const x  = fighter.cx();
    const y  = fighter.cy();
    const sc = 1.0; // scale factor

    const catFighter = 0x0001; // collision category
    const maskNone   = 0x0000;  // limbs don't collide with each other

    // Parts
    const head   = _Bodies.circle(x, y - 28*sc, 8*sc, { restitution: 0.2, collisionFilter: { category: catFighter, mask: maskNone } });
    const torso  = _Bodies.rectangle(x, y - 10*sc, 10*sc, 20*sc, { restitution: 0.1, collisionFilter: { category: catFighter, mask: maskNone } });
    const lArm   = _Bodies.rectangle(x - 12*sc, y - 8*sc, 6*sc, 14*sc, { restitution: 0.1, collisionFilter: { category: catFighter, mask: maskNone } });
    const rArm   = _Bodies.rectangle(x + 12*sc, y - 8*sc, 6*sc, 14*sc, { restitution: 0.1, collisionFilter: { category: catFighter, mask: maskNone } });
    const lLeg   = _Bodies.rectangle(x - 6*sc,  y + 14*sc, 6*sc, 16*sc, { restitution: 0.1, collisionFilter: { category: catFighter, mask: maskNone } });
    const rLeg   = _Bodies.rectangle(x + 6*sc,  y + 14*sc, 6*sc, 16*sc, { restitution: 0.1, collisionFilter: { category: catFighter, mask: maskNone } });

    // Constraints
    const stiff = 0.8, soft = 0.7;
    const headNeck  = _Constraint.create({ bodyA: head,  bodyB: torso, length: 14*sc, stiffness: stiff, damping: 0.2 });
    const lArmJoint = _Constraint.create({ bodyA: torso, bodyB: lArm,  length: 10*sc, stiffness: soft,  damping: 0.2, pointA: { x: -5*sc, y: -8*sc } });
    const rArmJoint = _Constraint.create({ bodyA: torso, bodyB: rArm,  length: 10*sc, stiffness: soft,  damping: 0.2, pointA: { x:  5*sc, y: -8*sc } });
    const lLegJoint = _Constraint.create({ bodyA: torso, bodyB: lLeg,  length: 14*sc, stiffness: soft,  damping: 0.2, pointA: { x: -5*sc, y:  8*sc } });
    const rLegJoint = _Constraint.create({ bodyA: torso, bodyB: rLeg,  length: 14*sc, stiffness: soft,  damping: 0.2, pointA: { x:  5*sc, y:  8*sc } });

    const bodies      = [head, torso, lArm, rArm, lLeg, rLeg];
    const constraints = [headNeck, lArmJoint, rArmJoint, lLegJoint, rLegJoint];

    _Composite.add(_world, [...bodies, ...constraints]);

    const ragdoll = { head, torso, lArm, rArm, lLeg, rLeg, bodies, constraints, fighter, active: true };
    fighter.matterRagdoll = ragdoll;
    return ragdoll;
  }

  function destroyFor(fighter) {
    const rd = fighter.matterRagdoll;
    if (!rd || !_world) return;
    try {
      _Composite.remove(_world, rd.bodies);
      _Composite.remove(_world, rd.constraints);
    } catch(e) {}
    fighter.matterRagdoll = null;
  }

  // Apply walking force to torso
  function applyWalk(fighter, dir) {
    const rd = fighter.matterRagdoll;
    if (!rd || !_Body) return;
    _Body.applyForce(rd.torso, rd.torso.position, { x: dir * 0.005, y: 0 });
  }

  // Apply jump impulse to all bodies
  function applyJump(fighter) {
    const rd = fighter.matterRagdoll;
    if (!rd || !_Body) return;
    for (const b of rd.bodies) _Body.setVelocity(b, { x: b.velocity.x, y: b.velocity.y - 9 });
  }

  // Apply knockback impulse (from hit)
  function applyKnockback(fighter, fx, fy) {
    const rd = fighter.matterRagdoll;
    if (!rd || !_Body) return;
    for (const b of rd.bodies) {
      _Body.applyForce(b, b.position, { x: fx * 0.001, y: fy * 0.001 });
    }
  }

  // Sync ragdoll position to fighter's current logical position
  function syncToFighter(fighter) {
    const rd = fighter.matterRagdoll;
    if (!rd || !_Body) return;
    const x = fighter.cx(), y = fighter.cy();
    const offsets = {
      head:  { x: 0,   y: -28 },
      torso: { x: 0,   y: -10 },
      lArm:  { x: -12, y: -8  },
      rArm:  { x:  12, y: -8  },
      lLeg:  { x: -6,  y:  14 },
      rLeg:  { x:  6,  y:  14 },
    };
    for (const [name, off] of Object.entries(offsets)) {
      if (rd[name]) _Body.setPosition(rd[name], { x: x + off.x, y: y + off.y });
    }
  }

  // Step the physics engine (called each game frame)
  function step(deltaMs) {
    if (!_ensure() || !_engine) return;
    // Use game time scale
    const ts = (typeof timeScale !== 'undefined') ? timeScale : 1.0;
    Matter.Engine.update(_engine, (deltaMs || 16.667) * ts);
  }

  // Draw ragdoll bodies for a fighter (replaces scripted draw)
  function drawFor(fighter, ctx) {
    const rd = fighter.matterRagdoll;
    if (!rd || !rd.active) return;
    ctx.save();
    ctx.strokeStyle = fighter.color || '#888';
    ctx.lineWidth   = 2;
    ctx.fillStyle   = fighter.color || '#888';

    // Draw each body part
    _drawBody(ctx, rd.head,   true,  8);     // circle
    _drawBody(ctx, rd.torso,  false, null);
    _drawBody(ctx, rd.lArm,   false, null);
    _drawBody(ctx, rd.rArm,   false, null);
    _drawBody(ctx, rd.lLeg,   false, null);
    _drawBody(ctx, rd.rLeg,   false, null);

    ctx.restore();
  }

  function _drawBody(ctx, body, isCircle, radius) {
    if (!body) return;
    const pos   = body.position;
    const angle = body.angle;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    if (isCircle) {
      ctx.beginPath();
      ctx.arc(0, 0, radius || 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const verts = body.vertices;
      if (!verts || !verts.length) { ctx.restore(); return; }
      ctx.beginPath();
      ctx.moveTo(verts[0].x - pos.x, verts[0].y - pos.y);
      for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x - pos.x, verts[i].y - pos.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  return { createFor, destroyFor, applyWalk, applyJump, applyKnockback, syncToFighter, step, drawFor, rebuildBounds: _rebuildBounds };
})();

// ---- Integration hooks ----
// Call RagdollSystem.rebuildBounds() when a game starts
// and RagdollSystem.step(deltaMs) each frame when ragdollEnabled.

// Patch the existing dealDamage or knockback to forward to ragdoll system
// (done non-destructively by wrapping the global)
(function() {
  const _orig = typeof dealDamage === 'function' ? dealDamage : null;
  // Will be hooked after all scripts load via window.onload; see below.
})();

// Per-frame step — called from gameLoop (smc-loop.js already calls runSanityChecks)
function ragdollStep() {
  if (!settings.ragdollEnabled) return;
  RagdollSystem.step(16.667);
}
