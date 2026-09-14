# Staff dashboard design handoff — Task 28

Status: implementation visually approved by the user ("approved") on 2026-09-14.
The design handoff was approved on 2026-09-09.
Approval covers the supplied screens, shared treatments for uncovered routes and
states, Hebrew copy, scope differences documented below, and the final correction
that right-aligns field and table values across all pages.

## Supplied reference

- Approved source: [`export/index.html`](export/index.html).
- Originally supplied at `design/design_handoff_coffeeshop_mobile/admin/export/index.html`.
- SHA-256: `3f3de9ea730307b443f0891121be16c80a259423b9bd9f89a900b09bf1b61099`.
- One self-contained Claude Design HTML export, 706,905 bytes, with embedded
  runtime, font resources, static sample records, and interactive screen toggles.
  The user subsequently supplied 18 PNG screenshots under `screenshots/`; all
  were reviewed against the implementation. No editable source files were supplied.
- This is a staff reference even though its supplied path is inside the mobile
  handoff directory. The mobile handoff's palette and behavior do not override it.
- The approved export is preserved unchanged in this directory for the task
  commit. A file-specific Git whitespace attribute permits its original trailing
  spaces without relaxing checks for implementation files. The React application
  does not use the export runtime.
- Chromium captures were made at a 1440 × 960 desktop viewport. The export's
  phone toggle displays a simulated phone inside that desktop canvas; it is not
  evidence that the export itself responds correctly to a real phone viewport.
  Temporary review captures are in `/tmp/coffix-task28-reference-review/`.

## Screen inventory and existing route map

Every row below is approved as a design baseline. "Supplied" describes reference
coverage, not an accepted implementation or a supported production command.

| Reference screen | Supplied coverage | Existing route / approved Task 28 treatment |
|---|---|---|
| Overview | Desktop and phone | `/overview`: green revenue card, white metric cards, queue sections, today's appointments; retain existing authoritative metrics and their actual reporting period. |
| Product list | Desktop and phone | `/catalog`: desktop table and compact phone treatment, existing filters and pagination. |
| Categories | Desktop catalog tab | `/catalog/categories`: preserve category editor, no-icon option, legacy keys, and visual icon preview. Adapt the shared list/form design on phones. |
| Inventory | Desktop catalog tab | `/catalog/inventory`: retain total/reserved/available quantities, unlimited-stock display, polling, reason, expected quantity, and explicit adjustment confirmation. |
| Product editor | Desktop and phone; desktop failed save; static stale-edit warning | `/catalog/products/new`, `/catalog/products/:productId`: metadata and SKU forms, activation/featured controls, draft-preserving errors. Gallery controls belong to Task 29. |
| Order queue | Desktop; phone placeholder | `/orders`: preserve search, filters, pagination, and backend state codes. Use compact responsive list/table treatment on phones. |
| Order detail | Desktop; phone placeholder | `/orders/:orderId`: primary items/history region and supporting customer/payment/shipping sections; stack on phones. Preserve all current actions and confirmation requirements. |
| Service queue | Desktop; phone placeholder | `/service`: preserve search, filters, pagination, and allowed actions. |
| Service detail | Desktop diagnostic-payment wait; phone placeholder | `/service/:requestId`: primary description/pricing/notes region and supporting location/scheduling/payment/history sections; stack on phones. Preserve all other existing service states. |
| Calendar and scheduling | Desktop weekly-calendar mockup; phone placeholder | Existing scheduling stays in service detail; intake configuration stays at `/configuration/intake`; today's appointments stay in overview. The standalone weekly calendar is not an existing route and is outside Task 28. |
| People | Desktop; phone placeholder; permission-preview dialog in source | `/people`: translate/style the existing lookup and confirmed role/access changes. Task 31 owns the richer permission-review workflow. |
| Shop settings | Desktop and phone; shipping-change confirmation in source | `/configuration/shop`: use the reference section styling for the existing read-only address and shipping fee. Editable settings, contact fields and customer preview belong to Task 30. |
| Notification issues | Desktop; phone placeholder | `/operations`: translate/style existing delivery failures, attempts, retry eligibility and queued outcome. Rich recipient/message/related-record context belongs to Task 31. |
| Audit history | Desktop; phone placeholder | `/operations/audit`: translate/style existing server filters and available events. Rich actor/target/before-after presentation belongs to Task 31. |
| Technician workspace | Phone assigned-job cards; desktop placeholder | `/jobs`: reference card styling with existing assigned-only data and controls; responsive desktop grid. `/jobs/:requestId`: reuse service-detail sections restricted to the technician's permitted data/actions. |
| Login and OTP | Absent | `/login`: approved centered white card on cream, Coffix mark, Hebrew labels, existing phone/code steps and session behavior. |
| Machine models and service types | Absent | `/configuration`, `/configuration/service-types`: approved shared metadata cards, tables, selectors and forms; preserve service mappings, fees, icons/tags and existing save behavior. |
| Session restoration, denied access, not found | Absent | Approved shared Hebrew status/error panels with a permitted navigation action; retain current guards. |

