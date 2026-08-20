# ProveIt Workspace — Feature Acceptance Criteria

## Purpose

This document defines the minimum acceptance criteria for features in ProveIt Workspace.

It exists to prevent incomplete implementations from being reported as finished.

A feature is not complete because:

- a component renders
- an API route exists
- a button exists
- TypeScript passes
- a happy-path demo works once

A feature is complete only when its expected user workflow works, authorization is correct, persistence is correct, errors are handled, and relevant tests pass.

All agents must also follow:

- AGENTS.md
- PROVEIT_MASTER_PLAN.md
- MULTI_AGENT_EXECUTION_PLAN.md

The current repository remains the implementation source of truth.

---

# 1. Global Definition of Done

Unless explicitly excluded, every user-facing feature must satisfy the following.

## Functional

- The intended workflow works end-to-end.
- Data persists correctly.
- Refreshing the page does not unexpectedly lose persisted state.
- Existing related functionality continues working.
- Empty states work.
- Error states work.
- Loading states work.
- Duplicate actions are prevented where appropriate.
- Rapid repeated clicks do not create duplicate records.

## Authorization

- Authentication is enforced.
- Workspace boundaries are enforced.
- Admin-only functionality is protected server-side.
- Users cannot access another workspace merely by changing a URL or document ID.
- Client-side hiding is never the only authorization mechanism.

## UX

- Controls clearly communicate their purpose.
- Buttons provide feedback when processing.
- Destructive actions require appropriate confirmation.
- Forms communicate validation failures.
- Layout remains usable at supported widths.
- Keyboard navigation works for important interactive workflows.
- Focus states are visible.
- Duplicate UI sections are removed.

## Reliability

- Realtime behavior does not create duplicate listeners.
- Components clean up subscriptions.
- Failed writes do not falsely appear successful.
- Optimistic updates reconcile with server state.
- Race conditions are considered for important writes.

## Quality Gates

