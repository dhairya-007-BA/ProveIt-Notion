# ProveIt Workspace — Complete Product Vision

## Product objective

ProveIt Workspace should become the primary internal operating system for
ProveIt Hiring Inc.

It should combine:

- company knowledge
- execution
- tasks
- project management
- meetings
- documentation
- structured databases
- employee collaboration
- notifications
- operational reporting
- company administration
- integrations
- automation
- AI-assisted workflows

The finished product should feel like one coherent application rather than
a collection of independently built features.

The experience should combine the strongest ideas from products such as
Notion, Linear, Asana and modern internal operating systems while retaining
a distinct ProveIt identity.

Do not blindly clone another product.

The final result must look and feel like ProveIt.

---

# Current implementation checkpoint — Phase 3 (August 20, 2026)

The repository now includes the following production architecture:

- legacy-safe, user-owned in-app and email notification preferences
- one canonical notification service for mentions, replies, assignments,
  invitations, task reminders, overdue work and meeting reminders
- server-only Resend delivery with stable idempotency keys, retry leases and
  delivery diagnostics; missing configuration reports unavailable
- durable task-assignment and meeting-notification outboxes drained by the
  protected reminder scheduler
- server-only Whisper-compatible transcription and Ollama structured analysis
  with explicit availability, processing, failure and retry states
- immutable raw meeting transcripts kept separate from AI output and human notes
- human-reviewed meeting action items that create provenance-linked tasks with
  deterministic duplicate prevention and controlled Kaneo synchronization
- server-authorized meeting creation/update and task-assignee mutations, with
  direct client bypasses denied by Firestore Rules

The external providers still require deployment configuration and live-service
verification. Employee onboarding/password email still requires a verified work
email provisioning model. Longer-horizon product work remains, including rich
document blocks and history, advanced database properties/views, calendar and
Slack integrations, general automation, import/export, and deeper activity
reporting. This checkpoint is an implementation summary, not a declaration that
the complete product vision is finished.

---

# Current implementation checkpoint — UI/UX system and polish (August 20, 2026)

ProveIt now has a compatibility-first shared interface system rather than
page-local visual conventions:

- canonical light/dark brand, surface, text, border, focus and semantic-state
  tokens, with accessible ProveIt blue as the primary action color
- Inter body typography and Montserrat heading hierarchy retained from the
  established brand
- shared button, icon-button, card, form-control, avatar, empty-state, dialog,
  side-sheet, task-status and task-priority primitives
- one desktop/mobile navigation model with consistent SVG iconography, active
  context and accessible account/navigation behavior
- a denser Home command center with assignment-aware focus, overdue context,
  workspace health and canonical activity links
- semantic task status and priority presentation across boards, lists, forms,
  full details, dashboards and global search
- responsive, focus-managed task, meeting and database-row detail sheets
- one searchable keyboard-accessible employee multi-picker for meeting create
  and edit flows
- intentional Profile, Inbox, Employees, workspace administration, Notion
  migration, document-list and database-list experiences
- resilient, Firestore-Rules-protected read fallbacks for saved database views
  and task custom-field definitions when their server presentation routes are
  temporarily unavailable

The current UI follow-up list is deliberately narrower: the large database
detail editor still contains some legacy compact property glyphs and several
hand-built filter/property popovers that should eventually move fully onto the
shared primitives; workspace emoji stored as data should be normalized through
a product icon policy; and representative production data should receive a
final live-provider smoke test after deployment configuration is present.

---

# 1. ProveIt Design System

The entire product must use one intentional visual system.

The design direction is:

mostly neutral interface
+
ProveIt brand colors
+
semantic colors where they communicate meaning.

Avoid a rainbow UI.

## Brand identity

Use the actual ProveIt visual identity throughout the application.

The UI should consistently use:

- ProveIt logo
- ProveIt typography
- ProveIt blue for primary/active states
- supporting teal where appropriate
- supporting orange where appropriate
- restrained semantic green/yellow/red
- neutral backgrounds and surfaces
- consistent borders
- consistent shadows
- consistent spacing
- consistent radii
- consistent iconography

