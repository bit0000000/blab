# Revision Loop

A personal flashcard app with spaced repetition, built to be used for one real course
rather than to look impressive.

Student-Initiated Learning project. Vanilla HTML, CSS and JavaScript — no frameworks,
no build step, no backend, no login.

## Why

Rereading notes feels productive but is one of the least effective ways to revise.
Retrieval practice and spaced repetition work better, but most flashcard apps are
either bloated or gated behind an account. Revision Loop is a small, local tool that
does one thing: it shows you what's due today.

The app is also the vehicle for a second goal — learning to specify software precisely
enough that an AI can build it correctly. The build was driven by written phases, one
change per prompt, each naming the only files permitted to change.

## Running it

No install, no dependencies.

**Option A — open the file**
Double-click `index.html`.

**Option B — local server (recommended)**
Some browsers restrict `localStorage` on `file://`. If your decks disappear on refresh,
run a local server instead:

```bash
python -m http.server 8000