// ==== Revision Loop — app.js ====
// UI layer. Depends on globals: loadState/saveState (storage.js),
// isDue/nextDueAt (scheduler.js). Never touches localStorage directly.

(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const SCREEN_IDS = ['screen-decks', 'screen-cards', 'screen-review', 'screen-stats'];
  const MAX_DECK_NAME = 100;
  const RATINGS = [
    { id: 'again', label: 'Again' },
    { id: 'hard', label: 'Hard' },
    { id: 'good', label: 'Good' },
    { id: 'easy', label: 'Easy' },
  ];
  const NAV_MAP = {
    deck: 'screen-decks', decks: 'screen-decks',
    review: 'screen-review',
    stats: 'screen-stats', statistics: 'screen-stats',
  };

  // ---------------------------------------------------------------- app state
  const state = {
    data: null,
    selectedDeckId: null,
    currentCard: null,
    idCounter: 0,
  };

  // ---------------------------------------------------------------- utilities
  const now = () => (window.__RL_NOW ? new Date(window.__RL_NOW) : new Date());
  const pad2 = (n) => String(n).padStart(2, '0');

  function dayKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function previousDayKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return dayKey(new Date(year, month - 1, day - 1));
  }

  function generateId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      try { return crypto.randomUUID(); } catch (ignored) {}
    }
    state.idCounter += 1;
    return `${Date.now()}-${state.idCounter}`;
  }

  function persist() {
    saveState(state.data);
  }

  const byId = (id) => document.getElementById(id);
  const clearChildren = (node) => { node.textContent = ''; };

  // Element factory: el('button', { class: 'x', text: 'Hi', on: { click } }, child)
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;
      if (key === 'class' || key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'on') {
        for (const [event, handler] of Object.entries(value)) {
          node.addEventListener(event, handler);
        }
      } else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.appendChild(
        typeof child === 'string' || typeof child === 'number'
          ? document.createTextNode(String(child))
          : child,
      );
    }
    return node;
  }

  // ---------------------------------------------------------------- screens
  function showScreen(screenId) {
    SCREEN_IDS.forEach((sid) => {
      const node = byId(sid);
      if (!node) return;
      const visible = sid === screenId;
      node.hidden = !visible;
      node.classList.toggle('hidden', !visible);
      node.style.display = visible ? '' : 'none';
    });
  }

  function navigateTo(screenId) {
    if (screenId === 'screen-review') reviewView.render();
    if (screenId === 'screen-stats') statsView.render();
    showScreen(screenId);
  }

  function bindNav() {
    const scope = document.querySelector('nav') || document.querySelector('header');
    const buttons = (scope || document).querySelectorAll('button');
    buttons.forEach((button) => {
      if (button.closest('.deck-controls, .card-controls, #review-card, #stats-wrap')) return;
      const target = NAV_MAP[button.textContent.trim().toLowerCase()];
      if (!target) return;
      button.addEventListener('click', () => navigateTo(target));
    });
  }

  // ---------------------------------------------------------------- deck view
  const deckView = {
    els: null,

    mount() {
      if (this.els) return;
      const screen = byId('screen-decks');
      if (!screen) return;

      const input = el('input', {
        type: 'text', id: 'deck-input', class: 'deck-input',
        placeholder: 'New deck name', maxLength: MAX_DECK_NAME,
        on: { keydown: (e) => { if (e.key === 'Enter') addDeck(); } },
      });
      const addButton = el('button', {
        type: 'button', id: 'add-deck-btn', class: 'btn btn-primary', text: 'Add deck',
        on: { click: () => addDeck() },
      });
      const error = el('p', { id: 'deck-error', class: 'error', hidden: true });
      const list = el('ul', { id: 'deck-list', class: 'deck-list' });

      screen.append(
        el('div', { class: 'deck-controls' }, input, addButton, error),
        list,
      );

      this.els = { input, addButton, error, list };
    },

    showError(message) {
      if (!this.els) return;
      this.els.error.textContent = message;
      this.els.error.hidden = false;
    },

    clearError() {
      if (!this.els) return;
      this.els.error.textContent = '';
      this.els.error.hidden = true;
    },

    render() {
      if (!this.els) return;
      clearChildren(this.els.list);
      const decks = state.data.decks.slice().sort((a, b) => a.createdAt - b.createdAt);

      if (decks.length === 0) {
        this.els.list.appendChild(
          el('p', { class: 'muted', text: 'No decks yet. Add one above.' }),
        );
        return;
      }
      decks.forEach((deck) => this.els.list.appendChild(deckRow(deck)));
    },
  };

  function deckRow(deck) {
    const nameButton = el('button', {
      type: 'button', class: 'deck-name', text: deck.name,
      on: { click: () => openCardsForDeck(deck.id) },
    });
    const reviewButton = el('button', {
      type: 'button', class: 'btn btn-ghost', text: 'Review',
      on: { click: () => openReviewForDeck(deck.id) },
    });
    const renameButton = el('button', {
      type: 'button', class: 'btn btn-ghost', text: 'Rename',
      on: { click: () => renameDeck(deck.id) },
    });
    const deleteButton = el('button', {
      type: 'button', class: 'btn btn-ghost btn-danger', text: 'Delete',
      on: { click: () => deleteDeck(deck.id) },
    });
    return el('li', { class: 'deck-row' },
      nameButton, reviewButton, renameButton, deleteButton,
    );
  }

  function findDeck(id) {
    return state.data.decks.find((deck) => deck.id === id);
  }

  function isDuplicateDeckName(name, excludeId) {
    const needle = name.toLowerCase();
    return state.data.decks.some(
      (deck) => deck.id !== excludeId && deck.name.toLowerCase() === needle,
    );
  }

  function addDeck() {
    if (!deckView.els) return;
    const name = deckView.els.input.value.trim();
    if (!name) return deckView.showError('Deck name cannot be empty.');
    if (name.length > MAX_DECK_NAME) {
      return deckView.showError(`Deck name is too long (max ${MAX_DECK_NAME}).`);
    }
    if (isDuplicateDeckName(name)) {
      return deckView.showError('A deck with that name already exists.');
    }

    deckView.clearError();
    state.data.decks.push({ id: generateId(), name, createdAt: Date.now() });
    persist();
    deckView.els.input.value = '';
    deckView.render();
  }

  function renameDeck(id) {
    const deck = findDeck(id);
    if (!deck) return;
    const raw = window.prompt('New name for this deck:', deck.name);
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return alert('Deck name cannot be empty.');
    if (name.length > MAX_DECK_NAME) return alert(`Deck name is too long (max ${MAX_DECK_NAME}).`);
    if (isDuplicateDeckName(name, id)) return alert('A deck with that name already exists.');
    deck.name = name;
    persist();
    deckView.render();
  }

  function deleteDeck(id) {
    const deck = findDeck(id);
    if (!deck) return;
    if (!window.confirm(`Delete "${deck.name}" and all its cards?`)) return;
    state.data.decks = state.data.decks.filter((d) => d.id !== id);
    state.data.cards = state.data.cards.filter((c) => c.deckId !== id);
    if (state.selectedDeckId === id) state.selectedDeckId = null;
    persist();
    deckView.render();
  }

  // ---------------------------------------------------------------- card view
  const cardView = {
    els: null,

    mount() {
      if (this.els) return;
      const screen = byId('screen-cards');
      if (!screen) return;

      const back = el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Back to decks',
        on: { click: () => showScreen('screen-decks') },
      });
      const question = el('textarea', {
        id: 'card-question', class: 'card-textarea', placeholder: 'Question', rows: 2,
      });
      const answer = el('textarea', {
        id: 'card-answer', class: 'card-textarea', placeholder: 'Answer', rows: 2,
      });
      const addButton = el('button', {
        type: 'button', id: 'add-card-btn', class: 'btn btn-primary', text: 'Add card',
        on: { click: () => addCard() },
      });
      const error = el('p', { id: 'card-error', class: 'error', hidden: true });
      const list = el('ul', { id: 'card-list', class: 'card-list' });

      screen.append(
        el('div', { class: 'card-controls' }, back, question, answer, addButton, error),
        list,
      );

      this.els = { question, answer, error, list };
    },

    showError(message) {
      if (!this.els) return;
      this.els.error.textContent = message;
      this.els.error.hidden = false;
    },

    clearError() {
      if (!this.els) return;
      this.els.error.textContent = '';
      this.els.error.hidden = true;
    },

    render() {
      if (!this.els) return;
      clearChildren(this.els.list);
      if (!state.selectedDeckId) return;

      const cards = state.data.cards.filter((card) => card.deckId === state.selectedDeckId);
      if (cards.length === 0) {
        this.els.list.appendChild(
          el('p', { class: 'muted', text: 'No cards in this deck yet.' }),
        );
        return;
      }
      cards.forEach((card) => this.els.list.appendChild(cardRow(card)));
    },
  };

  function cardRow(card) {
    return el('li', { class: 'card-row' },
      el('p', { class: 'card-q', text: `Q: ${card.question}` }),
      el('p', { class: 'card-a', text: `A: ${card.answer}` }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Edit',
        on: { click: () => editCard(card.id) },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-danger', text: 'Delete',
        on: { click: () => deleteCard(card.id) },
      }),
    );
  }

  function ensureCardsHeading(deckName) {
    const screen = byId('screen-cards');
    if (!screen) return;
    let heading = byId('cards-heading');
    if (!heading) {
      heading = el('h2', { id: 'cards-heading' });
      screen.insertBefore(heading, screen.firstChild);
    }
    heading.textContent = deckName;
  }

  function openCardsForDeck(id) {
    const deck = findDeck(id);
    if (!deck) return;
    state.selectedDeckId = id;
    ensureCardsHeading(deck.name);
    cardView.render();
    showScreen('screen-cards');
  }

  function addCard() {
    if (!cardView.els || !state.selectedDeckId) return;
    const question = cardView.els.question.value.trim();
    const answer = cardView.els.answer.value.trim();
    if (!question || !answer) {
      return cardView.showError('Both question and answer are required.');
    }

    cardView.clearError();
    state.data.cards.push({
      id: generateId(),
      deckId: state.selectedDeckId,
      question,
      answer,
      createdAt: Date.now(),
      dueAt: null,
      intervalDays: 0,
      lastRating: null,
      reps: 0,
    });
    persist();
    cardView.els.question.value = '';
    cardView.els.answer.value = '';
    cardView.render();
  }

  function editCard(id) {
    const card = state.data.cards.find((c) => c.id === id);
    if (!card) return;
    const rawQuestion = window.prompt('Question:', card.question);
    if (rawQuestion === null) return;
    const rawAnswer = window.prompt('Answer:', card.answer);
    if (rawAnswer === null) return;
    const question = rawQuestion.trim();
    const answer = rawAnswer.trim();
    if (!question || !answer) return alert('Both question and answer are required.');
    card.question = question;
    card.answer = answer;
    persist();
    cardView.render();
  }

  function deleteCard(id) {
    if (!window.confirm('Delete this card?')) return;
    state.data.cards = state.data.cards.filter((c) => c.id !== id);
    persist();
    cardView.render();
  }

  // -------------------------------------------------------------- review view
  const reviewView = {
    els: null,

    mount() {
      if (this.els) return;
      const screen = byId('screen-review');
      if (!screen) return;

      const back = el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Back to decks',
        on: { click: () => showScreen('screen-decks') },
      });
      const deckName = el('p', { id: 'review-deck-name', class: 'muted' });
      const question = el('h3', { id: 'review-question', class: 'review-question' });
      const revealButton = el('button', {
        type: 'button', id: 'review-reveal', class: 'btn btn-primary',
        text: 'Reveal answer',
        on: { click: () => this.reveal() },
      });
      const answer = el('p', { id: 'review-answer', class: 'review-answer', hidden: true });
      const ratingRow = el('div', { id: 'review-rating-row', class: 'rating-row', hidden: true },
        ...RATINGS.map((rating) => el('button', {
          type: 'button', class: `btn rating-btn rating-${rating.id}`, text: rating.label,
          on: { click: () => rateCard(rating.id) },
        })),
      );
      const empty = el('p', {
        id: 'review-empty', class: 'muted', hidden: true, text: 'Nothing due today.',
      });
      const devButton = el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Dev: make all cards due',
        on: { click: () => this.devMakeAllDue() },
      });

      screen.appendChild(el('div', { id: 'review-card', class: 'review-card' },
        back, deckName, question, revealButton, answer, ratingRow, empty, devButton,
      ));

      this.els = { deckName, question, revealButton, answer, ratingRow, empty };
    },

    reveal() {
      if (!this.els || !state.currentCard) return;
      this.els.answer.hidden = false;
      this.els.revealButton.hidden = true;
      this.els.ratingRow.hidden = false;
    },

    showEmpty(message) {
      if (!this.els) return;
      state.currentCard = null;
      this.els.question.hidden = true;
      this.els.revealButton.hidden = true;
      this.els.answer.hidden = true;
      this.els.ratingRow.hidden = true;
      this.els.empty.hidden = false;
      this.els.empty.textContent = message;
    },

    render() {
      if (!this.els) return;
      const deck = state.selectedDeckId ? findDeck(state.selectedDeckId) : null;
      this.els.deckName.textContent = deck ? `Reviewing: ${deck.name}` : '';

      if (!deck) return this.showEmpty('Pick a deck first.');

      const currentTime = now();
      const due = state.data.cards.filter(
        (card) => card.deckId === deck.id && isDue(card, currentTime),
      );

      if (due.length === 0) return this.showEmpty('Nothing due today.');

      state.currentCard = due[0];
      this.els.empty.hidden = true;
      this.els.question.hidden = false;
      this.els.question.textContent = state.currentCard.question;
      this.els.answer.textContent = state.currentCard.answer;
      this.els.answer.hidden = true;
      this.els.revealButton.hidden = false;
      this.els.ratingRow.hidden = true;
    },

    devMakeAllDue() {
      const timestamp = now().getTime();
      state.data.cards.forEach((card) => { card.dueAt = timestamp; });
      persist();
      this.render();
    },
  };

  function openReviewForDeck(id) {
    state.selectedDeckId = id;
    reviewView.render();
    showScreen('screen-review');
  }

  function rateCard(rating) {
    const card = state.currentCard;
    if (!card) return;

    const currentTime = now();
    const next = nextDueAt(rating, currentTime);

    card.dueAt = next.dueAt;
    card.intervalDays = next.intervalDays;
    card.lastRating = rating;
    card.reps = (card.reps || 0) + 1;

    const key = dayKey(currentTime);
    state.data.reviewsByDay[key] = (state.data.reviewsByDay[key] || 0) + 1;

    persist();
    reviewView.render();
  }

  // --------------------------------------------------------------- stats view
  const statsView = {
    els: null,

    mount() {
      if (this.els) return;
      const screen = byId('screen-stats');
      if (!screen) return;

      const body = el('dl', { id: 'stats-body', class: 'stats-body' });
      const exportButton = el('button', {
        type: 'button', id: 'export-btn', class: 'btn btn-primary', text: 'Export JSON',
        on: { click: () => exportJSON() },
      });
      const importInput = el('input', {
        type: 'file', id: 'import-input', accept: 'application/json,.json', hidden: true,
      });
      importInput.addEventListener('change', () => {
        const [file] = importInput.files || [];
        if (file) importJSON(file);
        importInput.value = '';
      });
      const importLabel = el('label', { class: 'btn btn-ghost import-label' },
        'Import JSON', importInput,
      );

      screen.appendChild(el('div', { id: 'stats-wrap', class: 'stats-wrap' },
        body, exportButton, importLabel,
      ));

      this.els = { body, exportButton, importInput };
    },

    render() {
      if (!this.els) return;
      const currentTime = now();
      const todayKey = dayKey(currentTime);
      const dueCount = state.data.cards.filter((card) => isDue(card, currentTime)).length;
      const reviewedToday = state.data.reviewsByDay[todayKey] || 0;
      const streak = computeStreak(currentTime);

      clearChildren(this.els.body);
      this.els.body.append(
        el('dt', { text: 'Cards due today' }),
        el('dd', { text: String(dueCount) }),
        el('dt', { text: 'Cards reviewed today' }),
        el('dd', { text: String(reviewedToday) }),
        el('dt', { text: 'Streak' }),
        el('dd', { text: streakLabel(streak, reviewedToday) }),
      );
    },
  };

  function streakLabel(streak, reviewedToday) {
    if (reviewedToday > 0) return `${streak}-day streak`;
    if (streak > 0) return `${streak}-day streak · review today to keep it`;
    return '0-day streak';
  }

  function computeStreak(referenceTime) {
    const todayKey = dayKey(referenceTime);
    let cursor;
    if ((state.data.reviewsByDay[todayKey] || 0) > 0) {
      cursor = todayKey;
    } else {
      const yesterdayKey = previousDayKey(todayKey);
      if ((state.data.reviewsByDay[yesterdayKey] || 0) > 0) cursor = yesterdayKey;
      else return 0;
    }
    let count = 0;
    while ((state.data.reviewsByDay[cursor] || 0) > 0) {
      count += 1;
      cursor = previousDayKey(cursor);
    }
    return count;
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = el('a', { href: url, download: 'revisionLoop-backup.json' });
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const valid = parsed
          && parsed.version === 1
          && Array.isArray(parsed.decks)
          && Array.isArray(parsed.cards);
        if (!valid) return alert('Invalid backup file.');

        if (!parsed.reviewsByDay || typeof parsed.reviewsByDay !== 'object') {
          parsed.reviewsByDay = {};
        }
        const confirmed = window.confirm(
          'Replace all current data with this backup? ' +
          `(${parsed.decks.length} decks, ${parsed.cards.length} cards)`,
        );
        if (!confirmed) return;

        state.data = parsed;
        persist();
        state.selectedDeckId = null;
        deckView.render();
        showScreen('screen-decks');
      } catch (error) {
        alert(`Could not read file: ${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------------ startup
  function initializeApp() {
    state.data = loadState();
    if (!state.data.reviewsByDay) state.data.reviewsByDay = {};

    deckView.mount();
    cardView.mount();
    reviewView.mount();
    statsView.mount();
    bindNav();
    deckView.render();
    showScreen('screen-decks');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
})();