Do not allow different modules to invent independent design systems.

Create reusable design tokens.

Examples:

--proveit-blue
--proveit-teal
--proveit-orange
--background
--surface
--surface-elevated
--sidebar
--border
--text
--muted
--subtle
--success
--warning
--danger
--focus

All new UI should consume shared tokens rather than arbitrary hex colors.

## Typography

Identify and preserve the typography already used by ProveIt.

Create a clear hierarchy for:

- page titles
- section titles
- card titles
- body text
- secondary text
- labels
- metadata
- table text
- form labels
- buttons

Typography should be consistent across user-facing and admin sections.

---

# 2. Global UX Quality

The application should feel fast and deliberate.

Every screen must have appropriate:

- loading states
- skeletons where useful
- empty states
- success states
- error states
- disabled states
- optimistic states
- confirmation states
- hover states
- keyboard focus
- accessible labels

Avoid full-page reloads merely to refresh data.

Prefer:

- Firestore listeners
- local state updates
- optimistic mutations
- router refresh only where actually required
- selective revalidation
- query caching where useful

Investigate every unnecessarily slow interaction.

Performance is part of product quality.

---

# 3. Navigation

The sidebar should become the primary application navigation system.

It should be visually polished and support:

- Home
- Company
- Business
- Technology
- Board of Directors
- workspace-specific modules
- Inbox
- Search
- recent activity
- administration
- integrations
- settings

Support:

- clear active state
- nested workspace navigation
- collapsible groups
- keyboard usability
- responsive behavior
- useful tooltips
- unread notification indicators

The current workspace should always be obvious.

---

# 4. Home / Executive Dashboard

The Home experience should become a true company operating dashboard.

Potential modules:

- My tasks
- Tasks due today
- Tasks due this week
- Overdue tasks
- High-priority work
- Upcoming meetings
- Recent activity
- Mentions
- Inbox
- Company-wide priorities
- Workspace summaries
- Recent documents
- Recently viewed items

For executives/BOD users, consider:

- high-priority company work
- overdue work by owner
- workload distribution
- blocked work
- upcoming deadlines
- project progress
- fundraising initiatives
- business-development pipeline summaries where relevant

Do not build meaningless vanity charts.

Dashboards should help someone answer:

"What needs attention right now?"

---

# 5. Tasks

Preserve all working task functionality.

Enhance tasks into a complete execution system.

Required experience:

- create
- edit
- delete
- assignee
- multiple assignees where architecture supports it
- status
- priority
- due date
- description
- comments
- replies
- @mentions
- notifications
- attachments where appropriate
- custom fields
- activity history
- task side peek
- full task page
- canonical URL
- board view
- list/table view
- drag and drop
- search
- filters
- sorting

Future enhancements should include:

- custom statuses
- custom status colors
- subtasks
- dependencies
- blocking relationships
- recurrence
- templates
- watchers/followers
- reminders
- task history
- duplicate task
- bulk actions

Task side peek and full-page task detail must share the same data model and
business rules.

---

# 6. Comments & Collaboration

There must be ONE shared collaboration system.

Supported entities should include:

- tasks
- meetings
- documents
- database rows

Comments should support:

- top-level comments
- replies
- editing
- deleting
- timestamps
- avatars/initials
- multiple @mentions
- keyboard mention picker
- filtered workspace-member search
- mention chips/rendering
- structured mention IDs
- notifications
- reply notifications
- self-notification prevention
- duplicate-notification prevention

Mentions must not depend only on parsing display names.

Store stable user identifiers.

A comment such as:

@Nirvaan please review this with @Sanchit

must be able to notify both people exactly once.

---

# 7. Inbox & Notifications

Build one canonical notification platform.

The Inbox should support:

- unread
- all
- archived
- mark read
- mark unread
- archive
- bulk actions
- unread count
- real-time updates
- actor
- notification type
- workspace
- target entity
- timestamp
- direct navigation

Notification types should eventually include:

- mention
- reply
- task assignment
- task reassignment
- approaching due date
- overdue task
- meeting invitation
- meeting reminder
- project/workspace events where useful

