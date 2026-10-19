// ==== Revision Loop — scheduler.js ====
// Pure scheduling logic. No DOM, no storage, no side effects.
// Exposes globals: nextDueAt(rating, now), isDue(card, now)

function nextDueAt(rating, now) {
  var base = now ? new Date(now).getTime() : Date.now();

  // Fixed intervals for this build.
  // Again -> 10 minutes, Hard -> 1 day, Good -> 3 days, Easy -> 7 days
  var map = {
    again: { minutes: 10, days: 0 },
    hard:  { days: 1 },
    good:  { days: 3 },
    easy:  { days: 7 }
  };

  // Unknown rating falls back to "good" rather than crashing.
  var m = map[String(rating).toLowerCase()] || map.good;

  if (m.minutes) {
    return { dueAt: base + m.minutes * 60 * 1000, intervalDays: 0 };
  }

  // Calendar arithmetic, not millisecond math, so DST-change days behave.
  var d = new Date(base);
  var due = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + m.days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  ).getTime();

  return { dueAt: due, intervalDays: m.days };
}

function isDue(card, now) {
  if (!card) return false;
  // Missing or null dueAt counts as due (new cards, imported cards).
  if (card.dueAt === null || typeof card.dueAt === 'undefined') return true;
  var t = now ? new Date(now).getTime() : Date.now();
  return card.dueAt <= t;
}