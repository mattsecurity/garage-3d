// Vehicle tuning and the pure mapping from player input to wheel commands.
// Values were tuned for a ~4.5 unit long car on a 20 x 14 unit cutting mat.

export const VEHICLE = {
  mass: 1200,
  gravity: -20,
  engineForce: 11000,
  brakeForce: 120,
  rollingBrake: 3,
  handbrakeForce: 20,
  maxSpeed: 11,
  reverseSpeed: 6,
  reverseFactor: 0.6,
  maxSteer: 0.6,
  steerSpeed: 4,
  steerFalloffSpeed: 30,
  steerFalloffMax: 0.5,
  suspensionRest: 0.22,
  suspensionStiffness: 60,
  suspensionCompression: 4.4,
  suspensionRelaxation: 2.6,
  maxSuspensionForce: 1e6,
  frictionSlip: 3,
  // Drift (Space at speed): the rear tyres lose side grip while the engine keeps pushing, and a yaw assist holds the
  // tail out at an angle picked by the steering. Releasing Space keeps the slide going while you steer into it;
  // centring the steering straightens the car and ends it. Tuned in Node against Rapier.
  driftMinSpeed: 4, // below this Space is a plain handbrake
  driftFrictionSlip: 2.2,
  driftSideFriction: 0.05,
  driftGripLoss: 8, // rear side grip lost per second when a drift starts
  driftGripRecovery: 2.5, // and regained per second after it
  driftSlip: 0.6, // rad (~34°): drift angle at full steering lock
  driftSlipGain: 4, // 1/s: how fast the yaw assist closes the gap to that angle
  driftSteer: 0.25, // rad: front wheel angle the player adds on top of the automatic counter-steer
  driftSteerSpeed: 8, // rad/s
  driftYawGain: 12,
  driftExitSlip: 0.15, // rad (~9°): after Space is released the drift lasts until the slip angle drops below this
  comHeight: 0.35,
};

const moveTowards = (value, target, maxDelta) =>
  Math.abs(target - value) <= maxDelta ? target : value + Math.sign(target - value) * maxDelta;

/**
 * @param {{throttle:number, steer:number, handbrake:boolean}} input throttle/steer in [-1, 1], steer > 0 = left
 * @param {{speed:number, slip:number, pathRate:number, steer:number, drifting:boolean, rearGrip:number}} state
 *   speed: signed forward speed (units/s); slip: angle between the nose and the velocity (rad, > 0 = moving towards
 *   the car's left); pathRate: how fast the velocity turns (rad/s, > 0 = left); steer, drifting, rearGrip: the
 *   previous step's values (front wheel angle, drift flag, rear side grip)
 * @param {number} dt step length (s)
 * @returns {{steer:number, drifting:boolean, rearGrip:number, front:{brake:number, frictionSlip:number, sideFriction:number},
 *   rear:{engine:number, brake:number, frictionSlip:number, sideFriction:number}, yawTarget:number|null}}
 *   engine is per rear wheel; yawTarget is the drift-assist yaw rate (rad/s) or null
 */
export function driveCommand(input, state, dt, p = VEHICLE) {
  const { speed, slip } = state;
  const travel = Math.cos(slip) > 0.2 ? speed / Math.cos(slip) : 0; // speed along the path, not the nose
  const drifting = travel > p.driftMinSpeed && (input.handbrake || (state.drifting && Math.abs(slip) > p.driftExitSlip));
  const rearGrip = moveTowards(state.rearGrip, drifting ? p.driftSideFriction : 1, (drifting ? p.driftGripLoss : p.driftGripRecovery) * dt);

  let steer;
  if (drifting) {
    // Counter-steer like a real drifter: front wheels along the slide (plus the player's input) steer the path
    // instead of scrubbing off all the speed.
    const target = Math.min(Math.max(slip + input.steer * p.driftSteer, -p.maxSteer), p.maxSteer);
    steer = moveTowards(state.steer, target, p.driftSteerSpeed * dt);
  } else {
    const limit = p.maxSteer * (1 - Math.min(Math.abs(speed) / p.steerFalloffSpeed, p.steerFalloffMax));
    steer = moveTowards(state.steer, input.steer * limit, p.steerSpeed * dt);
  }

  let engine = 0;
  let brake = 0;
  if (input.throttle > 0) {
    if (speed < -1) brake = p.brakeForce * input.throttle;
    else if (speed < p.maxSpeed) engine = p.engineForce * input.throttle;
  } else if (input.throttle < 0) {
    if (speed > 1) brake = p.brakeForce * -input.throttle;
    else if (speed > -p.reverseSpeed) engine = p.engineForce * p.reverseFactor * input.throttle;
  } else {
    brake = p.rollingBrake;
  }

  let rear;
  if (input.handbrake && !drifting) {
    // Rapier ignores a wheel's brake while it has engine force, so the handbrake cuts the rear engine.
    rear = { engine: 0, brake: p.handbrakeForce, frictionSlip: p.frictionSlip, sideFriction: rearGrip };
  } else {
    rear = { engine: engine / 2, brake: engine !== 0 ? 0 : brake, frictionSlip: drifting ? p.driftFrictionSlip : p.frictionSlip, sideFriction: rearGrip };
  }

  // slip changes at pathRate - yawRate: turning the nose faster than the path swings the tail out. Steering left
  // (> 0) asks for the nose inside a left turn, i.e. the velocity to its right: a negative slip.
  const yawTarget = drifting ? state.pathRate + p.driftSlipGain * (slip + input.steer * p.driftSlip) : null;

  return {
    steer,
    drifting,
    rearGrip,
    front: { brake: engine !== 0 ? 0 : brake, frictionSlip: p.frictionSlip, sideFriction: 1 },
    rear,
    yawTarget,
  };
}