Notification delivery should be idempotent.

---

# 8. Notification Preferences

Before adding broad email delivery, implement user-level notification settings.

Users should independently control:

IN-APP
- mentions
- replies
- assignments
- reminders

EMAIL
- mention emails
- reply emails
- task assignment emails
- task reminder emails
- meeting invitations
- meeting reminders
- digest emails

Future:

- quiet hours
- digest frequency
- per-workspace preferences

---

# 9. Resend Email Integration

Resend is the transactional-email provider.

Architecture:

Application Event
→ Notification/Event Service
→ Preference Check
→ Idempotency Check
→ Resend
→ Delivery

Never call Resend directly from UI components.

Resend must remain server-side.

Use:

RESEND_API_KEY

Never:

NEXT_PUBLIC_RESEND_API_KEY

Initial email flows:

1. employee invitation
2. account creation
3. password/reset communication
4. mention notification
5. reply notification
6. meeting invitation
7. meeting reminder
8. task assignment
9. task due-date reminder

In-app notifications remain the canonical internal notification record.

Email is another delivery channel.

---

# 10. Meetings

Preserve the existing meeting functionality.

Enhance meetings into a meeting operating system.

Support:

- title
- date
- start/end time
- status
- organizer
- participants
- location
- meeting URL
- agenda
- notes
- transcript
- comments
- replies
- mentions
- notifications
- side peek
- full page
- deletion controls

Future:

- meeting reminders
- calendar integration
- attachments
- recurring meetings
- action items
- meeting templates

## AI meeting system

Use the architecture documented for ProveIt:

Audio
→ Whisper / whisper.cpp
→ raw transcript
→ Ollama
→ structured intelligence

Whisper handles transcription.

Ollama handles:

- summary
- decisions
- action items
- risks
- follow-ups
- structured notes

Never silently overwrite:

- raw transcripts
- manually edited notes

Keep:

Raw Transcript
AI Generated Notes
Human Notes

as distinguishable data.

---

# 11. Meeting → Execution Workflow

One of the strongest ProveIt workflows should eventually be:

Meeting
→ Transcript
→ AI analysis
→ Decisions
→ Action items
→ Suggested owners
→ Suggested deadlines
→ Suggested projects
→ Human review
→ Kaneo / ProveIt tasks created

Consequential bulk actions should always have a review stage.

AI proposes.

Humans approve.

---

# 12. Documents

Upgrade Documents into a high-quality knowledge system.

Current functionality should remain:

- list
- create
- edit
- autosave
- canonical URL
- comments
- replies
- mentions

Future:

- rich block editor
- headings
- lists
- callouts
- tables
- checklists
- code blocks
- links
- images/files
- drag-and-drop blocks
- slash commands
- document templates
- version history
- export
- import
- document search
- backlinks or relationships where appropriate

Do not compromise reliability merely to imitate Notion.

---

# 13. Databases

Databases should become one of the most powerful parts of ProveIt Workspace.

Preserve existing:

- database creation
- rows
- realtime rows
- inline editing
- row side peek
- canonical row page
- comments
- text
- number
- checkbox
- date
- URL
- email
- phone
- select
- search
- filters
- sorting

Implement next:

## Saved Views

Users should be able to save:

- filters
- sorts
- visible properties
- property order
- view type
- optional grouping
- view name

## Property Visibility

Allow properties to be hidden per view.

## Property Ordering

Allow drag-and-drop ordering.

## Colors

Support:

- custom Select colors
- custom Status colors

Use a controlled ProveIt-compatible palette.

## Additional property types

- Status
- Multi-select
- Person
- Relation

Later:

- Rollup
- Formula

## Database views

- Table
- Board
- Calendar
- Gallery where actually useful

Do not implement shallow versions of every view merely for feature count.

---

# 14. Universal Search

Search should become a true command center.

Preserve:

- sidebar Search
- ⌘K / Ctrl+K
- keyboard navigation
- tasks
- meetings
- documents
- databases
- database rows

Expand to:

