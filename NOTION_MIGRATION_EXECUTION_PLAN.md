# ProveIt Notion Migration Execution Plan

This plan is based on the repository at commit `7a79261` and a read-only scan of
the real exports in `Notion Exports/` on 2026-08-20. No import was executed and
the source archives were not changed.

## Real Export Inventory

The directory contains 59 outer `ExportBlock` ZIP archives. Each normally wraps
one nested Notion export ZIP. The current parser found:

| Source material | Count / observation |
| --- | --- |
| HTML pages | 786 |
| CSV databases | 50 |
| CSV database rows | 694 |
| Assets | 134 |
| Internal HTML links | 1,926 |
| Markdown files | None detected |
| Unsupported file types | None detected |
| Parser warnings | 167: 165 duplicate source IDs and 2 nested attachment ZIPs intentionally not expanded |

Assets comprise 67 PNG, 18 JPEG, 8 JPG, 13 PDF, 8 SVG, 6 JSON, 6 Python,
3 text, 2 DOCX, 2 ZIP, and 1 PPTX files. The two ZIP assets are preserved as
blocked attachments after the maximum nested-archive depth is reached.

The 50 CSVs include 2 task databases (185 rows), 2 meeting databases (24 rows),
and 46 generic databases. Important generic structures include an MVP roadmap,
cash/expense/budget requests, infrastructure costs, bank statements, time off,
marketing posts, document hubs/indexes, customer validation, employee/roadmap
directories, and embedded option/sub-page tables. Property inference currently
reports 127 text, 60 single-select, 42 date, 25 person, 21 last-edited-time,
19 multi-select, 12 URL, 11 number, 10 files, 6 checkbox, and 6 created-time
properties.

The exports overlap materially. Repeated copies of document indexes, option
tables, sub-pages, and their page IDs account for most of the 165 duplicate
source IDs. Relations such as `Blocked by`, `Blocking`, `Parent item`,
`Sub-item`, `Depends On`, `Produces`, and `Research Doc` are present as
link-bearing CSV text, not as a recognized relation type. Page HTML also
contains tables, media references, internal links, and row-detail content.

### Exact 33-record preview currently seen in Admin

The `33 total / 15 ready / 0 needs review / 4 blocked / 14 skipped` preview
matches this archive exactly:

`c986fbf9-ce0d-4975-9f2c-9ced88f51755_ExportBlock-dc7ab407-194d-4842-8973-39f47c353e1d.zip`

It contains one 14-row employee-directory CSV, 15 HTML pages, and 3 image
assets. After the saved workspace/property/schema/person decisions are applied,
the generic database record plus its 14 CSV rows are the 15 ready records. The
directory is deliberately treated as historical database content; it does not
create or modify ProveIt employee accounts. One CSV row is completely empty and
must be rejected or explicitly skipped by the future validator rather than
imported as an untitled row.

The export contains personal data. Future diagnostics and reconciliation logs
must redact dates of birth, personal email addresses, phone numbers, and raw
person-field values.

## Existing Migration Architecture

- `scripts/notion-dry-run.ts` opens all ZIPs and reports a zero-write inventory.
- `src/lib/notion-import.ts` safely traverses one nested ZIP level, rejects
  unsafe paths and size/count violations, parses HTML/CSV, infers property
  types, detects internal links and duplicate source IDs, and retains raw rows.
- `src/lib/notion-migration-preview.ts` builds deterministic preview record IDs,
  proposes workspace/entity mappings, resolves only unambiguous employees,
  classifies document loss risk, and creates blocked asset plans.
- `src/lib/notion-migration-resolutions.ts` validates and applies bounded manual
  decisions for workspace, people, duplicates, status, properties, schemas, and
  warning-safe documents.
- Preview and resolution routes require the `manageWorkspaces` capability.
  Resolutions are stored under `notionMigrationConfigs/{sourceFingerprint}`.
- The UI exposes review queues and canonical readiness totals. It never uploads
  assets or creates destination entities.
- A proposed idempotency key exists:
  `notion:v1:<sourceFingerprint>:<sourceId>`. Task plans structurally disable
  Kaneo synchronization.

## Why Import Is Currently Locked

There are two independent locks:

1. `migrationReadiness()` keeps a preview locked while any property schema is
   unresolved or any record is `needs_review` or `blocked`
   (`src/lib/notion-migration-resolutions.ts`). Assets and materially lossy
   documents are always blocked.