The original export was inspected in desktop and simulated-phone modes, including
the failed-save state and refund dialog. The subsequent PNG review and changes
are recorded below. The user accepted the implemented screenshots on 2026-09-14,
after the cross-page right-alignment correction and its browser verification.

## Review of the 18 supplied screenshots

The user supplied these references on 2026-09-09 and requested a page-by-page
comparison and correction. The files are preserved unchanged, including their
original names. `image.png` is audit history; `calender.png` is the weekly calendar.
Dimensions below include any captured desktop chrome.

Each implemented page was checked for hierarchy, placement, typography, colors,
RTL reading order, and available actions. The shell now has a single visible page
title, catalog filters and tables share cards, metadata editors use supporting
columns, details use primary/supporting sections, and product saving uses a
sticky bottom bar. All phone routes use the same system; the new PNG set contains
no phone references. Native file selection remains keyboard accessible with
Hebrew button/filename copy.

User review correction: right-align labels and field/table values on every page,
including order numbers, SKUs, amounts, English metadata, phone and OTP inputs.
Text alignment is explicitly right; LTR direction isolation is preserved for the
characters themselves. This avoids `text-align: start` moving Latin values away
from their right-aligned column headers. The responsive browser matrix checks
alignment across every captured route/editor/state, in addition to text direction.

