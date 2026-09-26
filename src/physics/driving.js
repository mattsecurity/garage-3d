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
  driftFrictionSlip: 0.9,
  driftSideFriction: 0.12,
  driftYawRate: 2.8,
  driftYawGain: 4,
  comHeight: 0.35,
};

const moveTowards = (value, target, maxDelta) =>
  Math.abs(target - value) <= maxDelta ? target : value + Math.sign(target - value) * maxDelta;

/**
 * @param {{throttle:number, steer:number, handbrake:boolean}} input throttle/steer in [-1, 1], steer > 0 = left
 * @param {number} speed signed forward speed (units/s)
 * @param {number} prevSteer front wheel angle of the previous step (rad)
 * @param {number} dt step length (s)
 * @returns {{steer:number, front:{brake:number, frictionSlip:number, sideFriction:number},
 *   rear:{engine:number, brake:number, frictionSlip:number, sideFriction:number}, yawTarget:number|null}}
 *   engine is per rear wheel; yawTarget is the drift-assist yaw rate (rad/s) or null
 */
export function driveCommand(input, speed, prevSteer, dt, p = VEHICLE) {
  const limit = p.maxSteer * (1 - Math.min(Math.abs(speed) / p.steerFalloffSpeed, p.steerFalloffMax));
  const steer = moveTowards(prevSteer, input.steer * limit, p.steerSpeed * dt);

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

  // Rapier ignores a wheel's brake while it has engine force, so the handbrake cuts the rear engine.
  const rear = input.handbrake
    ? { engine: 0, brake: p.handbrakeForce, frictionSlip: p.driftFrictionSlip, sideFriction: p.driftSideFriction }
    : { engine: engine / 2, brake, frictionSlip: p.frictionSlip, sideFriction: 1 };
  return {
    steer,
    front: { brake: engine !== 0 ? 0 : brake, frictionSlip: p.frictionSlip, sideFriction: 1 },
    rear,
    yawTarget: input.handbrake && Math.abs(speed) > 3 ? input.steer * p.driftYawRate * Math.sign(speed) : null,
  };
}
