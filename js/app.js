// ==== Revision Loop — app.js ====
// UI layer. Depends on globals from storage.js and scheduler.js.
// Never touches localStorage directly.

(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  var SCREEN_IDS = ['screen-decks', 'screen-cards', 'screen-review', 'screen-stats'];
  var MAX_DECK_NAME = 100;
  var RATINGS = [
    { id: 'again', label: 'Again' },
    { id: 'hard', label: 'Hard' },
    { id: 'good', label: 'Good' },
    { id: 'easy', label: 'Easy' }
  ];

  // Dev tools only appear when running locally.
  var IS_LOCAL = location.hostname === 'localhost'
    || location.protocol === 'file:';

  // ---------------------------------------------------------------- app state
  var state = {
    data: null,
    selectedDeckId: null,
    currentCard: null,
    idCounter: 0,
    reviewQueue: null
  };

  // ---------------------------------------------------------------- utilities
  function now() {
    return window.__RL_NOW ? new Date(window.__RL_NOW) : new Date();
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }
  function previousDayKey(key) {
    var p = key.split('-');
    return dayKey(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) - 1));
  }
  function generateId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      try { return crypto.randomUUID(); } catch (ignored) {}
    }
    state.idCounter += 1;
    return Date.now() + '-' + state.idCounter;
  }
  function persist() {
    if (!saveState(state.data)) {
      console.warn('Revision Loop: save failed — data may not persist on refresh.');
    }
  }
  function byId(id) { return document.getElementById(id); }
  function clearChildren(node) { node.textContent = ''; }

  // Element factory
  function el(tag, props, ...children) {
    props = props || {};
    var node = document.createElement(tag);
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value === null || value === undefined) return;
      if (key === 'class' || key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'on') {
        Object.keys(value).forEach(function (event) {
          node.addEventListener(event, value[event]);
        });
      } else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    });
    children.flat().forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(
        typeof child === 'string' || typeof child === 'number'
          ? document.createTextNode(String(child))
          : child
      );
    });
    return node;
  }

  // ---------------------------------------------------------------- screens
  function showScreen(screenId) {
    SCREEN_IDS.forEach(function (sid) {
      var node = byId(sid);
      if (!node) return;
      var visible = sid === screenId;
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
    // Updated for CYLTabBar style bottom navigation
    var tabButtons = document.querySelectorAll('.tab-btn, .tab-center-btn');
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-target');
        var screenId = 'screen-' + target;

        // Update active tab styling
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        if (this.classList.contains('tab-btn')) this.classList.add('active');

        navigateTo(screenId);
      });
    });
  }

  // ---------------------------------------------------------------- decks
  var deckView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-decks');
      if (!screen) return;

      var input = el('input', {
        type: 'text', id: 'deck-input', class: 'deck-input',
        placeholder: 'New deck name', maxLength: MAX_DECK_NAME,
        on: { keydown: function (e) { if (e.key === 'Enter') addDeck(); } }
      });
      var addButton = el('button', {
        type: 'button', id: 'add-deck-btn', class: 'btn btn-primary', text: 'Add deck',
        on: { click: addDeck }
      });
      var error = el('p', { id: 'deck-error', class: 'error', hidden: true });
      var list = el('ul', { id: 'deck-list', class: 'deck-list' });

      screen.appendChild(el('div', { class: 'deck-controls' }, input, addButton, error));
      screen.appendChild(list);

      this.els = { input: input, addButton: addButton, error: error, list: list };
    },
    showError: function (msg) {
      if (!this.els) return;
      this.els.error.textContent = msg;
      this.els.error.hidden = false;
    },
    clearError: function () {
      if (!this.els) return;
      this.els.error.textContent = '';
      this.els.error.hidden = true;
    },
    render: function () {
      if (!this.els) return;
      clearChildren(this.els.list);
      var decks = state.data.decks.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
      if (decks.length === 0) {
        this.els.list.appendChild(el('p', { class: 'muted', text: 'No decks yet. Add one above.' }));
        return;
      }
      var self = this;
      decks.forEach(function (deck) {
        self.els.list.appendChild(deckRow(deck));
      });
    }
  };

  function deckRow(deck) {
    return el('li', { class: 'deck-row' },
      el('button', {
        type: 'button', class: 'deck-name', text: deck.name,
        on: { click: function () { openCardsForDeck(deck.id); } }
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Review',
        on: { click: function () { openReviewForDeck(deck.id); } }
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Rename',
        on: { click: function () { renameDeck(deck.id); } }
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-danger', text: 'Delete',
        on: { click: function () { deleteDeck(deck.id); } }
      })
    );
  }

  function findDeck(id) {
    return state.data.decks.filter(function (d) { return d.id === id; })[0];
  }
  function isDuplicateDeckName(name, excludeId) {
    var needle = name.toLowerCase();
    return state.data.decks.some(function (d) {
      return d.id !== excludeId && d.name.toLowerCase() === needle;
    });
  }
  function addDeck() {
    if (!deckView.els) return;
    var name = deckView.els.input.value.trim();
    if (!name) return deckView.showError('Deck name cannot be empty.');
    if (name.length > MAX_DECK_NAME) return deckView.showError('Deck name is too long.');
    if (isDuplicateDeckName(name)) return deckView.showError('A deck with that name already exists.');
    deckView.clearError();
    state.data.decks.push({ id: generateId(), name: name, createdAt: Date.now() });
    persist();
    deckView.els.input.value = '';
    deckView.render();
  }
  function renameDeck(id) {
    var deck = findDeck(id);
    if (!deck) return;
    var raw = window.prompt('New name for this deck:', deck.name);
    if (raw === null) return;
    var name = raw.trim();
    if (!name) return alert('Deck name cannot be empty.');
    if (isDuplicateDeckName(name, id)) return alert('A deck with that name already exists.');
    deck.name = name;
    persist();
    deckView.render();
  }
  function deleteDeck(id) {
    var deck = findDeck(id);
    if (!deck) return;
    if (!window.confirm('Delete "' + deck.name + '" and all its cards?')) return;
    state.data.decks = state.data.decks.filter(function (d) { return d.id !== id; });
    state.data.cards = state.data.cards.filter(function (c) { return c.deckId !== id; });
    if (state.selectedDeckId === id) state.selectedDeckId = null;
    persist();
    deckView.render();
  }

  // ---------------------------------------------------------------- cards
  var cardView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-cards');
      if (!screen) return;

      var back = el('button', {
        type: 'button', class: 'btn btn-ghost', text: '← Back to decks',
        on: { click: function () { showScreen('screen-decks'); } }
      });
      var question = el('textarea', { id: 'card-question', class: 'card-textarea', placeholder: 'Question', rows: 2 });
      var answer = el('textarea', { id: 'card-answer', class: 'card-textarea', placeholder: 'Answer', rows: 2 });
      var addButton = el('button', {
        type: 'button', id: 'add-card-btn', class: 'btn btn-primary', text: 'Add card',
        on: { click: addCard }
      });
      var error = el('p', { id: 'card-error', class: 'error', hidden: true });
      var list = el('ul', { id: 'card-list', class: 'card-list' });

      screen.appendChild(el('div', { class: 'card-controls' }, back, question, answer, addButton, error));
      screen.appendChild(list);

      this.els = { question: question, answer: answer, error: error, list: list };
    },
    showError: function (msg) {
      if (!this.els) return;
      this.els.error.textContent = msg;
      this.els.error.hidden = false;
    },
    clearError: function () {
      if (!this.els) return;
      this.els.error.textContent = '';
      this.els.error.hidden = true;
    },
    render: function () {
      if (!this.els) return;
      clearChildren(this.els.list);
      if (!state.selectedDeckId) return;
      
      var cards = state.data.cards.filter(function (c) { return c.deckId === state.selectedDeckId; });
      
      if (cards.length === 0) {
        this.els.list.appendChild(el('p', { class: 'muted', text: 'No cards in this deck yet.' }));
        return;
      }
      var self = this;
      cards.forEach(function (card) { self.els.list.appendChild(cardRow(card)); });
    }
  };

  function cardRow(card) {
    var deckCards = state.data.cards.filter(function (c) { return c.deckId === state.selectedDeckId; });
    var isFirst = deckCards[0] && deckCards[0].id === card.id;
    var isLast = deckCards[deckCards.length - 1] && deckCards[deckCards.length - 1].id === card.id;

    return el('li', { class: 'card-row' },
      el('div', { class: 'card-text' },
        el('p', { class: 'card-q', text: 'Q: ' + card.question }),
        el('p', { class: 'card-a', text: 'A: ' + card.answer })
      ),
      el('div', { class: 'card-actions' },
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sort', text: '↑', disabled: isFirst,
          on: { click: function () { moveCard(card.id, -1); } }
        }),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sort', text: '↓', disabled: isLast,
          on: { click: function () { moveCard(card.id, 1); } }
        }),
        el('button', {
          type: 'button', class: 'btn btn-ghost', text: 'Edit',
          on: { click: function () { editCard(card.id); } }
        }),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-danger', text: 'Delete',
          on: { click: function () { deleteCard(card.id); } }
        })
      )
    );
  }

  function moveCard(id, direction) {
    var deckCards = state.data.cards.filter(function (c) { return c.deckId === state.selectedDeckId; });
    var index = deckCards.findIndex(function (c) { return c.id === id; });
    var swapIndex = index + direction;

    if (swapIndex < 0 || swapIndex >= deckCards.length) return;

    var cardA = deckCards[index];
    var cardB = deckCards[swapIndex];
    var masterIndexA = state.data.cards.indexOf(cardA);
    var masterIndexB = state.data.cards.indexOf(cardB);

    state.data.cards[masterIndexA] = cardB;
    state.data.cards[masterIndexB] = cardA;

    persist();
    cardView.render();
  }

  function ensureCardsHeading(deckName) {
    var screen = byId('screen-cards');
    if (!screen) return;
    var heading = byId('cards-heading');
    if (!heading) {
      heading = el('h2', { id: 'cards-heading' });
      screen.insertBefore(heading, screen.firstChild);
    }
    heading.textContent = deckName;
  }

  function openCardsForDeck(id) {
    var deck = findDeck(id);
    if (!deck) return;
    state.selectedDeckId = id;
    ensureCardsHeading(deck.name);
    cardView.render();
    showScreen('screen-cards');
    
    // Auto-switch tab highlight to Decks, since cards are part of decks
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('.tab-btn[data-target="decks"]').classList.add('active');
  }

  function addCard() {
    if (!cardView.els || !state.selectedDeckId) return;
    var question = cardView.els.question.value.trim();
    var answer = cardView.els.answer.value.trim();
    if (!question || !answer) return cardView.showError('Both question and answer are required.');
    cardView.clearError();
    state.data.cards.push({
      id: generateId(),
      deckId: state.selectedDeckId,
      question: question, answer: answer,
      createdAt: Date.now(),
      dueAt: null, intervalDays: 0, lastRating: null, reps: 0
    });
    persist();
    cardView.els.question.value = '';
    cardView.els.answer.value = '';
    cardView.render();
  }

  function editCard(id) {
    var card = state.data.cards.filter(function (c) { return c.id === id; })[0];
    if (!card) return;
    var q = window.prompt('Question:', card.question);
    if (q === null) return;
    var a = window.prompt('Answer:', card.answer);
    if (a === null) return;
    q = q.trim(); a = a.trim();
    if (!q || !a) return alert('Both question and answer are required.');
    card.question = q; card.answer = a;
    persist();
    cardView.render();
  }

  function deleteCard(id) {
    if (!window.confirm('Delete this card?')) return;
    state.data.cards = state.data.cards.filter(function (c) { return c.id !== id; });
    persist();
    cardView.render();
  }

  // ---------------------------------------------------------------- review
  var reviewView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-review');
      if (!screen) return;

      var self = this;
      var back = el('button', {
        type: 'button', class: 'btn btn-ghost', text: '← Back to decks', style: 'align-self: flex-start; margin-bottom: 20px;',
        on: { click: function () { showScreen('screen-decks'); } }
      });
      
      var deckName = el('p', { id: 'review-deck-name', class: 'muted', style: 'text-align: center; margin-bottom: 20px;' });
      
      // The Flashcard Container (3D)
      var flashcard = el('div', { class: 'flashcard-container' },
        el('div', { class: 'flashcard' },
          el('div', { class: 'flashcard-face flashcard-front' },
            el('span', { class: 'flashcard-hint', text: 'QUESTION' }),
            el('h3', { id: 'review-question', class: 'review-question' })
          ),
          el('div', { class: 'flashcard-face flashcard-back' },
            el('span', { class: 'flashcard-hint', text: 'ANSWER' }),
            el('p', { id: 'review-answer', class: 'review-answer' })
          )
        )
      );

      var revealButton = el('button', {
        type: 'button', id: 'review-reveal', class: 'btn btn-primary reveal-btn', text: 'Show Answer',
        on: { click: function () { self.reveal(); } }
      });

      var ratingRow = el('div', { id: 'review-rating-row', class: 'rating-row', hidden: true });
      RATINGS.forEach(function (r) {
        ratingRow.appendChild(el('button', {
          type: 'button', class: 'btn rating-btn rating-' + r.id, text: r.label,
          on: { click: function () { rateCard(r.id); } }
        }));
      });

      var empty = el('p', { id: 'review-empty', class: 'muted', hidden: true, text: 'Nothing due today.', style: 'text-align: center; font-size: 18px; margin-top: 40px;' });

      var cardWrapper = el('div', { id: 'review-card', class: 'review-wrapper' },
        back, deckName, flashcard, revealButton, ratingRow, empty
      );

      if (IS_LOCAL) {
        cardWrapper.appendChild(el('button', {
          type: 'button', class: 'btn btn-ghost', text: 'Dev: make all cards due', style: 'margin-top: 40px; font-size: 12px;',
          on: { click: function () { self.devMakeAllDue(); } }
        }));
      }
      
      screen.appendChild(cardWrapper);

      this.els = {
        deckName: deckName, 
        question: byId('review-question'), 
        revealButton: revealButton,
        answer: byId('review-answer'), 
        ratingRow: ratingRow, 
        empty: empty,
        flashcard: flashcard.querySelector('.flashcard'),
        flashcardContainer: flashcard
      };
    },

    reveal: function () {
      if (!this.els || !state.currentCard) return;
      this.els.flashcard.classList.add('is-flipped'); // Triggers 3D flip
      this.els.revealButton.hidden = true;
      this.els.ratingRow.hidden = false;
    },

    showEmpty: function (message) {
      if (!this.els) return;
      state.currentCard = null;
      this.els.flashcardContainer.hidden = true;
      this.els.revealButton.hidden = true;
      this.els.ratingRow.hidden = true;
      this.els.empty.hidden = false;
      this.els.empty.textContent = message;
    },

    render: function () {
      if (!this.els) return;
      var deck = state.selectedDeckId ? findDeck(state.selectedDeckId) : null;
      
      if (!deck) {
        this.els.deckName.textContent = '';
        state.reviewQueue = null;
        return this.showEmpty('Pick a deck first.');
      }

      if (!state.reviewQueue) {
        var t = now();
        state.reviewQueue = state.data.cards
          .filter(function (c) { return c.deckId === deck.id && isDue(c, t); })
          .sort(function (a, b) { return (a.dueAt || 0) - (b.dueAt || 0); });
      }
      
      var t2 = now();
      var due = state.reviewQueue.filter(function (c) { return isDue(c, t2); });
      
      if (due.length === 0) {
        this.els.deckName.textContent = 'Reviewing: ' + deck.name;
        state.reviewQueue = null;
        return this.showEmpty('Nothing due today.');
      }
      
      // Show the flashcard container and reset flip state
      this.els.flashcardContainer.hidden = false;
      this.els.flashcard.classList.remove('is-flipped');
      this.els.deckName.textContent = 'Reviewing: ' + deck.name + ' · ' + due.length + ' due';
      
      state.currentCard = due[0];
      this.els.empty.hidden = true;
      this.els.question.textContent = state.currentCard.question;
      this.els.answer.textContent = state.currentCard.answer;
      
      this.els.revealButton.hidden = false;
      this.els.ratingRow.hidden = true;
      this.els.ratingRow.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
    },

    devMakeAllDue: function () {
      var t = now().getTime();
      state.data.cards.forEach(function (c) { c.dueAt = t; });
      state.reviewQueue = null;
      persist();
      this.render();
    }
  };

  function openReviewForDeck(id) {
    state.selectedDeckId = id;
    state.reviewQueue = null;
    reviewView.render();
    showScreen('screen-review');
    
    // Auto-switch tab highlight to Review
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('.tab-btn[data-target="review"]').classList.add('active');
  }

  function rateCard(rating) {
    var card = state.currentCard;
    if (!card) return;
    
    // Disable buttons immediately
    reviewView.els.ratingRow.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    
    // Trigger the card fly-out animation
    reviewView.els.flashcardContainer.classList.add('card-exit');

    // Wait for the fly-out animation to finish before loading the next card
    setTimeout(function () {
      var t = now();
      var next = nextDueAt(rating, t);
      card.dueAt = next.dueAt;
      card.intervalDays = next.intervalDays;
      card.lastRating = rating;
      card.reps = (card.reps || 0) + 1;
      
      var key = dayKey(t);
      state.data.reviewsByDay[key] = (state.data.reviewsByDay[key] || 0) + 1;
      
      persist();
      
      // Remove the exit class so the new card can appear
      reviewView.els.flashcardContainer.classList.remove('card-exit');
      reviewView.render();
    }, 400); // 400ms matches the CSS animation duration
  }

  // ---------------------------------------------------------------- stats
  var statsView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-stats');
      if (!screen) return;

      var body = el('dl', { id: 'stats-body', class: 'stats-body' });
      var exportButton = el('button', {
        type: 'button', id: 'export-btn', class: 'btn btn-primary', text: 'Export JSON',
        on: { click: exportJSON }
      });
      var importInput = el('input', {
        type: 'file', id: 'import-input', accept: 'application/json,.json', hidden: true
      });
      importInput.addEventListener('change', function () {
        var file = importInput.files && importInput.files[0];
        if (file) importJSON(file);
        importInput.value = '';
      });
      var importLabel = el('label', { class: 'btn btn-ghost import-label' }, 'Import JSON', importInput);

      var wrap = el('div', { id: 'stats-wrap', class: 'stats-wrap' },
        body, exportButton, importLabel
      );
      if (IS_LOCAL) {
        wrap.appendChild(el('button', {
          type: 'button', class: 'btn btn-ghost btn-danger', text: 'Reset all data',
          on: { click: resetAll }
        }));
      }
      screen.appendChild(wrap);

      this.els = { body: body };
    },
    render: function () {
      if (!this.els) return;
      var t = now();
      var today = dayKey(t);
      var due = state.data.cards.filter(function (c) { return isDue(c, t); }).length;
      var reviews = state.data.reviewsByDay || {};
      var reviewedToday = reviews[today] || 0;
      var streak = computeStreak(t);
      clearChildren(this.els.body);
      this.els.body.appendChild(el('dt', { text: 'Cards due today' }));
      this.els.body.appendChild(el('dd', { text: String(due) }));
      this.els.body.appendChild(el('dt', { text: 'Cards reviewed today' }));
      this.els.body.appendChild(el('dd', { text: String(reviewedToday) }));
      this.els.body.appendChild(el('dt', { text: 'Streak' }));
      this.els.body.appendChild(el('dd', { text: streakLabel(streak, reviewedToday) }));
    }
  };

  function resetAll() {
    if (!window.confirm('Delete all decks, cards and stats? This cannot be undone.')) return;
    state.data = emptyState();
    persist();
    state.selectedDeckId = null;
    state.currentCard = null;
    state.reviewQueue = null;
    deckView.render();
    showScreen('screen-decks');
  }

  function streakLabel(streak, reviewedToday) {
    if (reviewedToday > 0) return streak + '-day streak';
    if (streak > 0) return streak + '-day streak · review today to keep it';
    return '0-day streak';
  }

  function computeStreak(referenceTime) {
    var reviews = state.data.reviewsByDay || {};
    var today = dayKey(referenceTime);
    var cursor;
    if ((reviews[today] || 0) > 0) cursor = today;
    else {
      var y = previousDayKey(today);
      if ((reviews[y] || 0) > 0) cursor = y;
      else return 0;
    }
    var count = 0;
    while ((reviews[cursor] || 0) > 0) {
      count += 1;
      cursor = previousDayKey(cursor);
    }
    return count;
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'revisionLoop-backup.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || parsed.version !== 1
          || !Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
          return alert('Invalid backup file.');
        }
        if (!parsed.reviewsByDay || typeof parsed.reviewsByDay !== 'object') {
          parsed.reviewsByDay = {};
        }
        if (!window.confirm('Replace all current data? (' + parsed.decks.length
          + ' decks, ' + parsed.cards.length + ' cards)')) return;
        state.data = parsed;
        persist();
        state.selectedDeckId = null;
        state.currentCard = null;
        state.reviewQueue = null;
        deckView.render();
        showScreen('screen-decks');
      } catch (error) {
        alert('Could not read file: ' + error.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------- startup
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
