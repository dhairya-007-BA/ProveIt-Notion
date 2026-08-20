<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ProveIt Workspace — Agent Instructions

This repository contains ProveIt Workspace, the internal operating system for
ProveIt Hiring Inc.

These instructions apply to every coding agent working in this repository.

The objective is not merely to make individual tickets pass.

The objective is to maintain and improve a coherent, secure, fast, polished,
production-quality product.

---

# 1. Read Before Coding

Before making changes:

1. Read this `AGENTS.md`.
2. Read `PROVEIT_MASTER_PLAN.md`.
3. Inspect the current repository.
4. Inspect relevant existing implementations before creating new ones.
5. Read the relevant Next.js documentation from `node_modules/next/dist/docs/`
   before using Next.js APIs or conventions.
6. Check existing tests related to the area being modified.
7. Check the current git status and do not overwrite unrelated work.

Do not assume the repository matches an earlier handoff document.

The CURRENT REPOSITORY is the source of truth for implementation state.

Historical documentation explains intent and architecture, but the current code
wins when implementation has evolved.

---

# 2. Product Mission

ProveIt Workspace should become the primary internal operating system for
ProveIt Hiring Inc.

It combines:

- company knowledge
- tasks
- projects
- meetings
- documents
- structured databases
- employees
- collaboration
- notifications
- administration
- integrations
- Kaneo
- automation
- AI-assisted workflows

Every implementation decision should contribute to one coherent product.

Do not build isolated mini-applications inside the repository.

---

# 3. Preserve Working Functionality

Do not rewrite working systems merely because another implementation seems
cleaner.

Before modifying an existing feature:

- understand how it works
- understand its authorization model
- inspect its data model
- inspect callers
- inspect tests
- inspect related UI
- determine whether other modules depend on it

Prefer incremental improvements over unnecessary rewrites.

Do not remove working functionality unless explicitly required.

---

# 4. No Placeholder Implementations

Do not leave:

- TODO-only features
- fake buttons
- dead controls
- placeholder forms
- mocked production data
- hardcoded success states
- nonfunctional menu items
- fake integrations
- UI that appears functional but performs no action

If something cannot be implemented safely, document the limitation instead of
pretending it works.

---

# 5. ProveIt Design System

All user-facing AND administrative UI must follow one design system.

Design direction:

mostly neutral interface
+
intentional ProveIt brand color
+
semantic colors

Do not create a rainbow interface.

Use the existing ProveIt:

- logo
- typography
- brand colors
- spacing language
- visual identity

Prefer shared design tokens and components.

Do not scatter arbitrary:

- hex colors
- border radii
- shadows
- spacing
- typography values

through feature components.

Reuse existing components before creating duplicates.

If several implementations of the same primitive exist, consolidate them when
safe.

---

# 6. UI Quality Standard

Every production screen should account for:

- loading
- empty
- error
- success
- disabled
- hover
- focus
- permission-denied
- responsive behavior

Interactive operations should provide immediate visual feedback.

Avoid interfaces that feel like internal engineering tools.

This includes Admin.

Admin UI must receive the same product-quality treatment as the primary
application.

---

# 7. UX Consistency

Similar actions should behave similarly throughout ProveIt.

Examples:

- side peeks
- dialogs
- dropdowns
- buttons
- forms
- comments
- @mentions
- notifications
- tables
- filters
- sorting
- destructive confirmations
- page headers

Do not implement a separate interaction model for each module.

---

# 8. Performance

Performance is a product requirement.

Do NOT fix slow operations with blind page reloads or polling unless the
architecture genuinely requires it.

Prefer:

- optimistic updates
- Firestore realtime listeners where appropriate
- selective revalidation
- local state updates
- efficient server queries
- parallel independent reads
- shared/cached data where safe

Investigate:

- duplicate listeners
- duplicate requests
- N+1 reads
- sequential independent reads
- unnecessary Firebase Admin calls
- unnecessary rerenders
- oversized payloads
- stale subscriptions
- unnecessary client components
- expensive route transitions

Never introduce an interval-based page refresh simply to hide stale state.

---

# 9. Firebase Security

Security must never be weakened to make a feature work.

Preserve:

- Firebase Authentication
- server-side authorization
- revoked-token checking where used
- workspace authorization
- BOD/admin restrictions
- Firestore Rules
- emulator testing

Do not trust client-provided authorization claims.

Do not expose privileged Firebase Admin functionality to the client.

Do not weaken Firestore Rules as a shortcut.

---

# 10. Secrets

Never expose secrets.

This includes:

- Firebase service-account credentials
- Kaneo API tokens
- Resend API keys
- MCP credentials
- integration secrets
- private webhook secrets