Relevant checks must pass:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:rules
npm run build
```

Inspect package.json for additional applicable tests.

---

# 2. Authentication

Authentication is accepted when:

- valid users can log in
- invalid credentials show an understandable error
- logged-out users cannot access protected application data
- logout reliably clears the authenticated experience
- refresh preserves a valid authenticated session
- disabled users cannot continue using protected functionality where applicable
- authentication loading does not briefly expose protected application content

Firebase client configuration must be valid in:

- local development
- CI
- production

Firebase Admin configuration must remain server-only.

No Firebase Admin credentials may enter client bundles.

---

# 3. Workspace Authorization

Workspace authorization is accepted when:

- a user sees only authorized workspaces
- workspace navigation reflects actual access
- API routes verify workspace membership
- Firestore Rules enforce relevant workspace isolation
- unauthorized direct URLs are rejected
- knowing another workspace ID does not grant access
- knowing another entity ID does not grant access

Test at minimum:

User A belongs to Workspace A.

User B belongs to Workspace B.

User A must not gain access to Workspace B data through:

- direct URL
- Firestore query
- API request
- search
- comments
- notifications
- database rows

---

# 4. Sidebar & Navigation

Navigation is accepted when:

- authorized workspaces appear
- workspace sections expand/collapse correctly
- current navigation state is visually clear
- links navigate to the correct workspace
- administration links appear only for appropriate users
- navigation remains usable on narrower screens
- sidebar state does not create major layout instability

Core workspace navigation should include supported areas such as:

- Dashboard
- Documents
- Tasks
- Meetings
- Databases
- Recent Activity

Where implemented:

- Inbox
- Integrations
- Settings

---

# 5. Tasks — Core

Tasks are accepted when a permitted user can:

- create a task
- view a task
- edit a task
- delete a task
- change status
- change priority
- assign a user
- change due date
- interact with supported custom fields
- open task details
- close task details
- open a full task page

Changes must persist.

Refresh must show the persisted values.

Failures must not silently discard changes.

---

# 6. Task Board

The task board is accepted when:

- tasks appear in the correct status column
- column counts are accurate
- empty columns display useful empty states
- task creation from an appropriate column assigns the expected status
- task updates appear without requiring unnecessary full-page reloads
- the board remains usable with many tasks
- task cards display the most useful metadata without excessive clutter

If drag-and-drop is supported:

- moving a card updates its status
- the move persists
- failure restores or reconciles UI state
- accidental duplicate writes do not occur

---

# 7. Task List

List view is accepted when:

- the same underlying task records appear as Board view
- switching Board/List does not corrupt state
- task metadata is understandable
- selecting a task opens the expected detail experience

If filters or sorting are supported, their results must be consistent with the Board where applicable.

---

# 8. Task Side Peek

The task side peek is accepted when:

- selecting a task opens the correct task
- the panel does not make the underlying application unusable
- Close works
- Open full page works
- edits persist
- Save clearly indicates processing where necessary
- delete works with confirmation
- comments appear exactly once

There must NOT be duplicate:

"Activity & comments"

sections.

The duplicate section previously observed in the task side peek is considered a defect.

---

# 9. Comments — Shared System

Comments must behave consistently across supported entities.

Supported contexts may include:

- tasks
- meetings
- documents
- database rows

A comment system is accepted when a permitted user can:

- create a comment
- see the comment appear
- refresh and retain the comment
- edit their comment where editing is supported
- delete their comment where deletion is supported
- see author
- see timestamp
- see edited state when applicable

Comments must belong to the correct:

- workspace
- entity type
- entity ID

A comment from Entity A must never appear on Entity B merely because of an incomplete query.

Queries should include sufficient scoping.

---

# 10. Comment Replies

If replies are implemented, acceptance requires:

- users can reply to a specific comment
- the parent relationship persists
- replies render beneath or logically associated with the parent
- reply author and timestamp appear
- replies survive refresh
- authorization matches the parent entity
- replying can generate appropriate notifications

A reply is not merely another visually indented comment without a persisted relationship.

---

# 11. @Mentions — Core Acceptance

Mentions are a critical collaboration feature.

Typing:

```text
@
```

inside a comment should open a mention picker when eligible users exist.

The picker should display useful identity information such as:

- name
- avatar/initials
- optionally email where appropriate

The picker must be restricted to users who can legitimately participate in the relevant workspace/context.

---

# 12. Mention Search

Given workspace members:

- Dhairya Singhal
- Nirvaan Agarwal
- Sanchit Jain

Typing:

```text
@san
```

should make Sanchit discoverable.

Typing:

```text
@nir
```

should make Nirvaan discoverable.

Matching should be reasonably case-insensitive.

The user should not need to know an internal UID.

---

# 13. Multiple Mentions

Multiple mentions in one comment are required.

Example:

```text
@Nirvaan can you review this with @Sanchit?
```

The author must be able to select both users.

Both mentions must survive submission.

Both users must remain identifiable after persistence.

The system must not assume only one mention per comment.

---

# 14. Mention Selection

Selecting a mention should:

1. insert the person into the comment
2. preserve their stable identity
3. close or update the picker
4. allow the author to continue typing
5. allow additional mentions

Keyboard support should include, where practical:

- Arrow Up
- Arrow Down
- Enter
- Escape

Mouse selection must also work.

---

# 15. Structured Mention Storage

Mention identity must not depend solely on parsing display names after submission.

At minimum, persisted data should allow the application to determine which user IDs were intentionally mentioned.

An acceptable model could include:

```ts
{
  body: "@Nirvaan please review this with @Sanchit",
  mentionedUserIds: [
    "uid-of-nirvaan",
    "uid-of-sanchit"
  ]
}
```

The exact schema may differ based on the repository architecture.

The important requirement is stable user identity.

Display names are not stable identifiers.

---

# 16. Mention Rendering

After posting:

```text
@Sanchit
```

should be visually distinguishable from ordinary text.

It should remain readable.

Mention styling must follow the ProveIt design system.

The system must not merely color every arbitrary word beginning with `@` as a valid user mention.

---

# 17. Mention Notifications

When User A posts a comment mentioning User B:

User B should receive an in-app notification.

The notification should identify:

- who mentioned them
- relevant entity
- enough context to understand the notification
- navigation target

Opening the notification should navigate to the correct entity where practical.

---

# 18. Multiple Mention Notifications

Given:

```text
@Nirvaan please work with @Sanchit on this.
```

Nirvaan should receive the appropriate notification.

Sanchit should receive the appropriate notification.

Each should receive it only once for that comment.

---

# 19. Mention Deduplication

Given:

```text
@Sanchit can you review this? @Sanchit this part is especially important.
```

Sanchit should normally receive ONE mention notification for the comment, not two.

The persisted mention set should avoid unnecessary duplicates.

---

# 20. Self Mentions

If a user mentions themselves:

```text
@Dhairya remember to update this.
```

the system should not create a pointless self-notification unless there is an intentional product requirement stating otherwise.

Default behavior:

no self-notification.

---

# 21. Invalid Mentions

Typing:

```text
@randomperson
```

without selecting a legitimate workspace member must not create a notification for an unrelated user.

Plain `@text` should remain possible where appropriate.

---

# 22. Edited Mentions

If comment editing supports mentions, behavior must be deliberate.

Example:

Original:

```text
Please review this.
```

Edited:

```text
@Sanchit please review this.
```

The implementation must define whether newly introduced mentions trigger notifications.

Recommended behavior:

newly added valid mentions may trigger notifications.

Existing mentioned users should not receive duplicate mention notifications merely because unrelated text was edited.

---

# 23. Notifications — Data

Notifications must have sufficient information to determine:

- recipient
- event type
- actor
- workspace
- related entity
- related entity ID
- read state
- creation time
- navigation destination where applicable

Notification data should support future email delivery without making email the canonical store.

---

# 24. Notifications — Realtime

When a notification is created:

- the recipient should receive it without needing a full-page refresh where realtime infrastructure exists
- unread indicators should update
- duplicate listeners must not multiply notifications
- unsubscribing/unmounting must clean up listeners

---

# 25. Inbox

Inbox is accepted when the user can:

- see their notifications
- distinguish unread from read
- open a notification
- navigate to the relevant entity
- mark a notification read

Where supported:

- mark unread
- archive
- filter unread/all
- bulk mark read

A user must never see another user's private notification feed.

---

# 26. Notification Preferences

Preferences are accepted when:

- settings persist
- settings are scoped to the correct user
- notification delivery respects them

Potential in-app categories:

- mentions
- replies
- assignments
- reminders

Potential email categories:

- mentions
- replies
- assignments
- task reminders
- meeting invitations
- meeting reminders

Critical account/security communications may require separate treatment.

---

# 27. Resend Email

Resend integration is accepted when:

- email is sent server-side
- RESEND_API_KEY remains server-side
- failures are logged safely
- user preference rules are respected where applicable
- duplicate events do not create duplicate emails
- email failure does not corrupt canonical application data

Potential email flows:

- invitation
- mention
- reply
- assignment
- task reminder
- meeting invitation
- meeting reminder

---

# 28. Meetings

Meetings are accepted when permitted users can:

- create meetings
- view meetings
- edit meetings
- delete meetings where supported
- manage supported participants
- add notes/agenda content where supported
- comment
- mention users
- navigate between list/detail experiences

Meeting data must remain workspace-scoped.

---

# 29. Meeting AI Foundation

Future meeting AI architecture should support:

```text
Audio
↓
Whisper
↓
Transcript
↓
Ollama
↓
Structured output
```

The structured output may include:

- summary
- decisions
- action items
- blockers
- follow-ups

Acceptance requires AI-generated content to be distinguishable from human-authored content.

AI must not silently create consequential operational actions without appropriate review.

Preferred:

AI proposes
→ user reviews
→ user approves
→ system executes

---

# 30. Documents

Documents are accepted when permitted users can:

- create supported documents
- open documents
- edit documents
- persist edits
- navigate reliably
- use comments where supported
- use mentions where supported

Autosave must provide understandable feedback.

The system should distinguish states such as:

- saving
- saved
- failed

Users should not reasonably believe unsaved content was saved.

---

# 31. Databases — Core

Databases are accepted when permitted users can:

- view databases
- open a database
- view rows
- create supported rows
- edit supported properties
- persist values
- open row details where supported

Typed values must remain typed.

Do not reduce structured database values to arbitrary strings merely to simplify implementation.

---

# 32. Database Saved Views

Saved Views are accepted when a user can:

- create a view
- name the view
- switch between views
- persist the view
- refresh and retain it

A saved view should preserve supported configuration such as:

- filters
- sorts
- visible properties
- property order
- view type
- grouping where supported

Changing View A must not unexpectedly corrupt View B.

---

# 33. Property Visibility

Property visibility is accepted when:

- users can choose which supported properties appear in a view
- hidden properties disappear from that view
- underlying data remains intact
- refresh preserves visibility settings
- different saved views may have different visible properties

Hiding a property is NOT deleting a property.

---

# 34. Property Ordering

Property ordering is accepted when:

- users can change display order
- order persists
- refresh preserves order
- ordering is view-specific where architecture supports view-specific configuration

---

# 35. Select Colors

Select property colors are accepted when:

- each option may have a supported color
- the selected color persists
- badges render consistently
- editing an option color updates future rendering
- colors remain readable in supported themes

Avoid arbitrary unreadable color combinations.

---

# 36. Status Colors

Status properties should support consistent semantic presentation.

Acceptance requires:

- status values retain identity
- colors persist
- badges remain readable
- status changes do not accidentally create duplicate options

---

# 37. Person Properties

If Person properties are implemented:

- eligible workspace users can be selected
- stored values use stable user IDs
- renamed users continue resolving correctly
- unauthorized users cannot be assigned through forged writes

---

# 38. Multi-select

If Multi-select is implemented:

- multiple options can be selected
- options persist
- options can be removed
- duplicate selection is prevented
- colors render consistently where supported

---

# 39. Relations

If Relations are implemented:

- relations reference stable record IDs
- target existence is validated where appropriate
- authorization is respected
- deleted targets do not catastrophically break rendering
- relation UI clearly identifies linked records

---

# 40. Search

Universal Search is accepted when authorized users can find supported:

- tasks
- meetings
- documents
- databases
- database rows

Search results should show:

- entity type
- title/name
- useful context
- workspace where necessary

Selecting a result should navigate to the correct destination.

---

# 41. Search Authorization

This requirement is critical.

Search must never leak unauthorized data.

A user without access to Workspace B must not see:

- Workspace B task names
- meeting titles
- document names
- database names
- database-row content

even as partial search results.

---

# 42. Search UX

Search should support:

- useful empty state
- no-results state
- loading state
- keyboard navigation where applicable
- Escape to close where implemented as a palette
- Enter to select

Search should not trigger uncontrolled expensive queries for every keystroke.

Use appropriate debouncing or query architecture.

---

# 43. Employees Admin

Authorized administrators should be able to:

- view employees
- inspect relevant employee details
- manage supported permissions
- manage workspace access
- activate/deactivate where supported
- perform supported account operations

Changes must persist.

Unauthorized users must not gain access merely by navigating directly to admin routes.

---

# 44. Admin UX

Administration pages should use the same product design system as the rest of ProveIt.

Acceptance requires:

- consistent typography
- consistent buttons
- consistent forms
- clear sections
- understandable permission labels
- useful status badges
- loading feedback
- errors
- confirmation for destructive actions
- responsive tables/forms

The Admin section must not feel like an unrelated developer console.

---

# 45. Workspace Settings

Workspace Settings are accepted when authorized users can modify supported workspace configuration and those changes persist.

Authorization must be checked server-side or through secure Firestore Rules as appropriate.

Users without management permissions must not modify settings through forged requests.

---

# 46. Custom Fields

Custom Fields are accepted when:

- authorized users can create supported fields
- edit supported configuration
- delete where permitted
- use fields on relevant entities
- values persist
- authorization is respected

Existing field values should not be silently destroyed by unrelated schema edits.

---

# 47. Notion Migration

Notion Migration must remain controlled.

Acceptance requires:

- preview before execution where architecture supports it
- clear unresolved mappings
- safe error handling
- no accidental repeated destructive migration
- authorization
- understandable progress/results

Migration must not silently overwrite unrelated workspace data.

---

# 48. Kaneo — Connection

Kaneo integration is accepted only after the CURRENT implementation is inspected.

Do not assume historical POC behavior is still current.

The integration should expose a safe way to determine connection health.

Credentials must remain server-side.

---

# 49. Kaneo — Source of Truth

The implementation must explicitly define:

- which system owns task creation
- which system owns status
- which system owns assignment
- which system owns deletion
- synchronization direction
- external ID mapping

Do not implement ambiguous two-way synchronization.

The architecture must prevent infinite synchronization loops.

---

# 50. Kaneo — Task Mapping

When a ProveIt task maps to Kaneo, sufficient metadata must exist to identify the corresponding Kaneo entity reliably.

Do not rely solely on task title matching.

Stable IDs must be used.

---

# 51. Kaneo — Synchronization

Synchronization is accepted when:

- mapped tasks synchronize according to the documented source-of-truth model
- failures are detected
- failures do not corrupt unrelated tasks
- retries do not create duplicates
- synchronization metadata is available for diagnostics

Where applicable record:

- external ID
- last sync
- sync state
- last error

---

# 52. Kaneo — Reconciliation

Reconciliation is accepted when administrators can identify important divergence between ProveIt and Kaneo.

The system should not silently choose a winner for destructive conflicts unless that behavior is explicitly designed.

Where human judgment is required:

detect
→ explain
→ propose
→ approve
→ reconcile

---

# 53. Kaneo Admin UX

The Kaneo integration experience should expose useful operational information such as:

- connection state
- configured project
- mapping status
- last synchronization
- failed synchronizations
- reconciliation actions

Do not expose:

- API keys
- tokens
- secrets
- unnecessary raw implementation internals

---

# 54. Dashboard

Workspace Dashboard is accepted when:

- information is workspace-specific
- values reflect real underlying data
- empty states work
- cards link to useful destinations where appropriate
- loading does not block unrelated application areas unnecessarily

Avoid decorative metrics with no operational value.

---

# 55. Recent Activity

Recent Activity is accepted when:

- relevant actions appear
- actor is identifiable
- entity is identifiable
- timestamp is present
- workspace scoping is correct
- navigation works where supported

Activity records must not leak other workspace activity.

---

# 56. Realtime Updates

Realtime updates should be used intentionally.

Acceptance requires:

- listeners are scoped
- listeners are cleaned up
- duplicate listeners are avoided
- data does not flicker unnecessarily
- realtime updates do not overwrite active unsaved user input

Do not introduce automatic full-page reload loops.

---

# 57. Performance

Performance work is accepted when actual bottlenecks are identified and improved.

Audit:

- Firestore reads
- realtime listeners
- API calls
- sequential operations
- rerenders
- bundle size
- server/client boundaries
- repeated auth verification
- unnecessary router refresh
- large query results

Where practical, record before/after evidence.

---

# 58. Auto Refresh / Reload

Periodic full-page auto reload is NOT an acceptable general solution for slowness or stale data.

Do not implement:

```ts
setInterval(() => {
  window.location.reload();
}, ...)
```

as a global freshness strategy.

Prefer:

- Firestore realtime listeners
- targeted refetch
- router refresh only when necessary
- optimistic updates
- cache invalidation
- event-driven updates

A manual Refresh control may be appropriate for specific integration diagnostics.

---

# 59. Loading States

Any operation that may noticeably take time should provide feedback.

Examples:

- saving task
- sending comment
- loading comments
- searching
- loading database
- syncing Kaneo
- migration
- admin mutation

Do not leave the user wondering whether their click worked.

---

# 60. Error States

Errors should be:

- understandable
- actionable where possible
- non-destructive
- visually consistent

Avoid exposing raw internal stack traces to normal users.

Operational logs may contain more diagnostic information, but must not expose secrets.

---

# 61. Empty States

Important empty states should explain what the user can do next.

Examples:

Instead of:

```text
No tasks
```

Prefer something equivalent to:

```text
No tasks in progress.
Add a task or move one here when work begins.
```

Keep copy concise.

---

# 62. Responsive Layout

Representative pages must remain usable on:

- normal desktop
- narrower laptop
- tablet-like width

Critical screens:

- Tasks
- task side peek
- Meetings
- Documents
- Databases
- database rows
- Inbox
- Employees
- Workspace Settings
- Kaneo

Horizontal overflow must be intentional where tables genuinely require it.

---

# 63. Accessibility

Important controls should have:

- accessible names
- keyboard accessibility
- visible focus
- reasonable semantic HTML
- readable contrast
- understandable error association

Icon-only buttons require accessible labels.

Decorative images should not produce unnecessary screen-reader noise.

---

# 64. ProveIt Branding

The application should use the established ProveIt visual identity.

Preserve the correct ProveIt logo assets.

Use shared design tokens instead of arbitrary feature-specific styling.

Avoid excessive unrelated accent colors.

Semantic colors should remain recognizable for:

- success
- warning
- danger
- informational/status states

---

# 65. Dark / Light Theme

If both themes are supported:

- ProveIt logo variant must be correct
- text remains readable
- borders remain visible
- forms remain usable
- status badges remain readable
- mention styling remains readable
- admin pages remain consistent

Theme support must not rely on broken asset casing.

Remember that production/CI Linux filesystems are case-sensitive.

---

# 66. Firebase Client

Firebase client initialization must:

- initialize once as appropriate
- use intended NEXT_PUBLIC_FIREBASE_* configuration
- work in local development
- work in CI
- work in production

The build must not fail with:

```text
auth/invalid-api-key
```

because CI configuration was omitted.

---

# 67. Firebase Admin

Firebase Admin must:

- remain server-only
- use correct project configuration
- work in supported deployment environments
- not expose credentials
- avoid accidental repeated incompatible initialization

Admin initialization changes must be tested in production build conditions.

---

# 68. Firestore Rules

Rules are accepted when:

- legitimate workflows succeed
- unauthorized workflows fail
- workspace boundaries are enforced
- admin restrictions are enforced
- comments are appropriately protected
- notifications are appropriately protected
- custom fields are protected
- sensitive integration configuration is protected

Never resolve failing tests by broadly allowing reads/writes.

---

# 69. CI

CI is accepted when:

- workflow YAML is valid
- dependencies install deterministically
- TypeScript runs
- lint runs
- unit tests run
- Firestore Rules tests run
- production build runs
- generated/diff checks run where configured

CI must be tested under Linux assumptions.

---

# 70. Production Build

The following must succeed under the intended production configuration:

```bash
npm run build
```

If CI intentionally uses:

```bash
npx next build --webpack
```

that path must also succeed.

A successful local Turbopack build does not prove a webpack CI build succeeds.

---

# 71. Environment Variables

Required environment variables must be documented by NAME.

Never place actual secret values in documentation.

Potential variables include current repository requirements such as:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_ADMIN_PROJECT_ID
RESEND_API_KEY
```