2. Execution is unconditionally disabled. `NOTION_MIGRATION_EXECUTION_ENABLED`
   is `false`, `disabledMigrationExecution()` returns
   `migration_execution_not_authorized`, and the execute route always returns
   HTTP 403 (`src/lib/notion-migration-executor.ts` and
   `src/app/api/admin/notion-migration/execute/route.ts`). No production write
   implementation exists behind that route.

The second lock must remain until the pipeline and acceptance tests below are
complete. Clearing review decisions alone must never enable writes.

## Current Blocked Records

For the exact 33-record preview, the four blocked records are:

1. The employee-directory root HTML page. It contains an embedded HTML table
   and an asset dependency, both classified as materially lossy for the current
   plain-text document model.
2. A PNG asset at the directory level.
3. A JPG profile asset under one row page.
4. A second PNG profile asset under that row page.

All asset records are blocked because only an upload plan exists. Bytes have
not been MIME-verified or SHA-256 hashed, no destination attachment contract is
implemented, and no authorized idempotent uploader exists.

Across the full 59-archive directory there are 134 asset blockers, many
documents containing tables/media/unsupported rich blocks, two intentionally
unexpanded ZIP attachments, and 165 repeated source IDs that require
cross-archive disposition before a combined import.

## Current Skipped Records

The 14 skipped records in the 33-record preview are the HTML detail pages under
the 14-row CSV database folder. `analyzeNotionExportArchives()` marks these as
`databaseRowPage`; `buildNotionMigrationManifest()` then marks them `skipped` to
avoid importing each row twice as both a database row and a document.

That skip is safe only when all meaningful row-page body content and attachments
are merged into the destination row. The current implementation does not perform
that merge, so executing today would silently lose row-page rich content and
attachment placement. The future importer must explain every row-page outcome
as `merged_into_row`, `imported_as_document`, or `explicitly_skipped`; a generic
`skipped` state is insufficient.

## Notion → ProveIt Mapping

| Notion entity/property | ProveIt entity/property | Transformation | Validation | Unsupported / risk notes |
| --- | --- | --- | --- | --- |
| Task database row | `tasks` document | Map title, description/summary, status, priority, assignee, due date; retain raw properties and provenance | Required title; supported status/priority; assignee currently eligible for workspace; valid date | Only databases explicitly classified/approved as tasks; imported tasks must keep Kaneo sync disabled |
| Meeting database row | `meetings` document | Map title, date/time, attendees, summary/notes, links | Valid time range; participant eligibility; workspace access | Do not create invitations or AI records unless explicitly specified for historical imports |
| Standalone HTML page | `documents` document | Convert only supported content to canonical document text; retain source HTML fingerprint and provenance | Workspace resolved; no material content loss; links/assets reconciled | Tables, embeds, forms, media, and unsupported rich blocks remain blocked until represented |
| Generic CSV database | `databases` document | Create approved property schema with deterministic property IDs | At least one title property; supported type; unique property IDs/names | Schema approval is required; do not reinterpret employee directories as user provisioning |
| Generic CSV row | `databases/{databaseId}/rows/{rowId}` | Store typed values keyed by deterministic property IDs; merge approved row-page body | Title/value validation; parent database committed; person/relation targets valid | Empty rows require explicit skip; current normalized keys alone are not stable enough |
| Title/name | Entity title or database title property | Trim, remove presentation-only emoji only when approved, preserve original raw value | Non-empty for destination types that require it | Never silently invent a title for an empty row |
| Status/select | Native enum or database select option | Use per-database value map; preserve original label/color metadata | Every observed value mapped or explicitly retained as raw | Values extend beyond task statuses: approval, payment, publication, time-off, and other domain states |
| Priority | Task priority or select property | Explicit value table to `low/medium/high/urgent` | Unknown values block or remain raw by decision | No fuzzy mapping during execution |
| Person/people | Firebase UID-backed person field | Match verified work email first, then unique full name; persist source identity and decision | Active employee; eligible workspace/Board scope; unique match | Names, nicknames, emoji prefixes, missing work emails, and manager relations need review |
| Reports To / attendees / reviewers | Person array or relation | Resolve each identity separately and preserve order | All targets valid or explicit deferred policy | Employee-directory `Reports To` is relational, not merely a flat person value |
| Date/time | Firestore timestamp/date representation | Parse with explicit locale/timezone and preserve raw text | Valid calendar value/range | Current name heuristic misses `DOB` and misclassifies fields containing `end`, `month`, or `time` |
| Number | Numeric value | Strict parse; preserve currency/unit separately | Finite number | Formatted phone numbers must stay text; never coerce to `NaN`/null |
| URL/email | URL/text/email field | Remove known Notion export URL wrappers only with a tested parser | Valid URL/email after normalization | Some exported email values are malformed `https://app.notion.com...` strings |
| Multi-select | String array plus option definitions | Parse using exported semantics, not whitespace guessing | Deterministic options; preserve original labels/colors | Current split handles only semicolon/pipe and would not correctly parse several real values |
| Relation/rollup-like CSV value | Relation property plus target IDs | Parse embedded link target/source ID, resolve after all entities exist | Target exists in same authorized migration scope; cardinality valid | Currently inferred as text or even date; would be lost as a real relation |
| Files/media and HTML asset links | Storage object plus attachment metadata | Reopen archive, verify signature/MIME/size, SHA-256 hash, upload after owner exists | Allowed type/size; referenced source exists; destination authorized | No uploader or attachment schema exists today |
| Internal page link | Canonical ProveIt entity URL/relation | Resolve source ID through completed import map | Unique resolved target; broken links reported | 1,926 links are currently only counted, not resolved |
| Created/edited timestamps | `originalCreatedAt` / `originalLastEditedAt` and provenance | Strict timestamp conversion | Valid source value; never overwrite server audit timestamps | Exported creator/editor identity is not automatically trusted as `createdBy` |
| Duplicate source ID | One selected record, kept-separate occurrence, or explicit skip | Compare normalized content/schema and persist operator disposition | No unresolved conflict; disposition applies to exact candidates | Batch fingerprint plus source ID is insufficient across overlapping archive selections |

