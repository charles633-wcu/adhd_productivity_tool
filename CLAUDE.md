## Memory Location

All persistent memory (project context, feedback, lessons learned, etc.) must be stored in the `context/` folder at the project root. This allows Cursor and other tools to share the same memory.

- Primary: `context/` — canonical, human-readable, Cursor-visible, gitignored
- Secondary: `~/.claude/projects/C--Users-czw53-Downloads-projects-interhship-tracker/memory/` — Claude Code's auto-memory location

Write to **both** on every save. Keep `context/MEMORY.md` and the auto-memory `MEMORY.md` in sync as indexes.

### Feedback files (`feedback_*.md`)
Write a feedback file any time:
- The user corrects an approach ("don't do X", "stop doing Y")
- A non-obvious approach is confirmed to work
- A project-specific pattern would trip up a competent dev unfamiliar with this codebase

Do not write feedback for standard Next.js/React/TypeScript conventions — only things specific to this project or these preferences.

### lessons_learned.md
This project will likely be asked about by recruiters or curious developers. On each memory save and task finish, write into `lessons_learned.md`: the task, problems hit, solutions, and likely interview questions that will be asked about this project.


-Trigger: If a task involves repetitive boilerplate, simple data mapping, unit test expansion, or high-volume coding that is architecturally "low-risk."

---------------------------------------
## Codex collaboration

Action: If encountered with low risk tasks, do not implement directly. Instead, pause and ask: "This task looks like high-volume 'grunt work.' Should I generate a stateless prompt-script for a Codex sub-agent?"

Output Format: If I say yes, provide a standalone Markdown block containing:

Context: Minimal necessary types and interfaces.

Task: Step-by-step implementation instructions.

Goal: The specific "Green" state the code must reach.

## Saving to memory
- When I tell you to "save to memory", go through this checlist
1. Update lessons_learned.md
2. Update project_state.md
3. Reference decision.md and create a decision file matching the example in decision.md inside the decision folder (context\docs\superpowers\decision_logs)

### Note on memory
- Memory is important, for keeping both of us on track, always ask me if you believe there are any lines in each of the files you belive should be overwritten, await my permission.
- Save all other files not otherwise specified here in accordance to obra/superpowers guidelines.

## comments
- Always remember to add comments for each block of code, and at the top of classes to explain what the code does

## More context
- Within context folder, update the tree of the project (relevant code only) and a brief summary what each class, schema, or anything else does