Kaneo variables should be documented according to the actual integration.

Do not invent names if the repository already defines them differently.

---

# 72. Secrets

Acceptance requires:

- no secrets committed
- no secrets rendered client-side
- no secrets logged
- no secrets included in error responses
- no secret values included in screenshots/documentation
- server integrations use server-only environment variables

---

# 73. Duplicate UI Prevention

The application must not contain accidental duplicated sections caused by integration mistakes.

Specifically inspect:

- Activity & comments
- task metadata
- page headings
- side-peek headers
- save controls
- navigation
- notification sections

If the same section appears twice without an intentional UX reason, treat it as a defect.

---

# 74. No Dead Controls

Every visible control should either work or clearly indicate that it is unavailable.

Do not ship:

- buttons with no handler
- menu items that do nothing
- fake search
- fake filters
- fake integrations
- toggles that do not persist

Remove or disable incomplete controls rather than pretending functionality exists.

---

# 75. No Silent Data Loss

No common workflow should silently lose user-entered data.

Particularly test:

- comments
- document editing
- task editing
- database row editing
- meeting notes
- admin forms

Navigation during unsaved operations should be handled intentionally.

---

# 76. No Unnecessary Full Reloads

Normal application operations should not require full browser reloads.

Examples:

Posting a comment should not require reload.

