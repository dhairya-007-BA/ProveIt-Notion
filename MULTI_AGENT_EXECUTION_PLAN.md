# ProveIt Workspace — Multi-Agent Execution Plan

## Purpose

This document defines how a coordinated multi-agent Codex run should improve
ProveIt Workspace.

This is an execution document.

It does not replace:

- AGENTS.md
- PROVEIT_MASTER_PLAN.md

All agents must read and obey AGENTS.md.

All agents must understand the target product described in
PROVEIT_MASTER_PLAN.md.

The current repository is the implementation source of truth.

---

# 1. Primary Objective

Transform the current ProveIt Workspace repository into a polished,
production-quality internal operating system for ProveIt Hiring Inc.

The objective is NOT:

"implement as many features as possible."

The objective is:

"make the existing system coherent, reliable, fast, secure and polished,
then safely complete the highest-value missing functionality."

Quality takes priority over feature count.

---

# 2. Do Not Start Coding Immediately

The orchestrating agent must begin with discovery.

Before assigning implementation work:

1. read AGENTS.md
2. read PROVEIT_MASTER_PLAN.md
3. read this file
4. inspect package.json
5. inspect Next.js configuration
6. inspect Firebase configuration
7. inspect Firestore Rules
8. inspect tests
9. inspect CI
10. inspect repository structure
11. inspect existing shared components
12. inspect API routes
13. inspect Kaneo integration
14. inspect comments/mentions/notifications
15. inspect current admin functionality
16. inspect current performance architecture
17. run git status
18. run the existing quality gates

Do not infer repository state solely from planning documents.

---

# 3. Establish Baseline

Before implementation, establish the current baseline.

Run applicable commands:

```bash
git status
npm ci
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:rules
npm run build
```

If additional test scripts exist, inspect package.json and run relevant ones.

Record existing failures separately from failures introduced by new work.

Do not hide baseline failures.

---

# 4. Repository Architecture Map

Before parallel work begins, create an internal architecture map.

Identify:

- app routes
- API routes
- server-only modules
- client Firebase modules
- Firebase Admin modules
- authentication helpers
- authorization helpers
- Firestore collections
- shared UI components
- task components
- meeting components
- document components
- database components
- comment components
- notification components
- search components
- admin components
- Kaneo components
- integration services
- test architecture

Identify high-contention shared files.

Agents should avoid modifying the same high-contention files simultaneously.

---

# 5. Firestore Data Map

Inspect actual usage and document the important collections.

Likely areas include:

- users
- tasks
- meetings
- documents
- databases
- database rows
- comments
- notifications
- activity
- workspace configuration
- custom fields
- integration mappings

Do not assume collection names.

Inspect the repository.

For each important collection determine:

- ownership
- workspace scoping
- important fields
- authorization assumptions
- indexes
- realtime listeners
- server reads
- write paths

This map should guide later performance and security work.

---

# 6. Execution Phases

Work should occur in phases.

Do not launch every feature agent simultaneously.

Recommended sequence:

PHASE 0
Discovery and baseline

PHASE 1
Shared architecture stabilization

PHASE 2
Core product feature work

PHASE 3
Integrations and advanced functionality

PHASE 4
Admin and design-system completion

PHASE 5
Performance and security audit

PHASE 6
Cross-feature integration

PHASE 7
Testing and production readiness

---

# 7. Phase 0 — Discovery Agent

Assign one agent as Repository Auditor.

Responsibilities:

- understand current architecture
- identify existing functionality
- identify incomplete functionality
- identify duplicated implementations
- identify security-sensitive code
- identify performance hotspots
- identify failing tests
- identify stale documentation
- identify high-contention files

The auditor should NOT perform broad rewrites.

Deliver a concise implementation map for the orchestrator.

---

# 8. Phase 1 — Shared Architecture

Before feature agents work independently, stabilize shared systems.

Priority shared systems:

- design tokens
- common UI primitives
- authorization helpers
- collaboration/comments
- mentions
- notifications
- side peek patterns
- API error conventions
- integration conventions

Changes to these systems can affect many modules.

Handle them before dependent feature work when practical.

---

# 9. Agent: Design System & UX Foundation

Mission:

Create a coherent ProveIt design system without unnecessarily rewriting the
application.

Inspect existing:

- global CSS
- design tokens
- buttons
- inputs
- cards
- badges
- dialogs
- side peeks
- tables
- typography
- navigation

Responsibilities:

- consolidate reusable tokens
- preserve ProveIt branding
- improve visual consistency
- improve focus states
- improve loading states
- improve error states
- improve empty states
- improve responsive behavior

Do not redesign every feature independently.

Do not create a rainbow UI.

Design direction:

neutral interface
+
ProveIt brand colors
+
semantic colors

---

# 10. Agent: Collaboration, Mentions & Notifications

This is a high-priority agent.

The current comments experience must support reliable collaboration.

Inspect the entire shared comments architecture before editing.

Responsibilities:

- shared comment behavior
- task comments
- meeting comments
- document comments
- database-row comments
- replies
- editing
- deletion
- multiple @mentions
- mention picker
- workspace member filtering
- keyboard navigation
- stable mentioned-user IDs
- mention rendering
- notifications
- reply notifications
- deduplication
- self-notification prevention

Example required behavior:

A user types:

@Nirvaan please review with @Sanchit

The UI should allow selecting both people.

The stored comment should preserve enough structured information to identify
both users reliably.

Both mentioned users should receive the correct notification exactly once,
subject to notification rules.

Do not implement mentions purely by regex matching display names after posting.

---

# 11. Agent: Tasks

Mission:

Make Tasks a polished execution system.

Preserve existing functionality.

Audit:

- board
- list
- task detail
- side peek
- full page
- task API routes
- assignment
- status
- priority
- due dates
- custom fields
- comments
- Kaneo relationships

Improve:

- responsiveness
- loading
- optimistic interactions
- filters
- sorting
- search
- drag/drop reliability
- task detail consistency
- task metadata UX

Do not independently rebuild shared comments or notification systems.

Consume shared architecture.

---

# 12. Agent: Databases

Mission:

Make ProveIt Databases significantly more useful while preserving existing
typed data behavior.

Audit existing:

- schema
- properties
- rows
- inline editing
- side peek
- filters
- sorts
- search
- custom fields
- saved-view routes if present

Highest-priority functionality:

1. Saved Views
2. Property Visibility
3. Property Ordering
4. custom Select colors
5. custom Status colors

Then evaluate:

- Status
- Multi-select
- Person
- Relation

Do not rush Formula/Rollup before foundations are reliable.

Saved Views should preserve:

- view name
- filters
- sorts
- visible properties
- property order
- view type
- grouping where supported

---

# 13. Agent: Meetings

Mission:

Polish the current meeting system and prepare it for future AI workflows.

Audit:

- meeting list
- creation
- editing
- side peek
- full page
- participants
- comments
- notifications
- agenda
- notes
- transcript fields

Improve existing functionality first.

Prepare clean boundaries for:

Audio
→ Whisper
→ transcript
→ Ollama
→ structured intelligence

Do not introduce AI behavior that silently modifies human content.

---

# 14. Agent: Documents

Mission:

Improve ProveIt Documents into a reliable internal knowledge system.

Audit:

- editor
- autosave
- document routing
- comments
- mentions
- search
- side peek/full-page behavior if applicable

Improve:

- editor reliability
- loading
- autosave feedback
- empty states
- document navigation
- search integration

Do not replace the editor with a large new framework without architectural
justification.

---

# 15. Agent: Universal Search

Mission:

Make Search reliable and useful across ProveIt.

Audit current:

- sidebar search
- command palette
- keyboard navigation
- authorization filtering
- entity URLs

Search should cover supported:

- tasks
- meetings
- documents
- databases
- rows

Then evaluate:

- people
- recent items
- quick actions

Critical rule:

Never expose unauthorized workspace results.

---

# 16. Agent: Admin & Employee Experience

Mission:

Make Administration feel like part of the product.

Audit:

- Employees
- employee detail
- permissions
- workspace access
- password operations
- activation/deactivation
- removal
- Workspace Settings
- Custom Fields
- Notion Migration

Improve:

- hierarchy
- loading
- errors
- confirmations
- status badges
- permission explanations
- responsive layouts
- tables
- forms

Do not expose unnecessary implementation IDs.

Do not weaken authorization.

---

# 17. Agent: Inbox & Notification Preferences

Mission:

Finish the user-facing notification experience.

Audit:

- notification schema
- notification creation
- Inbox
- unread counts
- navigation
- realtime behavior

Implement or improve:

- unread
- all
- archive
- mark read
- mark unread
- bulk actions where appropriate
- unread indicators

Then implement notification preferences before broad email delivery.

Preference categories may include:

IN-APP

- mentions
- replies
- assignments
- reminders

EMAIL

- mentions
- replies
- assignments
- task reminders
- meeting invitations
- meeting reminders

---

# 18. Agent: Resend

This agent should begin after notification preferences and event architecture
are understood.

Mission:

Implement reliable transactional email delivery.

Use server-side:

RESEND_API_KEY

Never expose it to the browser.

Potential flows:

- employee invitation
- account communication
- mentions
- replies
- task assignments
- task reminders
- meeting invitations
- meeting reminders

Architecture:

Application Event
→ Notification Service
→ Preferences
→ Idempotency
→ Resend

Email is not the canonical notification store.

---

# 19. Agent: Kaneo Integration

Mission:

Turn the existing Kaneo work into a production-quality integration.

IMPORTANT:

Historical documents describe an earlier isolated Kaneo POC.

The current repository has since evolved.

Inspect CURRENT Kaneo implementation first.

Do not recreate the historical POC unnecessarily.

Audit existing:

- API routes
- health checks
- projects
- columns
- tasks
- reconciliation
- controlled test pages
- synchronization metadata
- authentication
- MCP-related documentation/configuration

Determine the current source-of-truth model.

Document:

- which system owns tasks
- external ID mapping
- synchronization direction
- conflict behavior
- retry behavior
- failure behavior

Avoid naive infinite two-way sync.

Improve the Integrations → Kaneo experience.

Potential admin information:

- connection health
- mapped projects
- synchronization health
- failed syncs
- last synchronization
- reconciliation actions

Never expose Kaneo credentials.

---

# 20. Agent: Performance

This agent should audit rather than blindly optimize.

Mission:

Find and fix actual causes of slowness.

Investigate:

- duplicate Firestore listeners
- duplicate fetches
- N+1 reads
- sequential independent API reads
- repeated authentication verification
- repeated Firebase Admin initialization patterns
- unnecessary server rendering
- unnecessary client components
- expensive rerenders
- large payloads
- missing indexes
- unnecessary router refreshes
- unnecessary page reloads

Do NOT solve performance using periodic full-page auto reload.

Prefer realtime updates or targeted refresh.

Measure before and after where possible.

---

# 21. Agent: Security

Mission:

Perform a focused security review after major feature changes.

Inspect:

- Firestore Rules
- API authorization
- workspace isolation
- admin restrictions
- BOD restrictions
- Firebase Admin usage
- secret handling
- Kaneo credentials
- Resend credentials
- user-controlled inputs
- migration routes

Verify unauthorized users cannot access data merely by knowing an ID.

Do not weaken rules to resolve functional bugs.

---

# 22. Agent: Testing & QA

This agent should work after major integrations are assembled.

Responsibilities:

- run full quality gates
- inspect failures
- add missing critical tests
- test cross-feature workflows
- test authorization
- test comments
- test mentions
- test notifications
- test database views
- test Kaneo synchronization
- test admin operations
- test responsive behavior