| Supplied screenshot | Dimensions | Reviewed implementation and remaining differences |
|---|---|---|
| [Overview](screenshots/home.png) | 2440 × 1315 | Four metrics, recent orders, attention list and today’s appointments. Counts come from the dashboard API; recent orders follow the existing updated-time sorting. Monthly trends and richer customer/appointment context are unavailable. |
| [Products](screenshots/products.png) | 2475 × 1260 | One filter/table/pagination card, product names, SKU/price/stock and activity badges. Product photography is Task 29; export has no existing command. |
| [Categories](screenshots/categories.png) | 2437 × 1296 | Table on the right and category editor on the left. Existing slug, sorting, activity, icon dropdown/preview and legacy keys remain supported. Images are Task 29. |
| [Inventory](screenshots/inventory.png) | 2455 × 1293 | Integrated filter/table card, total/reserved/available quantities and explicit stock adjustment confirmation. |
| [Order queue](screenshots/orders.png) | 2440 × 1239 | Compact filter/table card. Current search covers order number; customer names, phone and item summaries are absent from the queue API. |
| [Order detail](screenshots/specific_order.png) | 2449 × 1275 | Reference/status/action header; item totals and history in the main column, payment/address/shipment/refund in the supporting column. Current payment rules and full-refund confirmation are retained. |
| [Service queue](screenshots/services.png) | 2463 × 1069 | Integrated queue and filters. Customer/machine/urgency context in the reference is absent from the queue API. |
| [Service detail — upper](screenshots/specific_service1.png) | 2455 × 1292 | Customer/machine/reference header, state/urgency badges and payment wait notice; primary description/pricing and supporting scheduling/location sections. |
| [Service detail — lower](screenshots/specific_service2.png) | 2454 × 1279 | Pricing summaries, compact notes, supporting timeline and permitted actions. Scheduling and payment actions vary with real state and permissions. |
| [Product editor — upper](screenshots/add_product1.png) | 2433 × 1302 | Product details and SKU section on the right, publishing controls on the left. Gallery is Task 29. |
| [Product editor — lower](screenshots/add_product2.png) | 2450 × 1267 | Sticky bottom save bar, existing SKU editing and failure-preserved drafts. Product/SKU request bodies remain unchanged. |
| [Settings — address](screenshots/settings1.png) | 2448 × 1275 | Separate address and shipping sections with an explicit read-only status. Editing, contact details and preview belong to Task 30. |
| [Settings — shipping](screenshots/settings2.png) | 2451 × 1288 | Current shipping fee is shown as stored; no simulated editing or save outcome. |
| [People](screenshots/people.png) | 2459 × 1210 | Integrated filters/table, Hebrew role and activity badges, supporting access editor. Rich activity context belongs to Task 31. |
| [Permissions](screenshots/change_permissions.png) | 2425 × 1171 | Existing confirmation names the person and current/proposed role and access. Rich permission preview is Task 31. |
| [Notifications](screenshots/notifications.png) | 2467 × 1227 | Stacked failure cards with status, attempts, notice strip, technical details and eligible retry confirmation. Recipient/message context belongs to Task 31. |
| [Audit history](screenshots/image.png) | 2456 × 1206 | Filter/table card, translated event labels and expandable technical details. Human-readable actor/target context belongs to Task 31. |
| [Calendar](screenshots/calender.png) | 2446 × 1251 | No existing weekly-calendar route/API. Existing appointment preview/overlap confirmation and intake settings use the shared design. No calendar commands were added. |

The queue APIs currently return references, states, timestamps and limited totals
or assignment identifiers, rather than the full customer/machine context in the
reference. The application does not fetch every detail record to manufacture list
columns. Order search covers order numbers and service search covers references.
Overview reads four recent orders through the existing bounded queue endpoint,
sorted by last update; it still obtains authoritative counts and revenue from
`/admin/dashboard`. Technical identifiers remain available without copying sample
people, photos, payment methods, trends or queue badges from the design.

Local review artifact: `.local/task28-review/index.html` pairs every supplied
screenshot with the relevant implemented page or current scheduling alternative,
links phone captures, and contains all 99 captured routes and states. Generated
review captures are ignored runtime artifacts, not approved source assets.

## Approved visual system

Use the staff-specific token overrides near the end of the export's styles,
rather than its earlier generic red "Modernist" defaults.

| Element | Reference value / approved use |
|---|---|
| Page / surface / main text | `#F7F2E8` / `#FFFFFF` / `#1E1B16` |
| Primary / hover / stronger green | `#1F5138` / `#2A6547` / `#153A28` |
| Secondary accent / soft green | `#8A6A3B` / `#EDF4F0` |
| Neutral fill / border | `#F5F2EC` / `rgba(30,27,22,.12)` |
| Error / error fill | `#A63D2A` / `#FBEDE9` |
| Warning / warning fill | `#8A6A3B` / `#FAF2E2` |
| Typography | Heebo for Hebrew headings and body; system sans fallback; body 15px, navigation 14px semibold, heading approximately 21px bold, metrics approximately 30px bold. |
| Corner radii | 8px controls, 10px cards, 16px dialogs; pill status badges. |
| Shadows | Subtle card shadow; stronger dialog shadow from the export. |
| Desktop shell | White 252px right sidebar, green active navigation, sticky page header, approximately 28px main horizontal padding and 16–22px section gaps. |
| Phone shell | Full-width page with compact header and right-side navigation drawer; approximately 14–16px content padding. Omit the prototype's device bezel, status bar, and desktop/phone toggle. |
| Controls and tables | White bordered controls; real labels; clear focus ring; semantic tables within a bounded scroll region or equivalent labeled list treatment. Preserve all data and actions on phones. |