Changing a task should not require reload.

Receiving a notification should not require reload.

Changing a database value should not require reload.

Use application state/realtime architecture appropriately.

---

# 77. Critical Cross-Feature Test — Mention

Scenario:

1. Dhairya opens a Business workspace task.
2. Dhairya writes:

```text
@Nirvaan please review this with @Sanchit.
```

3. Mention picker resolves both users.
4. Dhairya submits.
5. Comment appears once.
6. Both mentions render correctly.
7. Nirvaan receives one notification.
8. Sanchit receives one notification.
9. Dhairya receives no self-notification.
10. Nirvaan opens the notification.
11. The correct task opens.
12. Refresh preserves the comment and mentions.

If this workflow fails, mentions are not complete.

---

# 78. Critical Cross-Feature Test — Reply

Scenario:

1. Dhairya comments on a task.
2. Nirvaan replies.
3. Reply appears under the correct comment.
4. Dhairya receives the expected reply notification.
5. Dhairya opens it.
6. Correct task/comment context opens.

If supported notification preferences disable the event, delivery must respect the preference.

---

# 79. Critical Cross-Feature Test — Saved View

Scenario:

1. User opens a database.
2. Creates:

```text
My Active Work
```

3. Adds a filter.
4. Adds sorting.
5. Hides two properties.
6. Reorders properties.
7. Leaves the database.
8. Returns.
9. Selects the saved view.