- people
- recent items
- settings
- quick actions
- create task
- create meeting
- create document
- jump to workspace

Search must respect workspace authorization.

Never leak unauthorized results.

---

# 15. Activity & Audit History

Expand Recent Activity into a trustworthy company audit stream.

Track important events such as:

- task creation
- assignment
- reassignment
- status change
- priority change
- due-date change
- comments
- meeting changes
- document changes
- employee changes
- workspace changes
- integration actions

Allow filtering by:

- user
- workspace
- entity type
- action
- date range

Critical administrative actions should be auditable.

---

# 16. Employee Administration

The admin experience must receive the same UX quality as the rest of ProveIt.

Do NOT treat admin pages as temporary developer screens.

Build polished administration for:

- employee list
- search
- filtering
- active/deactivated status
- employee detail
- role
- workspace access
- administrative permissions
- password reset
- deactivate
- reactivate
- remove
- invitation
- account status

Dangerous actions need explicit confirmations.

Display permission consequences clearly.

Avoid exposing raw Firebase identifiers unless useful for diagnostics.

---

# 17. Workspace Administration

Create a first-class workspace-management experience.

Admins should eventually manage:

- workspace identity
- members
- roles
- access
- custom fields
- statuses
- colors
- views
- defaults
- appearance
- integrations

Admin forms should use the same ProveIt design components as the main app.

---

# 18. Settings

Build a real Settings architecture.

Possible sections:

My Profile
Appearance
Notifications
Email Preferences
Workspace Preferences
Security
Integrations

Appearance settings may later include:

- light
- dark
- system

Do not create theme support through scattered conditional CSS.

Use design tokens.

---

# 19. Kaneo Integration

Kaneo is strategically important.

The earlier POC proved:

- Kaneo can run successfully
- API authentication works
- API reads work
- API writes work
- MCP works
- Codex can access Kaneo through MCP
- tasks can be created through MCP

Do not waste time reproving basic Kaneo connectivity unless a regression exists.

The strategic role of Kaneo is:

Kaneo = structured execution/project-management layer
AI/MCP = operational interface
ProveIt Workspace = human-facing company operating system

The architecture should avoid two competing task universes.

We need a canonical ownership model.

The system should explicitly determine whether ProveIt or Kaneo is the source
of truth for each synchronized object.

Never create endless two-way synchronization without conflict rules.

## Kaneo integration goals

Support controlled synchronization of:

- tasks
- status
- priority
- assignee
- due date
- description
- project
- relevant metadata

Where synchronization exists, define:

- source of truth
- external ID
- synchronization state
- last synced timestamp
- failure state
- retry behavior
- conflict handling

## Kaneo administration

Add a polished Integrations → Kaneo administration section.

Show:

- connection status
- workspace
- mapped projects
- synchronization health
- failed syncs
- last synchronization
- reconciliation controls
- safe diagnostic information

Never show API tokens.

## Kaneo project structure

Use the ProveIt operating model intentionally.

Candidate business areas include:

- Business Operations
- Fundraising
- Sales / Business Development
- Partnerships
- Product
- Engineering
- Marketing / Growth
- Hiring / People
- Legal / Corporate

Do not automatically make every department a project.

Inspect actual Kaneo capabilities first and use native:

- projects
- columns/statuses
- priorities
- labels
- assignees
- due dates

where appropriate.

## Kaneo AI / MCP

Eventually allow controlled AI workflows such as:

"Show overdue high-priority Business tasks."

"Create a high-priority fundraising task due August 30."

"Summarize unfinished work by owner."

"Turn this leadership meeting into proposed execution tasks."

Bulk AI writes should generally use:

AI proposal
→ preview
→ human approval
→ Kaneo mutation

not unrestricted autonomous mutation.

---

# 20. Integrations Hub

Create one coherent Integrations area instead of hiding integrations throughout
the product.

Potential integrations:

- Kaneo
- Resend
- Calendar
- Slack
- Notion import
- future webhooks

Each integration should have:

- status
- description
- connection health
- configuration
- permissions
- last successful operation
- error state

Secrets must never be rendered back to the client.

---

