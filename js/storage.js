// ==== Revision Loop — storage.js ====
// Persistence only: read, repair, write. No DOM, no dates, no side effects on read.
// Public globals: STORAGE_KEY, emptyState(), loadState(), saveState(state)

var STORAGE_KEY = 'revisionLoop.v1';

/* ------------------------------------------------------------------ *
 * Small predicates and coercions
 * ------------------------------------------------------------------ */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isString      = (v) => typeof v === 'string';
const isNumber      = (v) => typeof v === 'number' && Number.isFinite(v);
const asString      = (v, fallback) => (isString(v) ? v : fallback);
const asNumber      = (v, fallback) => (isNumber(v) ? v : fallback);

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Map + drop nullish results in one pass. */
function compactMap(list, fn) {
  return list.reduce((out, item) => {
    const mapped = fn(item);
    if (mapped !== null && mapped !== undefined) out.push(mapped);
    return out;
  }, []);
}

/* ------------------------------------------------------------------ *
 * Canonical empty state
 * ------------------------------------------------------------------ */

function emptyState() {
  return { version: 1, decks: [], cards: [], reviewsByDay: {} };
}

/* ------------------------------------------------------------------ *
 * Normalisers — return null when an entry is unusable
 * ------------------------------------------------------------------ */

function normalizeDeck(deck) {
  if (!isPlainObject(deck) || !isString(deck.id) || !isString(deck.name)) return null;
  return {
    id: deck.id,
    name: deck.name,
    createdAt: asNumber(deck.createdAt, 0),
  };
}

function normalizeCard(card, deckIds) {
  const usable =
    isPlainObject(card) &&
    isString(card.id) &&
    isString(card.deckId) &&
    isString(card.question) &&
    isString(card.answer) &&
    deckIds.has(card.deckId);
  if (!usable) return null;

  return {
    id: card.id,
    deckId: card.deckId,
    question: card.question,
    answer: card.answer,
    createdAt: asNumber(card.createdAt, 0),
    dueAt: card.dueAt === null || isNumber(card.dueAt) ? card.dueAt : null,
    intervalDays: asNumber(card.intervalDays, 0),
    lastRating: asString(card.lastRating, null),
    reps: asNumber(card.reps, 0),
  };
}

function normalizeCounts(raw) {
  if (!isPlainObject(raw)) return {};
  return Object.entries(raw).reduce((counts, [key, value]) => {
    if (DAY_KEY.test(key) && isNumber(value) && value > 0) {
      counts[key] = Math.floor(value);
    }
    return counts;
  }, {});
}

/* ------------------------------------------------------------------ *
 * Repair — fix bad fields, keep good siblings
 * ------------------------------------------------------------------ */

function repairState(raw) {
  if (!isPlainObject(raw) || raw.version !== 1) return emptyState();

  const decks = compactMap(Array.isArray(raw.decks) ? raw.decks : [], normalizeDeck);
  const deckIds = new Set(decks.map((deck) => deck.id));
  const cards = compactMap(
    Array.isArray(raw.cards) ? raw.cards : [],
    (card) => normalizeCard(card, deckIds)
  );

  return { version: 1, decks, cards, reviewsByDay: normalizeCounts(raw.reviewsByDay) };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Read persisted state. Never writes. Returns a fresh empty state on any
 * failure (storage blocked, corrupt JSON, wrong schema).
 */
function loadState() {
  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Revision Loop: storage is unavailable (read blocked).', error);
    return emptyState();
  }
  if (!raw) return emptyState();

  try {
    return repairState(JSON.parse(raw));
  } catch (error) {
    console.warn('Revision Loop: saved data is not valid JSON. Starting fresh.', error);
    return emptyState();
  }
}

/**
 * Persist state. Returns true on success, false on failure (quota, blocked
 * storage, malformed input). Never throws.
 */
function saveState(state) {
  if (!isPlainObject(state) || state.version !== 1) {
    console.warn('Revision Loop: refusing to save malformed state.', state);
    return false;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('Revision Loop: could not save state.', error);
    return false;
  }
}