Expected:

- filter preserved
- sorting preserved
- visibility preserved
- order preserved

If these reset unexpectedly, Saved Views are incomplete.

---

# 80. Critical Cross-Feature Test — Kaneo

Use the source-of-truth architecture actually selected for the repository.

Example:

1. Create/update a ProveIt task that should synchronize.
2. Synchronization runs.
3. Kaneo receives the expected representation.
4. Stable external mapping is stored.
5. Re-running synchronization does not duplicate the task.
6. Failure is surfaced appropriately.
7. Reconciliation can identify divergence.

Exact direction may differ based on the architecture.

Document it.

---

# 81. Critical Cross-Feature Test — Authorization

Scenario:

1. User belongs to Company workspace.
2. User does not belong to Board of Directors workspace.
3. User obtains a BOD entity ID.

Attempt:

- direct URL
- API request
- Firestore access
- search

Expected:

access denied and no sensitive metadata leaked.

---

# 82. Critical Cross-Feature Test — Admin

Scenario:

1. Admin changes an employee's workspace permission.
2. Change persists.
3. Employee session/application reflects the new authorization appropriately.
4. Direct URLs obey the new permission.
5. Search obeys the new permission.
6. APIs obey the new permission.

Changing a permission only visually in the Admin UI is not sufficient.