## Required Import Pipeline

1. **Archive discovery:** select an explicit immutable archive set; record file
   names, sizes, and SHA-256 hashes without modifying source files.
2. **Parsing:** apply existing ZIP limits and produce a complete source catalog,
   including row-page associations and asset/link references.
3. **Normalization:** use schema-aware converters for each property. Preserve
   raw values beside normalized values and emit typed validation errors.
4. **Identity resolution:** resolve people to Firebase UIDs using verified work
   email or explicit BOD decisions. Never create employees from export rows.
5. **Workspace resolution:** resolve every root/database/page to an existing
   authorized workspace; validate current membership and Board restrictions.
6. **Schema/property mapping:** approve each database destination type, stable
   property ID, select options, date semantics, and native/custom/raw/skip choice.
7. **Relation resolution:** construct a global source-ID graph across all chosen
   archives, apply duplicate dispositions, and resolve relations/internal links
   only after destination IDs are reserved.
8. **Asset handling:** validate archive bytes, extension and actual MIME; hash;
   deduplicate; reserve deterministic storage paths; upload only after owner
   creation; record attachment state independently.
9. **Dry run:** build a persisted immutable manifest containing every source
   record and one explicit outcome. Dry run must use Firebase emulators or a
   dedicated non-production project during development.
10. **Validation:** require zero unexplained records, unresolved identities,
    unresolved relations, invalid schemas, or unapproved loss warnings.
11. **BOD approval:** bind approval to the exact manifest fingerprint, counts,
    resolution revision, target project, and approving UID. Any change revokes
    approval.
12. **Transactional/idempotent execution:** reserve deterministic destination
    IDs and import-record claims transactionally; execute in bounded chunks;
    never rely on client progress for correctness.
13. **Verification:** compare expected vs actual entities, fields, relations,
    assets, counts, hashes, and workspace access after every chunk and at batch
    completion.
14. **Reconciliation report:** report imported, reused, skipped, blocked, failed,
    and rolled-back/retryable records with source and destination references.

### Destination and migration control records

The importer should create normal domain records in `tasks`, `meetings`,
`documents`, `databases`, and `databases/{databaseId}/rows`. It may create
`activity` entries only under a documented migration policy that avoids noisy
notifications. Historical imports must not generate assignment/invitation email
or Kaneo mutations by default.

Add server-owned control collections such as:

- `notionMigrationBatches/{batchId}`: immutable manifest hash, target project,
  approval, counters, lease/state, timestamps, and verification summary.
- `notionMigrationBatches/{batchId}/records/{recordId}`: source identity,
  normalized hash, outcome/state, attempt/lease, destination reference, error,
  and verification result.
- `notionImportRegistry/{canonicalSourceKey}`: cross-batch source identity,
  selected occurrence, destination reference, and content hash for idempotency.
- `notionMigrationConfigs/{sourceFingerprint}`: retain the existing review
  decisions, but snapshot their revision into an approved batch.
- Asset upload records keyed by canonical source identity and content SHA-256.

No client write access should be granted to these control records.

## Safety Requirements

The implementation must:

- never mutate the source exports or trust filenames as storage paths;
- never silently discard records, row-page body content, relations, or assets;
- never import directly into production during development;
- support a reproducible, persisted dry run;
- be idempotent within a retry and across overlapping export batches;
- prevent duplicate entities with a canonical source registry;
- preserve source IDs, archive/path identity, raw fingerprints, and provenance;
- explain every skipped and blocked record with a stable reason code;
- validate target workspace existence, actor authority, and employee membership;
- validate every employee/person mapping and preserve unresolved raw identities;
- validate relations and internal links against reserved destination IDs;
- validate asset bytes, MIME, size, hash, owner, and attachment ordering;
- provide pre/post import counts and per-record verification;
- support lease-based safe retry after crash or partial failure;
- suppress Kaneo sync and ordinary notification fan-out for historical imports;
- redact personal information and document content from operational logs.

Rollback cannot mean deleting arbitrary destination content. Before execution,
define ownership markers on every created entity. A failed batch may delete only
entities still carrying that batch's unchanged creation marker and no subsequent
user edits. Otherwise reconciliation must stop and request a manual decision.

## Acceptance Criteria

`IMPORT LOCKED` may become `IMPORT READY` only when all of the following pass:

1. Parser tests cover every real extension, nested ZIP limit, zip-slip, archive
   limits, malformed CSV/HTML, source IDs, and the 59-archive inventory fixture.
2. Schema-aware property tests cover all observed real property names and values,
   including false-positive date/number cases, malformed exported emails,
   multi-selects, files, statuses, and empty rows.
3. Mapping tests prove tasks, meetings, documents, generic databases, rows, and
   employee-directory history target the correct domain type without provisioning
   employees or triggering integrations.
4. Person authorization tests cover exact email, unique name, ambiguity,
   inactivity, cross-workspace access, Board access, and explicit deferral.
5. Relation graph tests cover forward/back references, missing targets,
   duplicates, circular relations, parent/sub-items, and canonical link rewrite.
6. Asset tests verify MIME by bytes, size limits, hash deduplication, safe paths,
   owner-before-attachment ordering, retry, and orphan cleanup/reconciliation.
7. Duplicate tests cover all 165 current repeated IDs, identical export
   structure, conflicting content, multiple archive selections, and re-exported
   filenames without creating a second destination record.
8. Readiness tests prove every source item has one explicit outcome and that any
   unresolved/blocked/unexplained item keeps import locked.
9. Authorization/rules tests prove only a currently authorized BOD/server route
   can approve/execute and clients cannot mutate batch/import registries.
10. Idempotency tests run the same batch twice, crash after each write boundary,
    resume after lease expiry, and confirm exactly one destination per selected
    source occurrence.
11. Partial-failure tests prove bounded retry, no duplicate notifications/Kaneo
    calls, and safe rollback only for unchanged batch-owned records.
12. Emulator integration tests execute the exact 33-record employee-directory
    fixture and representative task, meeting, document, relation, duplicate,
    and asset fixtures; they verify counts, content, permissions, and provenance.
13. A full 59-archive dry run produces a signed-off reconciliation report with
    zero unexplained records and no production writes.
14. Production execution requires a separate explicit BOD approval bound to the
    immutable manifest and target project, plus a final confirmation showing
    exact create/reuse/skip counts.

## Next Multi-Agent Run

Use non-overlapping ownership in this order:

1. **Inventory/normalization agent:** freeze a sanitized real-export fixture,
   correct schema-aware property parsing, row-page association, and source graph.
2. **Mapping agent:** implement explicit task/meeting/document/database mappings,
   workspace/person validation, and lossless raw/provenance contracts.
3. **Relations/assets agent:** implement global relation resolution and the
   validated, hashed, idempotent asset pipeline against emulator storage.
4. **Execution agent:** implement server-only batch/record registries, leases,
   deterministic destination IDs, chunked writes, retry, and verification. Keep
   the production execute gate disabled.
5. **Security/testing agent:** add rules, authorization, idempotency,
   failure-window, rollback, and full real-inventory dry-run tests.
6. **UI/reconciliation agent:** connect immutable dry-run manifests, approval,
   progress, results, and recovery UX without making browser state authoritative.
7. **Fresh reviewer:** adversarially verify data-loss, duplicate, privacy,
   authorization, and production-target protections.
8. Only after every acceptance criterion is green should a separate change turn
   the production gate into a configuration-backed, BOD-approved `IMPORT READY`
   state. The first execution should still target an emulator/staging project,
   followed by manual reconciliation before any production authorization.