Required commands where applicable:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:rules
npm run build
```

Inspect package.json for additional tests.

---

# 23. Integration Rules

Agents must not simply finish their own branch of work and declare success.

The orchestrator must verify cross-feature interactions.

Examples:

Task
→ comment
→ mention
→ notification
→ Inbox
→ direct task navigation

Meeting
→ comment
→ reply
→ notification
→ direct meeting navigation

Database
→ Saved View
→ filters
→ hidden properties
→ reload
→ state preserved

Task
→ Kaneo sync
→ reconciliation
→ status reflected correctly

Admin
→ employee permission change
→ authorization actually changes

---

# 24. High-Contention Files

The orchestrator should identify files frequently used by multiple systems.

Examples may include:

- global CSS
- layout
- navigation
- auth provider
- Firebase configuration
- Firebase Admin
- shared comments
- notification services
- shared types

Do not assign simultaneous uncontrolled edits to these files.

One agent should own shared architecture changes at a time.

---

# 25. No Blind Rewrites

Agents should not decide:

"This file is messy, so I will replace the entire subsystem."

Large rewrites require architectural justification.

Prefer:

understand
→ isolate problem
→ improve
→ test

over:

delete
→ rebuild
→ hope

---

# 26. Regression Repair Priority

If the repository contains broken existing functionality, repair important
regressions before adding dependent features.

Examples:

- broken permissions
- broken comments
- broken mentions
- failing notifications
- broken saved views
- failing builds
- broken Kaneo sync
- authorization failures

A new feature built on a broken foundation is not progress.

---

# 27. Feature Priority

If time or agent budget is constrained, prioritize:

P0

- build stability
- authentication
- authorization
- data integrity
- broken production functionality

P1

- comments
- mentions
- notifications
- performance
- Tasks
- Saved Views
- Property Visibility
- Kaneo reliability

P2

- Admin polish
- notification preferences
- Resend
- additional database properties
- richer search

P3

- Whisper
- Ollama
- automations
- advanced imports/exports
- advanced AI workflows

Do not sacrifice P0/P1 reliability to implement P3 features.

---

# 28. AI Safety for Internal Operations

AI can assist with operational work but should not silently perform
consequential bulk actions.

Preferred pattern:

AI analyzes
→ AI proposes
→ user reviews
→ user approves
→ system executes

Especially for:

- Kaneo task creation
- bulk task updates
- employee changes
- migrations
- meeting-derived execution plans

---

# 29. Final Product-Wide UX Pass

After features are integrated, perform one dedicated product-wide UX pass.

Review:

- sidebar
- Home
- Tasks
- Meetings
- Documents
- Databases
- Inbox
- Search
- Admin
- Settings
- Integrations
- Kaneo
- Notion Migration

Look specifically for:

- inconsistent buttons
- inconsistent spacing
- duplicate headings
- duplicate sections
- awkward empty space
- inconsistent cards
- inconsistent forms
- duplicate Activity & Comments headings
- overflow
- poor side-peek sizing
- missing loading states
- confusing labels
- inaccessible controls

Fix systemic inconsistencies.

---

# 30. Responsive QA

Verify representative screens at multiple widths.

At minimum inspect:

- desktop
- narrower laptop
- tablet-like width

Pay special attention to:

- sidebar
- task board
- task side peek
- database tables
- admin tables
- dialogs
- forms

Do not allow the right-side peek to make the underlying application unusable.

---

# 31. Production Build Verification

A local development server working is not sufficient.

Verify production behavior.

Check:

- production build
- CI
- Linux case sensitivity
- environment variables
- Firebase configuration
- Firebase Admin credentials
- server-only imports
- image/static assets
- Kaneo configuration

Do not repeat previously encountered mistakes such as assuming macOS filesystem
behavior matches Linux CI.

---

# 32. Git Integration

Before final integration:

```bash
git status
git diff --check
```

Do not leave accidental files.

Do not leave debugging code.

Do not leave secrets.

Do not leave generated local artifacts unless intentionally tracked.

Keep commits understandable where the environment permits.

---

# 33. Final Acceptance

The multi-agent run is complete only when the orchestrator can explain:

1. what was changed
2. what was fixed
3. what was added
4. what remains
5. what tests passed
6. what tests failed
7. what security checks were performed
8. what performance improvements were made
9. what Kaneo architecture now exists
10. what production configuration is required

Do not report "everything is complete" if meaningful work remains.

---

# 34. Final Deliverable

Produce a final implementation report containing:

## Completed

Features and fixes completed.

## Architecture

Important architectural decisions.

## Kaneo

Current integration model and source of truth.

## Firebase

Any schema, Rules, index or configuration changes.

## Environment Variables

Names only.

Never output secret values.

## Testing

Exact commands executed and outcomes.

## Performance

Problems found and improvements made.

## Security

Important security findings and mitigations.

## Remaining Work

Anything incomplete or intentionally deferred.

## Deployment

Exact deployment or configuration steps still required.

---

# Final Instruction

The goal of this multi-agent effort is not maximum code output.

The goal is a substantially better ProveIt Workspace.

Coordinate first.

Understand before rewriting.

Reuse before duplicating.

Secure before exposing.

Test before claiming success.

Integrate before finishing.

Polish before calling the product complete.