Secrets must remain server-side.

Never create client-visible environment variables for private credentials.

For example:

GOOD:

RESEND_API_KEY

BAD:

NEXT_PUBLIC_RESEND_API_KEY

Never render secrets back into admin pages.

---

# 11. Workspace Authorization

Every workspace-scoped feature must respect workspace access.

This applies to:

- tasks
- meetings
- documents
- databases
- rows
- comments
- search
- notifications
- activity
- integrations

Global Search must NEVER leak entities from unauthorized workspaces.

Do not rely solely on hiding UI.

Authorization must be enforced at the appropriate server/database boundary.

---

# 12. Shared Collaboration Architecture

Do not create separate incompatible comment systems.

Tasks, meetings, documents, and database rows should use the shared
collaboration architecture wherever possible.

Comments should support:

- replies
- editing
- deletion
- @mentions
- structured mention IDs
- notifications

Do not identify mentioned users only by display-name parsing.

Store stable user IDs.

Prevent:

- self-notification where inappropriate
- duplicate notifications
- duplicate mention delivery

---

# 13. Notifications

In-app notifications are the canonical notification record.

Email and future channels are delivery mechanisms.

Prefer:

Application Event
→ Notification Service
→ User Preferences
→ Idempotency
→ Delivery Channel

Do not scatter notification creation logic throughout random React components.

---

# 14. Resend

Resend is the transactional email provider.

All Resend operations must run server-side.

Email delivery should respect user preferences.

Email operations should be idempotent where duplicate delivery would be
harmful.

Do not make UI components directly responsible for transactional email.

---

# 15. Meetings and AI

Meeting intelligence architecture:

Audio
→ Whisper / whisper.cpp
→ raw transcript
→ Ollama
→ structured intelligence

Whisper handles transcription.

Ollama handles reasoning and extraction such as:

- summary
- decisions
- action items
- risks
- follow-ups

Never silently overwrite raw transcripts.

Never silently overwrite manually edited meeting notes.

Maintain a distinction between:

- raw transcript
- AI-generated notes
- human notes

AI-generated execution actions should normally be reviewable before mutation.

---

# 16. Kaneo

Kaneo is a strategic execution integration.

Historical documentation describes the original isolated Kaneo POC.

The current repository has evolved beyond that POC.

Treat the CURRENT REPOSITORY as the source of truth.

Do NOT recreate the old isolated POC architecture if integrated Kaneo
functionality already exists.

Do NOT remove current Kaneo integration merely because an older handoff says
not to modify ProveIt Workspace.

Inspect existing Kaneo:

- routes
- services
- reconciliation
- mappings
- admin UI
- task synchronization
- tests

before making changes.

---

# 17. Kaneo Source-of-Truth Rules

Avoid creating two uncontrolled task universes.

Any ProveIt ↔ Kaneo synchronization must define:

- canonical owner/source of truth
- external ID
- synchronization state
- last synchronization
- conflict handling
- retry behavior
- failure state

Never implement naive infinite two-way synchronization.

Writes must be idempotent where practical.

Do not duplicate Kaneo objects when an existing mapping can be reconciled.

---

# 18. Kaneo MCP

MCP has already been proven to work in the historical POC.

Do not spend time reproving basic connectivity unless:

- the integration is failing
- configuration changed
- a regression is suspected
- the requested feature depends on verification

Use MCP deliberately.

Bulk or consequential AI operations should generally follow:

AI proposal
→ preview
→ human approval
→ mutation

Do not create unrestricted autonomous bulk mutation without safeguards.

---

# 19. Database Architecture

Preserve the existing database architecture unless a migration is justified.

Important capabilities include:

- property definitions
- typed values
- inline editing
- side peek
- canonical row page
- filters
- sorting
- search
- comments

When implementing Saved Views, preserve view state such as:

- filters
- sorts
- visible properties
- property order
- view type
- grouping where supported

Do not confuse database schema with individual view configuration.

---

# 20. Destructive Actions

Destructive operations require deliberate UX.

Examples:

- deleting employees
- deactivating users
- deleting tasks
- deleting meetings
- deleting databases
- deleting documents
- removing integrations
- destructive migrations
- bulk Kaneo operations

Use clear confirmation.

Explain consequences when meaningful.

Do not use misleading button labels.

---

# 21. Data Migrations

Never silently perform destructive data migrations.

Migration tooling should favor:

preview
→ validate
→ dry run
→ execute
→ report

Migrations should be:

- repeatable where possible
- observable
- failure-aware
- documented

Do not assume every production record follows the newest schema.

---

# 22. Search

Universal Search should use canonical entity URLs.

Search should eventually cover:

- tasks
- meetings
- documents
- databases
- rows
- people
- actions

Search must enforce authorization.

Keyboard behavior should remain consistent between sidebar Search and command
palette Search.

---

# 23. Accessibility

Do not regress accessibility.

Interactive UI must support:

- keyboard navigation
- visible focus
- accessible names
- form labels
- semantic buttons
- dialog focus management
- Escape behavior
- sufficient contrast

Critical functionality must not be mouse-only.

---

# 24. Responsive Design

Do not design exclusively for one developer viewport.

Verify important workflows around:

- 1440px
- 1280px
- 1024px
- tablet widths
- reasonable mobile widths where applicable

Tables, side peeks, admin screens, dialogs, and navigation require responsive
behavior.

---

# 25. TypeScript

Do not solve TypeScript errors with broad unsafe casts.

Avoid:

any

unless there is a strong documented reason.

Prefer:

- explicit interfaces
- discriminated unions
- typed API boundaries
- schema validation where external input enters the system

Do not suppress errors merely to make CI green.

---

# 26. API Design

API routes should:

- authenticate
- authorize
- validate
- perform the operation
- return predictable structured errors

Do not leak internal exceptions or secrets.

Prefer shared helpers for repeated authentication/authorization logic.

---

# 27. Error Handling

Do not silently swallow errors.

User-facing failures should provide useful feedback.

Server-side failures should be diagnosable without exposing sensitive
information.

Integration failures should record enough context for reconciliation.

---

# 28. Testing

Tests are part of the implementation.

Add or update tests when behavior changes.

Prioritize tests for:

- authorization
- Firestore Rules
- synchronization
- notifications
- mentions
- migrations
- critical task operations
- admin operations
- integration boundaries

Do not delete a valid test merely because the implementation fails it.

---

# 29. Required Quality Gates

Before considering significant work complete, run applicable checks:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:rules
npm run build
```

Also run relevant:

- integration tests
- E2E tests
- Firestore emulator tests
- visual/manual QA

If a command cannot run because of the environment, report that explicitly.

Do not claim it passed.

---

# 30. Next.js Rules

This repository may use a Next.js version newer or different from the version
represented in model training.

DO NOT rely on remembered Next.js behavior when repository documentation is
available.

Before changing Next.js-specific behavior:

1. locate the installed `next` package
2. inspect relevant documentation under:

   node_modules/next/dist/docs/

3. check deprecation notices
4. follow the repository's installed version

This applies especially to:

- routing
- middleware/proxy behavior
- caching
- server/client boundaries
- Server Actions
- Route Handlers
- cookies
- headers
- dynamic APIs
- metadata
- image handling
- configuration

The generated Next.js agent block at the top of this file must remain intact.

---

# 31. Git Safety

Assume multiple agents or humans may be working in the repository.

Before editing:

```bash
git status
```

Do not:

- discard unrelated changes
- reset other people's work
- overwrite files without inspection
- perform broad formatting across unrelated files
- force-push
- rewrite history unless explicitly instructed

Keep changes scoped.

If unexpected concurrent modifications appear, inspect before proceeding.

---

# 32. Multi-Agent Work

When multiple agents work simultaneously, divide work by clear ownership.

Good boundaries include:

- design system
- tasks
- databases
- meetings
- notifications
- admin
- Kaneo
- performance
- testing

Avoid assigning several agents to heavily modify the same core files
simultaneously.

Shared architecture changes should happen before dependent parallel work.

Integration must include a final cross-feature review.

---

# 33. Product-Wide Changes

When modifying shared systems such as:

- design tokens
- navigation
- auth
- comments
- notifications
- side peek
- search
- database property definitions

search the repository for all consumers first.

A local fix must not create product-wide regressions.

---

# 34. Documentation

Update documentation when architecture or important behavior changes.

Do not leave documentation knowingly describing architecture that no longer
exists.

For major decisions, document:

- what changed
- why
- source of truth
- important constraints
- migration implications

Keep `PROVEIT_MASTER_PLAN.md` aligned with major product changes.

---

# 35. Definition of Done

A feature is not done merely because the happy path works.

Before completion verify:

- functionality
- authorization
- loading state
- empty state
- error state
- responsive behavior
- accessibility
- consistency
- tests
- TypeScript
- lint
- production build where applicable

For integrations additionally verify:

- failure behavior
- retries/idempotency
- reconciliation
- secret handling

---

# 36. Final Principle

Do not optimize for:

"the ticket technically works."

Optimize for:

"this belongs in a polished ProveIt product."

Every change should leave the repository more:

- coherent
- secure
- maintainable
- performant
- accessible
- predictable
- polished

than it was before.