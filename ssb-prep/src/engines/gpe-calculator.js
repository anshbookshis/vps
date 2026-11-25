/**
 * GPE (Group Planning Exercise) Distance-Time-Speed & Manpower Validator.
 * Helps aspirants calculate exact arrival times during 10-minute planning drills.
 */

/**
 * Compute travel duration in rounded minutes given distance (km) and speed (km/h).
 * @param {number} distanceKm
 * @param {number} speedKmh
 * @returns {number}
 */
export function computeTravelTimeMinutes(distanceKm, speedKmh) {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(speedKmh) || distanceKm < 0 || speedKmh <= 0) {
    throw new RangeError('Distance must be >= 0 and speed must be > 0');
  }
  return Math.round((distanceKm / speedKmh) * 60);
}

/**
 * Add delta minutes to a "HH:MM" 24-hour clock string.
 * @param {string} baseTimeStr e.g. "09:00"
 * @param {number} deltaMinutes
 * @returns {string}
 */
export function addMinutesToTime(baseTimeStr, deltaMinutes) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(baseTimeStr || '').trim());
  if (!match) throw new Error('Invalid time format; expected HH:MM');
  const baseHrs = Number(match[1]);
  const baseMins = Number(match[2]);
  if (baseHrs > 23 || baseMins > 59) throw new Error('Out-of-range time');

  const total = ((baseHrs * 60 + baseMins + Math.round(deltaMinutes)) % 1440 + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Audit an aspirant's GPE resource allocation plan.
 * @param {{ totalCadets: number, groups: Array<{ name: string, cadets: number, task: string, departTime?: string, travelMinutes?: number }>, writtenPlan?: string }} plan
 */
export function auditGpePlan(plan) {
  const totalCadets = Number(plan.totalCadets || 0);
  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const allocated = groups.reduce((acc, g) => acc + Math.max(0, Number(g.cadets || 0)), 0);
  const writtenText = String(plan.writtenPlan || '').trim();

  const warnings = [];
  if (allocated > totalCadets) {
    warnings.push(`Over-allocated manpower: assigned ${allocated} cadets out of ${totalCadets} available.`);
  } else if (allocated < totalCadets && allocated > 0) {
    warnings.push(`${totalCadets - allocated} cadet(s) unallocated — account for every group member.`);
  }

  if (groups.length < 2) {
    warnings.push('Single-group serial execution wastes precious minutes — split into parallel task groups where safe.');
  }

  const soloCount = groups.filter((g) => Number(g.cadets) === 1).length;
  if (soloCount > 0) {
    warnings.push('Avoid sending a single cadet alone into risky/night/criminal-sabotage tasks; pair at least 2 cadets when feasible.');
  }

  const wordCount = writtenText ? writtenText.split(/\s+/).length : 0;
  if (wordCount > 0 && wordCount < 35) {
    warnings.push(`Written plan is brief (${wordCount} words). Include exact priorities, group splits, transport modes, and rally point/time.`);
  }

  return {
    totalCadets,
    allocated,
    groupCount: groups.length,
    wordCount,
    warnings,
    validAllocation: allocated === totalCadets && warnings.length === 0,
  };
}