---

# 83. Critical Cross-Feature Test — Production

Before final completion:

1. clean install
2. run quality gates
3. run production build
4. verify CI
5. verify deployment
6. open deployed application
7. authenticate
8. open workspace
9. open Tasks
10. open task
11. post comment
12. test mention
13. verify notification
14. test representative admin workflow
15. test representative database workflow
16. test Kaneo health where configured

A deployment existing is not sufficient.

The deployed application must function.

---

# 84. Regression Requirement

When fixing or adding a feature, agents must inspect nearby functionality for regressions.

Examples:

Changing comments:

also verify task comments, meeting comments, document comments and row comments where shared.

Changing Firebase:

also verify auth, Admin routes, Rules tests and production build.

Changing navigation:

also verify admin and workspace routes.

Changing database property infrastructure:

also verify existing typed values.

---

# 85. Completion Reporting

For every substantial feature, report:

## Implemented

What changed.

## Files

Important files modified.

## Data

Schema or persistence changes.

## Authorization

How access is enforced.

## UX

Important interaction behavior.

## Tests

Exact tests executed.

## Remaining

Anything intentionally incomplete.

Do not use:

"fully complete"

unless all relevant acceptance criteria have actually been verified.

---

# 86. Product Acceptance

The product is ready for broader internal use when:

- authentication is reliable
- workspace isolation is reliable
- production builds are reliable
- Tasks are reliable
- comments are reliable
- mentions work end-to-end
- notifications work end-to-end
- core database functionality is reliable
- Admin functionality is secure
- Kaneo behavior is documented and reliable
- major UI duplication is gone
- major performance problems are addressed
- critical workflows are tested

Advanced AI functionality is not required to declare the core workspace reliable.

---

# 87. Final Principle

For every feature ask:

Can the user actually complete the workflow?

Does the correct data persist?

Can the wrong user access it?

What happens when it fails?

What happens after refresh?

What happens in production?

Does another feature depend on it?

Has that integration been tested?

Only then decide whether the feature is done.