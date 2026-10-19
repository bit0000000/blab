# Revision Loop

Revision Loop is a responsive, static prototype for a flashcard and spaced
repetition app. It demonstrates the look and feel of a learning dashboard
without requiring an account, backend, or build step.

## Prototype screens

- **Decks:** an overview of sample learning decks, daily goals, streaks, and
  cards ready to review.
- **Cards:** sample French vocabulary from the French foundations deck.
- **Review:** a sample study card, answer, and rating options.
- **Stats:** example study activity, review totals, and card mastery.

Use the navigation to switch screens and select a deck to view its cards.
Buttons and study controls are for presentation only: the prototype does not
create or edit decks, record reviews, or save progress. All displayed names,
cards, and statistics are sample content.

## Run locally

You only need Python 3. From the project directory, start a local web server:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser. Stop the
server with `Ctrl+C`.

In VS Code or GitHub Codespaces, open or forward port `8000` if prompted.

## Project files

- `index.html` — page structure and prototype content.
- `styles.css` — layout, responsive styles, and the color theme.
- `js/` — placeholder files reserved for future app behavior; they are not
  needed to view the current prototype.
