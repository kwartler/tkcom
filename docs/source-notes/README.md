# Source notes and clean-room reference policy

TKCom is a clean-room original implementation (ADR-001). OpenXcom and other
prior art may be studied as a **behavioral and architectural reference**, but
their code must never be copied or mechanically translated into this project.

## The rule

- You may read OpenXcom source, public documentation, wikis, and community
  notes to understand **what a system does** and **why**.
- You must write original TypeScript that expresses that behavior in TKCom's own
  design. Do not paste, transliterate line-by-line, or port functions.
- You must not copy data tables, strings, maps, art, audio, or other resources.
- Never include original X-COM data or assets in this repository or any build.

## What to record here

When a TKCom system was informed by studying prior art, add a short note in a
file named for the system (for example `battle-visibility.md`). Record:

- The TKCom package and module the note applies to.
- What behavior was referenced, described in your own words.
- The public source consulted (repository path, wiki page, or document), for
  traceability. Link to it; do not paste its code.
- Confirmation that the TKCom implementation and its tests are original.

## What NOT to put here

- No copied source code, in any language.
- No copied data tables or asset files.
- No original X-COM resources of any kind.

These notes exist so the clean-room boundary is auditable. If a note cannot be
written without pasting someone else's code, the implementation is not
clean-room and must be rewritten.
