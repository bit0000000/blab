// ==== Revision Loop — app.js ====
// UI layer. Depends on globals from storage.js and scheduler.js.

(function () {
  'use strict';

  var SCREEN_IDS = ['screen-decks', 'screen-cards', 'screen-review', 'screen-stats'];
  var MAX_DECK_NAME = 100;
  var RATINGS = [
    { id: 'again', label: 'Again' },
    { id: 'hard', label: 'Hard' },
    { id: 'good', label: 'Good' },
    { id: 'easy', label: 'Easy' }
  ];
  var IS_LOCAL = location.hostname === 'localhost' || location.protocol === 'file:';

  var state = {
    data: null,
    selectedDeckId: null,
    currentCard: null,
    idCounter: 0,
    reviewQueue: null,
    initialReviewCount: 0
  };

  // ---------------------------------------------------------------- Utilities
  function now() { return window.__RL_NOW ? new Date(window.__RL_NOW) : new Date(); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(date) { return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()); }
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
    if (!saveState(state.data)) console.warn('Revision Loop: save failed.');
  }
  function byId(id) { return document.getElementById(id); }
  function clearChildren(node) { node.textContent = ''; }

  function showToast(message) {
    var container = document.querySelector('.toast-container');
    if (!container) {
      container = el('div', { class: 'toast-container' });
      document.body.appendChild(container);
    }
    var toast = el('div', { class: 'toast', text: message });
    container.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  function el(tag, props, ...children) {
    props = props || {};
    var node = document.createElement(tag);
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value === null || value === undefined) return;
      if (key === 'class' || key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'on') {
        Object.keys(value).forEach(function (event) { node.addEventListener(event, value[event]); });
      } else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    });
    children.flat().forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    });
    return node;
  }

  // ---------------------------------------------------------------- Navigation
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
    document.querySelectorAll('.tab-btn, .tab-center-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-target');
        var screenId = 'screen-' + target;
        
        if (target === 'cards' && !state.selectedDeckId) {
          showToast('Pick a deck first to add cards.');
          return;
        }

        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        if (this.classList.contains('tab-btn')) this.classList.add('active');
        navigateTo(screenId);
      });
    });

    // Global Keyboard Shortcuts for Review
    document.addEventListener('keydown', function(e) {
      if (byId('screen-review').hidden) return;
      
      if (e.code === 'Space' && !reviewView.els.revealButton.hidden) {
        e.preventDefault();
        reviewView.reveal();
      }
      if (!reviewView.els.ratingRow.hidden) {
        if (e.key === '1') rateCard('again');
        if (e.key === '2') rateCard('hard');
        if (e.key === '3') rateCard('good');
        if (e.key === '4') rateCard('easy');
      }
    });
  }

  // ---------------------------------------------------------------- Deck View
  var deckView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-decks');
      if (!screen) return;

      var input = el('input', { type: 'text', id: 'deck-input', class: 'deck-input', placeholder: 'New deck name', maxLength: MAX_DECK_NAME, on: { keydown: function (e) { if (e.key === 'Enter') addDeck(); } } });
      var addButton = el('button', { type: 'button', class: 'btn btn-primary', text: 'Add deck', on: { click: addDeck } });
      var list = el('ul', { class: 'deck-list' });

      screen.appendChild(el('div', { class: 'deck-controls' }, input, addButton));
      screen.appendChild(list);
      this.els = { input: input, list: list };
    },
    render: function () {
      if (!this.els) return;
      clearChildren(this.els.list);
      var decks = state.data.decks.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
      
      if (decks.length === 0) {
        this.els.list.appendChild(el('div', { class: 'empty-state' },
          el('div', { class: 'empty-icon', text: '📂' }),
          el('h3', { text: 'No decks yet' }),
          el('p', { class: 'muted', text: 'Create your first deck above to start studying.' })
        ));
        return;
      }
      
      var self = this;
      decks.forEach(function (deck) { self.els.list.appendChild(deckRow(deck)); });
    }
  };

  function deckRow(deck) {
    return el('li', { class: 'deck-row' },
      el('button', { type: 'button', class: 'deck-name', text: deck.name, on: { click: function () { openCardsForDeck(deck.id); } } }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'Study', on: { click: function () { openReviewForDeck(deck.id); } } }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'Rename', on: { click: function () { renameDeck(deck.id); } } }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-danger', text: 'Delete', on: { click: function () { deleteDeck(deck.id); } } })
    );
  }

  function findDeck(id) { return state.data.decks.filter(function (d) { return d.id === id; })[0]; }
  function addDeck() {
    if (!deckView.els) return;
    var name = deckView.els.input.value.trim();
    if (!name) return showToast('Deck name cannot be empty.');
    if (state.data.decks.some(function (d) { return d.name.toLowerCase() === name.toLowerCase(); })) return showToast('Deck already exists.');
    
    state.data.decks.push({ id: generateId(), name: name, createdAt: Date.now() });
    persist();
    deckView.els.input.value = '';
    deckView.render();
    showToast('Deck created!');
  }
  function renameDeck(id) {
    var deck = findDeck(id);
    var raw = window.prompt('New name:', deck.name);
    if (raw === null || !raw.trim()) return;
    deck.name = raw.trim();
    persist();
    deckView.render();
  }
  function deleteDeck(id) {
    var deck = findDeck(id);
    if (!window.confirm('Delete "' + deck.name + '" and all its cards?')) return;
    state.data.decks = state.data.decks.filter(function (d) { return d.id !== id; });
    state.data.cards = state.data.cards.filter(function (c) { return c.deckId !== id; });
    if (state.selectedDeckId === id) state.selectedDeckId = null;
    persist();
    deckView.render();
    showToast('Deck deleted.');
  }

  // ---------------------------------------------------------------- Card View
  var cardView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-cards');
      if (!screen) return;

      var back = el('button', { type: 'button', class: 'btn btn-ghost', text: '← Back', on: { click: function () { showScreen('screen-decks'); } } });
      var question = el('textarea', { id: 'card-question', placeholder: 'Question', rows: 2 });
      var answer = el('textarea', { id: 'card-answer', placeholder: 'Answer', rows: 2 });
      var addButton = el('button', { type: 'button', class: 'btn btn-primary', text: 'Add card', on: { click: addCard } });
      var list = el('ul', { class: 'card-list' });

      screen.appendChild(el('div', { class: 'card-controls' }, back, question, answer, addButton));
      screen.appendChild(list);
      this.els = { question: question, answer: answer, list: list };
    },
    render: function () {
      if (!this.els) return;
      clearChildren(this.els.list);
      if (!state.selectedDeckId) return;
      
      var cards = state.data.cards.filter(function (c) { return c.deckId === state.selectedDeckId; });
      if (cards.length === 0) {
        this.els.list.appendChild(el('div', { class: 'empty-state' },
          el('div', { class: 'empty-icon', text: '📝' }),
          el('h3', { text: 'No cards yet' }),
          el('p', { class: 'muted', text: 'Add your first card using the boxes above.' })
        ));
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
        el('p', { class: 'card-q', text: card.question }),
        el('p', { class: 'card-a', text: card.answer })
      ),
      el('div', { class: 'card-actions' },
        el('button', { type: 'button', class: 'btn btn-ghost btn-sort', text: '↑', disabled: isFirst, on: { click: function () { moveCard(card.id, -1); } } }),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sort', text: '↓', disabled: isLast, on: { click: function () { moveCard(card.id, 1); } } }),
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'Edit', on: { click: function () { editCard(card.id); } } }),
        el('button', { type: 'button', class: 'btn btn-ghost btn-danger', text: 'Delete', on: { click: function () { deleteCard(card.id); } } })
      )
    );
  }

  function moveCard(id, direction) {
    var deckCards = state.data.cards.filter(function (c) { return c.deckId === state.selectedDeckId; });
    var index = deckCards.findIndex(function (c) { return c.id === id; });
    var swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= deckCards.length) return;

    var cardA = deckCards[index], cardB = deckCards[swapIndex];
    var masterA = state.data.cards.indexOf(cardA), masterB = state.data.cards.indexOf(cardB);
    state.data.cards[masterA] = cardB; state.data.cards[masterB] = cardA;
    persist();
    cardView.render();
  }

  function openCardsForDeck(id) {
    state.selectedDeckId = id;
    var heading = byId('cards-heading');
    if (heading) heading.textContent = findDeck(id).name;
    cardView.render();
    showScreen('screen-cards');
  }

  function addCard() {
    if (!cardView.els || !state.selectedDeckId) return;
    var q = cardView.els.question.value.trim();
    var a = cardView.els.answer.value.trim();
    if (!q || !a) return showToast('Both question and answer are required.');
    
    state.data.cards.push({ id: generateId(), deckId: state.selectedDeckId, question: q, answer: a, createdAt: Date.now(), dueAt: null, intervalDays: 0, lastRating: null, reps: 0 });
    persist();
    cardView.els.question.value = '';
    cardView.els.answer.value = '';
    cardView.render();
    showToast('Card added!');
  }

  function editCard(id) {
    var card = state.data.cards.filter(function (c) { return c.id === id; })[0];
    var q = window.prompt('Question:', card.question);
    if (q === null) return;
    var a = window.prompt('Answer:', card.answer);
    if (a === null) return;
    if (!q.trim() || !a.trim()) return showToast('Fields cannot be empty.');
    card.question = q.trim(); card.answer = a.trim();
    persist();
    cardView.render();
    showToast('Card updated.');
  }

  function deleteCard(id) {
    if (!window.confirm('Delete this card?')) return;
    state.data.cards = state.data.cards.filter(function (c) { return c.id !== id; });
    persist();
    cardView.render();
    showToast('Card deleted.');
  }

  // ---------------------------------------------------------------- Review View
  var reviewView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-review');
      if (!screen) return;
      var self = this;

      var progressContainer = el('div', { class: 'progress-container' }, el('div', { id: 'review-progress', class: 'progress-bar' }));
      var deckName = el('p', { class: 'muted', style: 'text-align: center; margin-bottom: 20px;' });
      
      var flashcard = el('div', { class: 'flashcard-container' },
        el('div', { class: 'flashcard' },
          el('div', { class: 'flashcard-face flashcard-front' }, el('span', { class: 'flashcard-hint', text: 'QUESTION' }), el('h3', { id: 'review-question', class: 'review-question' })),
          el('div', { class: 'flashcard-face flashcard-back' }, el('span', { class: 'flashcard-hint', text: 'ANSWER' }), el('p', { id: 'review-answer', class: 'review-answer' }))
        )
      );

      var revealButton = el('button', { type: 'button', class: 'btn btn-primary reveal-btn', text: 'Show Answer (Space)', on: { click: function () { self.reveal(); } } });
      var ratingRow = el('div', { class: 'rating-row', hidden: true });
      RATINGS.forEach(function (r) {
        ratingRow.appendChild(el('button', { type: 'button', class: 'btn rating-btn rating-' + r.id, text: r.label, on: { click: function () { rateCard(r.id); } } }));
      });
      
      var empty = el('p', { class: 'muted', hidden: true, style: 'text-align: center; font-size: 18px; margin-top: 40px;' });
      var wrapper = el('div', { class: 'review-wrapper' }, progressContainer, deckName, flashcard, revealButton, ratingRow, empty);
      
      if (IS_LOCAL) wrapper.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', text: 'Dev: Make all due', style: 'margin-top: 40px; font-size: 12px;', on: { click: function () { self.devMakeAllDue(); } } }));
      
      screen.appendChild(wrapper);
      this.els = { progressBar: byId('review-progress'), deckName: deckName, flashcard: flashcard.querySelector('.flashcard'), flashcardContainer: flashcard, question: byId('review-question'), answer: byId('review-answer'), revealButton: revealButton, ratingRow: ratingRow, empty: empty };
    },

    reveal: function () {
      if (!this.els || !state.currentCard) return;
      this.els.flashcard.classList.add('is-flipped');
      this.els.revealButton.hidden = true;
      this.els.ratingRow.hidden = false;
    },

    showEmpty: function (msg) {
      if (!this.els) return;
      state.currentCard = null;
      this.els.flashcardContainer.hidden = true;
      this.els.revealButton.hidden = true;
      this.els.ratingRow.hidden = true;
      this.els.progressBar.parentElement.hidden = true;
      this.els.empty.hidden = false;
      this.els.empty.textContent = msg;
    },

    render: function () {
      if (!this.els) return;
      var deck = state.selectedDeckId ? findDeck(state.selectedDeckId) : null;
      
      if (!deck) {
        this.els.deckName.textContent = '';
        return this.showEmpty('Pick a deck from the home screen first.');
      }

      if (!state.reviewQueue) {
        var t = now();
        state.reviewQueue = state.data.cards.filter(function (c) { return c.deckId === deck.id && isDue(c, t); }).sort(function (a, b) { return (a.dueAt || 0) - (b.dueAt || 0); });
        state.initialReviewCount = state.reviewQueue.length;
      }
      
      var t2 = now();
      var due = state.reviewQueue.filter(function (c) { return isDue(c, t2); });
      
      if (due.length === 0) {
        this.els.deckName.textContent = 'Reviewing: ' + deck.name;
        return this.showEmpty('Nothing due today. Go rest!');
      }
      
      this.els.flashcardContainer.hidden = false;
      this.els.progressBar.parentElement.hidden = false;
      this.els.flashcard.classList.remove('is-flipped');
      
      // Update progress bar
      var percent = ((state.initialReviewCount - due.length) / state.initialReviewCount) * 100;
      this.els.progressBar.style.width = percent + '%';

      this.els.deckName.textContent = 'Reviewing: ' + deck.name + ' (' + due.length + ' left)';
      state.currentCard = due[0];
      this.els.empty.hidden = true;
      this.els.question.textContent = state.currentCard.question;
      this.els.answer.textContent = state.currentCard.answer;
      this.els.revealButton.hidden = false;
      this.els.ratingRow.hidden = true;
      this.els.ratingRow.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
    },

    devMakeAllDue: function () {
      state.data.cards.forEach(function (c) { c.dueAt = now().getTime(); });
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
    
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('.tab-btn[data-target="review"]').classList.add('active');
  }

  function rateCard(rating) {
    var card = state.currentCard;
    if (!card) return;
    reviewView.els.ratingRow.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    reviewView.els.flashcardContainer.classList.add('card-exit');

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
      
      reviewView.els.flashcardContainer.classList.remove('card-exit');
      reviewView.render();
    }, 400); 
  }

  // ---------------------------------------------------------------- Stats View
  var statsView = {
    els: null,
    mount: function () {
      if (this.els) return;
      var screen = byId('screen-stats');
      if (!screen) return;

      var body = el('dl', { class: 'stats-body' });
      var exportBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'Export JSON', on: { click: exportJSON } });
      var importInput = el('input', { type: 'file', accept: '.json', hidden: true });
      importInput.addEventListener('change', function () { if (this.files[0]) importJSON(this.files[0]); this.value = ''; });
      var importLabel = el('label', { class: 'btn btn-ghost', style: 'margin-left: 8px;' }, 'Import JSON', importInput);

      var wrap = el('div', { class: 'stats-wrap' }, body, el('div', {}, exportBtn, importLabel));
      
      if (IS_LOCAL) {
        wrap.appendChild(el('button', { type: 'button', class: 'btn btn-ghost btn-danger', text: 'Reset all data', style: 'margin-top: 20px;', on: { click: resetAll } }));
      }
      screen.appendChild(wrap);
      this.els = { body: body };
    },
    render: function () {
      if (!this.els) return;
      var t = now();
      var due = state.data.cards.filter(function (c) { return isDue(c, t); }).length;
      var reviewedToday = (state.data.reviewsByDay || {})[dayKey(t)] || 0;
      var streak = computeStreak(t);
      
      clearChildren(this.els.body);
      this.els.body.appendChild(el('dt', { text: 'Cards due today' }));
      this.els.body.appendChild(el('dd', { text: String(due) }));
      this.els.body.appendChild(el('dt', { text: 'Cards reviewed today' }));
      this.els.body.appendChild(el('dd', { text: String(reviewedToday) }));
      this.els.body.appendChild(el('dt', { text: 'Streak' }));
      
      var label = reviewedToday > 0 ? streak + '-day streak' : (streak > 0 ? streak + '-day streak (review to keep it)' : '0-day streak');
      this.els.body.appendChild(el('dd', { text: label }));
    }
  };

  function resetAll() {
    if (!window.confirm('Delete all data?')) return;
    state.data = emptyState();
    persist();
    state.selectedDeckId = null;
    deckView.render();
    showScreen('screen-decks');
    showToast('Data cleared.');
  }

  function computeStreak(t) {
    var reviews = state.data.reviewsByDay || {};
    var today = dayKey(t);
    var cursor = reviews[today] > 0 ? today : (reviews[previousDayKey(today)] > 0 ? previousDayKey(today) : null);
    if (!cursor) return 0;
    var count = 0;
    while (reviews[cursor] > 0) { count++; cursor = previousDayKey(cursor); }
    return count;
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'revisionLoop-backup.json' });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || parsed.version !== 1) return showToast('Invalid file.');
        if (window.confirm('Replace all current data?')) {
          state.data = parsed;
          if (!state.data.reviewsByDay) state.data.reviewsByDay = {};
          persist();
          state.selectedDeckId = null;
          deckView.render();
          showScreen('screen-decks');
          showToast('Import successful!');
        }
      } catch (e) { showToast('Error reading file.'); }
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------- Startup
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp);
  else initializeApp();
})();