Approved accessibility adjustments: at least 44px primary touch targets, darker
secondary text where the reference's opacity is insufficient, native keyboard
navigation, dialog focus containment/return, Escape dismissal when idle, and
viewport-bounded dialogs. Desktop columns stack before becoming cramped; no
whole-page horizontal scrolling. The phone drawer shows only permitted routes.

## Approved missing-screen and state treatments

Reuse the supplied list, editor, detail, and dialog components for the uncovered
routes rather than inventing independent designs. All existing configuration
pages remain discoverable under Hebrew configuration navigation. Administrators
and technicians keep their separate route access; the prototype's role-preview
navigation does not become an account-role switcher.

| State | Approved presentation and preserved behavior |
|---|---|
| Loading / session restoration | Hebrew status text in the relevant card/page; no invented record values. |
| Empty / no filter matches | White bordered panel with a specific Hebrew explanation and an existing relevant action where available. |
| Failed load | Hebrew error banner with retry and an isolated support reference; no raw backend/provider English. |
| Saving / retrying / signing out | Hebrew busy label and disabled duplicate submission; success only after the existing API confirms the operation. |
| Failed save | Inline error beside the form/actions; retain draft field values. The prototype's "simulate failure" control is omitted. |
| Stale edit | Amber warning explaining that another update occurred; existing deliberate reload/discard flow. No automatic overwrite or unimplemented comparison/merge UI. |
| Permission denied / assignment revoked | Hebrew restricted-access message using existing guards/query behavior; no protected stale data or unauthorized links. |
| Confirmation | Record, amount where applicable, effect, explicit confirmation and cancellation; retain required reason and exact-reference entry. |
| Payment wait | Amber explanatory panel; actual commands continue to come from `allowed_actions`. |

The user approved applying these shared treatments together with the supplied
screens, followed by desktop/phone screenshot review of the real application.
A literal export transplant cannot satisfy Task 28 because its sample controls
and data differ from the live contracts.

## Approved Hebrew and mixed-direction decisions

- Navigation: סקירה כללית, קטלוג, הזמנות, בקשות שירות, הגדרות, אנשים והרשאות,
  התראות שלא נשלחו, יומן פעילות. Technician workspace: העבודות שלי.
- Shared actions: שמירה, ביטול, חזרה, ניסיון חוזר, טעינה מחדש, התנתקות.
  Distinguish cancellation of a dialog from ביטול הזמנה and ביטול בקשת שירות.
- Configuration: דגמי מכונות, סוגי שירות, הגדרות קבלת שירות, הגדרות החנות.
  Keep visible Hebrew and legacy English metadata fields without changing values.
- Terms: מק״ט for SKU, מספר סידורי, אסמכתה, דמי אבחון, הצעת תיקון,
  תיאום מועד, שיבוץ טכנאי, הערה פנימית, גלוי ללקוח, החזר מלא.
- Display roles as לקוח, מנהל, טכנאי; keep stored `customer`, `admin`,
  `technician` unchanged. Translate status/action names through explicit maps;
  do not translate submitted codes or derive Hebrew by changing underscores.
- Prefer the existing Hebrew service label. Preserve identifiers and legacy
  English record content, with automatic direction for mixed-language names.
- Set document `lang="he"` and `dir="rtl"`. Use logical CSS and explicit LTR
  isolation for phone, OTP, email, URL, SKU, serial, and reference values.
- Format ILS for Hebrew users and display dates/times in `Asia/Jerusalem`.
  Keep existing UTC audit-filter semantics explicit. Money remains integer
  agorot in all API bodies; labels must identify agorot inputs if retained.
- Safe unknown error: "לא ניתן להשלים את הפעולה. נסו שוב." Support label:
  "אסמכתה לתמיכה". Known API error codes receive specific Hebrew explanations.
  Raw error messages, stack traces, or provider output are not ordinary UI copy.