# 21. Notion Migration

Keep the existing Notion migration tooling safe.

Migration must support:

- preview
- mapping
- conflict handling
- resolution
- dry run
- progress
- execution
- error reporting
- audit information

Never perform large destructive imports silently.

The Admin Notion Migration interface should be visually upgraded to the same
quality as the rest of ProveIt.

---

# 22. Automation

Build automation only after the underlying event model is trustworthy.

Potential automations:

WHEN task becomes overdue
→ notify assignee

WHEN user is assigned
→ create notification

WHEN meeting approaches
→ send reminder

WHEN meeting AI extraction completes
→ prepare suggested tasks

WHEN important task remains blocked
→ notify responsible user

WHEN task synchronization fails
→ create integration alert

Future automation UI could expose:

Trigger
Conditions
Actions

Avoid building a full Zapier clone unnecessarily.

---

# 23. Import / Export

Eventually provide controlled export of ProveIt data.

Potential exports:

- workspace data
- tasks
- meetings
- documents
- database data

Formats may include:

- CSV
- JSON
- Markdown where appropriate

Import must support preview and validation.

Never silently overwrite existing data.

---

# 24. Performance Engineering

The current application has experienced slow server/API interactions.

Do not solve this by introducing blind page auto-refresh.

Perform an explicit performance audit.

Inspect:

- duplicate Firestore listeners
- duplicate API requests
- sequential server reads
- unnecessary Firebase Admin calls
- N+1 queries
- missing indexes
- unnecessary server rendering
- bundle size
- unnecessary client components
- route transitions
- stale subscriptions
- excessive re-renders
- duplicate authentication verification
- large payloads

Establish measurable targets.

The UI should immediately acknowledge user actions even when server persistence
takes longer.

---

# 25. Responsive UX

Verify major workflows at:

1440px
1280px
1024px
tablet
reasonable phone width where appropriate

Side peek behavior must adapt intelligently.

Tables should not simply overflow into unusability.

Admin pages require responsive QA too.

---

# 26. Accessibility

Ensure:

- keyboard navigation
- visible focus
- accessible form labels
- sufficient contrast
- semantic buttons
- proper dialogs
- Escape behavior
- screen-reader friendly state
- no mouse-only critical workflows

---

# 27. Admin Design Standard

Administrative pages must look intentional.

Upgrade:

Employees
Workspace Settings
Custom Fields
Notion Migration
Integrations
Kaneo administration
permissions management

Use:

- clear page headers
- contextual explanations
- cards only where useful
- structured tables
- badges
- empty states
- confirmation dialogs
- status summaries
- audit information
- polished loading/error states

Avoid giant forms with weak visual hierarchy.

---

# 28. Product Consistency Review

Before calling the product finished, perform a complete UI consistency pass.

Compare:

- buttons
- inputs
- selects
- cards
- tables
- side peeks
- badges
- dropdowns
- dialogs
- page headers
- forms
- empty states
- error messages
- loading indicators
- notifications

No module should feel like a different application.

---

# 29. Security

Do not regress existing security.

Continue enforcing:

- Firebase authentication
- revoked-token checking
- server-side authorization
- workspace authorization
- BOD/admin restrictions
- Firestore Rules
- emulator testing
- secret isolation

Never expose:

- Firebase service-account credentials
- Kaneo API tokens
- Resend API keys
- integration secrets

No security fix may consist of weakening rules simply to make a feature work.

---

# 30. Quality Gates

No major feature is complete until:

npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:rules
npm run build

pass where applicable.

Also run relevant:

- integration tests
- E2E tests
- visual QA
- Firestore emulator tests

Verify Linux CI behavior.

Verify Vercel production build behavior.

Do not claim deployment success based solely on local build success.

---

# 31. Final Product Standard

The finished ProveIt Workspace should feel like a product that a professional
company could rely on every day.

A user should not need to know:

- Firestore
- Firebase IDs
- route internals
- Kaneo IDs
- synchronization internals
- implementation details

The software should feel:

fast
coherent
professional
trustworthy
responsive
predictable
polished
distinctly ProveIt
