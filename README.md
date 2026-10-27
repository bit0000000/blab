## Vibe coding ##
I built this by vibe coding — describing what I wanted to an AI, letting it write the code, then testing and correcting it. That's how the app exists at all; I couldn't have built it from scratch in the time I had.

But I learned quickly that vibe coding only works if you're specific. My first prompts were vague ("make a flashcard app") and the results were bloated and messy. What actually worked was treating each prompt like a small specification: one change at a time, naming exactly which files were allowed to change, saying what to leave alone, and asking for a plan before any code got written.

The habit that helped most was splitting the work into phases and using a strict 5-file structure. Each phase did one thing (e.g., just the design, or just the math). When something broke, I could tell exactly which change caused it, because only one file had been touched. When I skipped that discipline — asking for too much at once — I spent more time fixing the mess than I saved.

I also learned that the AI doesn't know what I mean, only what I say. Half my bugs were my fault, not its: I hadn't said what should happen when a field was empty, or how the app should handle timezones at midnight. Writing the answer down first became faster than debugging later.

The honest summary: vibe coding got me a working app, but the app is only as good as the thinking I did before each prompt. The tool writes the code; you still have to know what you want.