## Required scope differences from the prototype

- Overview: the current API supplies product revenue, state counts, pending and
  failed background events, and today's appointments. Do not relabel cumulative
  revenue as monthly, invent trends, compute authoritative counts from lists,
  or copy sample navigation badges and user names.
- Catalog: preserve existing SKU-level prices, metadata, and stock semantics.
  Do not add the mockup's export button, product-level base-price command, media
  controls, or omitted editor limitations. Image management belongs to Task 29.
- Orders: cancellation and full refund remain separate server-authorized actions.
  The export's paid-order "cancel and refund" shortcut does not replace them.
  Retain exact order-number entry, reasons, idempotent retries, and provider-
  confirmed refund outcomes; never copy its sample payment/card details.
- Service: retain diagnostic and additional-payment gates, quote confirmations,
  overlap preview with explicit continuation, reassignment reasons, permitted
  transitions, media authorization, and internal/customer note boundaries.
- Scheduling: retain the available scheduling and intake editors. A weekly
  calendar, arbitrary week navigation, and new aggregate overlap statistics are
  outside this numbered task and are not assigned to Tasks 29–31 by the plan.
- Settings: Task 30 owns edits to shipping/address/contact/opening hours.
  Task 28 shows the actual current read-only settings and explains that status.
- People/operations: Task 31 owns new permission-review and richer context
  workflows. Existing role confirmations, retry eligibility, filters, and audit
  information must remain available throughout the visual redesign.

## Verification and acceptance

The already-specified public test boundaries are the existing React components
and routed browser UI, with HTTP fixtures for visual states and existing real
local browser flows for commerce/service/session permissions. API request bodies,
authorization, drafts, and payment gates remain behavioral assertions, even when
language-dependent selectors change.

Follow Task 28's existing red/green steps in `docs/plan.md`: Hebrew/RTL shell and
safe errors first; shared controls and navigation next; existing screens next;
then desktop/phone state comparisons and functional browser regressions. Cover
keyboard focus, dialogs, dropdown/icon previews, mixed-direction data, busy and
stale states, and all mapped routes. Use intercepted fixtures or an isolated test
database; never delete pre-existing local records or media.

Run the admin component suite, focused login/commerce/service/permission/redesign
browser checks, admin lint/typecheck/build, generated-client typecheck, and
`git diff --check`. No backend change is planned. Final visual acceptance must
be recorded from the user's review of the implemented screenshots; acceptance of
this handoff alone does not complete that later plan step.

Approval record: user approved this handoff and its documented deviations on
2026-09-09. The user approved the final implementation on 2026-09-14 after review
and correction of right alignment across all pages.

## Implementation verification — 2026-09-09

- Admin components: 64 tests passed across 10 files.
- Chromium visual/state matrix: 19 tests passed; 99 captures cover 17 admin routes,
  technician jobs/detail and denial, login/OTP, session restoration, missing route,
  drawer, editors/icon previews, stale drafts, payment waits, schedule overlaps,
  confirmation focus/busy/failure and notification queued outcomes at 1440px/390px.
- Every capture was inspected directly or in contact sheets; detailed pages,
  changed layouts and uncertain details were also inspected at larger sizes.
- Existing real browser flows: all six login, commerce, service and permission
  scenarios passed against the isolated `coffix_task28_20260909` database, separate
  media directory and Redis database 15. The service/media flow was repeated after
  the Hebrew file-picker adjustment. No pre-existing records/media were removed.
- Admin lint, TypeScript/build, generated-client TypeScript, and `git diff --check`
  passed. No backend contract, dependency or migration changed.

## Final acceptance — 2026-09-14

The user explicitly approved completion of Task 28 after the implementation and
verification results were reported. This includes the final right-alignment
correction, with LTR reading order preserved for technical values, and the scope
differences recorded above. All Task 28 checklist items are complete in the task
commit. No backend contracts, dependencies, or later-task requirements changed.
