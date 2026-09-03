# ADR-001: Clean-room implementation and Apache-2.0 code license

**Status:** Accepted
**Date:** 2026-09-03
**Deciders:** Ted Kwartler

## Context

TKCom takes structural inspiration from OpenXcom, which is licensed under
GPLv3 and requires original X-COM resources for normal use. Two implementation
paths were considered (IMPLEMENTATION_PLAN.md Section 4):

- **Path A, clean-room:** original TypeScript written from behavior and public
  documentation, using OpenXcom only as a reference.
- **Path B, GPL derivative:** port or translate OpenXcom C++ directly, binding
  the whole project to GPLv3.

A separate but linked question was the license for TKCom's own code.

## Decision

1. **Implementation: Path A, clean-room.** All TKCom code is original. OpenXcom
   is a behavioral and architectural reference only. No OpenXcom source is
   copied or mechanically translated. A reference policy is kept under
   `docs/source-notes/`.

2. **Engine code license: Apache-2.0.** The `LICENSE` file is the verbatim
   Apache License 2.0. Copyright is held by Ted Kwartler. The `NOTICE` file
   records attribution and scope.

3. **Content and assets are separate.** Apache-2.0 covers source code only.
   Original art, audio, story, text, and other creative content are All Rights
   Reserved unless a specific asset carries its own license. Per-asset records
   live under `assets-src/licenses/`.

4. **No original X-COM data, ever.** Independent of the code license, the
   project must never include or distribute original X-COM art, text, story,
   maps, audio, or data.

## Consequences

- The project keeps full flexibility for a future closed or commercial release,
  because Apache-2.0 is permissive and no GPLv3 obligations are inherited.
- Anyone may reuse the engine source under Apache-2.0; this does not grant any
  right to the game's reserved content or to the TKCom name and branding.
- Contributors must follow the clean-room reference policy. Code suspected of
  being derived from GPL source must not be merged.
- Stage 0 already complies: the skeleton was scrubbed of OpenXcom-port framing
  and contains no ported code.

## Alternatives considered

- **MIT:** simpler but lacks the explicit patent grant Apache-2.0 provides.
- **Proprietary / all rights reserved:** maximum control but blocks reuse and
  outside contribution; not chosen because an open engine with reserved content
  gives most of the control with more goodwill.
- **GPLv3 (Path B):** rejected; it would prevent a future closed or commercial
  version and require rewriting Stage 0 against ported code.
