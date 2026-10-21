 // ==== Revision Loop — scheduler.js ====
// Pure scheduling logic. No DOM, no storage, no side effects.
// Exposes globals: nextDueAt(rating, now), isDue(card, now)

var MINUTE_MS = 60 * 1000;

// Fixed intervals. "again" is in minutes; everything else in days.
var RATING_INTERVALS = {
  again: { minutes: 10 },
  hard:  { days: 1 },
  good:  { days: 3 },
  easy:  { days: 7 }
};

// Calendar-aware day addition: new Date(y, m, d + n), not millisecond math.
function addCalendarDays(baseMs, days) {
  var d = new Date(baseMs);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  ).getTime();
}

function nextDueAt(rating, now) {
  var baseMs = now ? new Date(now).getTime() : Date.now();
  var key = String(rating).toLowerCase();
  var interval = RATING_INTERVALS[key] || RATING_INTERVALS.good;

  if (interval.minutes) {
    return { dueAt: baseMs + interval.minutes * MINUTE_MS, intervalDays: 0 };
  }
  return {
    dueAt: addCalendarDays(baseMs, interval.days),
    intervalDays: interval.days
  };
}

function isDue(card, now) {
  if (!card) return false;
  // New or imported cards (no dueAt yet) are due immediately.
  if (card.dueAt === null || typeof card.dueAt === 'undefined') return true;
  var nowMs = now ? new Date(now).getTime() : Date.now();
  return card.dueAt <= nowMs;
}
