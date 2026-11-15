// Smooths raw GPS / Wi-Fi fixes so the "you are here" dot moves steadily instead of jittering
// (phones) or jumping (laptops).
//
// A small Kalman filter per axis: each fix is trusted in proportion to its reported accuracy,
// and our own estimate grows less certain the longer we go without a fix (people walk ~1.4 m/s).
// Wild jumps that are both far away and much less accurate than what we have are dropped.

const M_PER_DEG_LAT = 111_320;
const WALK_SPEED = 1.6; // m/s; how fast the true position can drift between fixes
const MIN_ACCURACY = 3; // m; no fix is ever treated as better than this

export function createGpsFilter() {
  let state = null; // { lat, lng, variance (m²), t (ms) }

  return function update(fix) {
    const acc = Math.max(MIN_ACCURACY, fix.accuracy || 50);
    const t = fix.timestamp || Date.now();

    if (!state) {
      state = { lat: fix.lat, lng: fix.lng, variance: acc * acc, t };
      return { lat: state.lat, lng: state.lng, accuracy: acc };
    }

    // Our estimate becomes less certain as time passes (you may have walked).
    const dt = Math.max(0, (t - state.t) / 1000);
    const predictedVar = state.variance + (WALK_SPEED * dt) ** 2;
    const predictedAcc = Math.sqrt(predictedVar);

    // Outlier: lands far outside both our estimate and its own error bars, and is worse than us.
    const mPerDegLng = M_PER_DEG_LAT * Math.cos((state.lat * Math.PI) / 180);
    const dy = (fix.lat - state.lat) * M_PER_DEG_LAT;
    const dx = (fix.lng - state.lng) * mPerDegLng;
    const jump = Math.hypot(dx, dy);
    if (acc > predictedAcc * 2.5 && jump > 3 * (predictedAcc + acc) && dt < 30) {
      return null; // keep showing the current estimate
    }

    // Kalman gain: how much to move toward the new fix.
    const k = predictedVar / (predictedVar + acc * acc);
    state = {
      lat: state.lat + k * (fix.lat - state.lat),
      lng: state.lng + k * (fix.lng - state.lng),
      variance: (1 - k) * predictedVar,
      t,
    };
    return { lat: state.lat, lng: state.lng, accuracy: Math.sqrt(state.variance) };
  };
}
