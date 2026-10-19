// ==== Revision Loop — storage.js ====
// Saves and loads the app's data. Nothing else.
// Public globals: STORAGE_KEY, emptyState(), loadState(), saveState(state)

var STORAGE_KEY = 'revisionLoop.v1';

// The default data shape. Everything starts empty.
function emptyState() {
  return { version: 1, decks: [], cards: [], reviewsByDay: {} };
}

// Save to the browser's storage. Returns true if it worked.
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('Could not save:', error);
    return false;
  }
}

// Load from the browser's storage. If anything is wrong (no data, corrupt
// data, old format), start fresh instead of crashing.
function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();

    var saved = JSON.parse(raw);
    if (!saved || saved.version !== 1) return emptyState();

    // Fill in anything missing so the rest of the app can trust the shape.
    saved.decks = Array.isArray(saved.decks) ? saved.decks : [];
    saved.cards = Array.isArray(saved.cards) ? saved.cards : [];
    saved.reviewsByDay = (saved.reviewsByDay && typeof saved.reviewsByDay === 'object')
      ? saved.reviewsByDay
      : {};

    return saved;
  } catch (error) {
    console.warn('Could not load — starting fresh:', error);
    return emptyState();
  }
}