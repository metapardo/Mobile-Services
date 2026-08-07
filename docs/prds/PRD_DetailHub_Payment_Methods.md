# Payment Methods — Product Requirements Document

**Status:** Draft v0.1
**Date:** August 6, 2026
**Owner:** Bob (Product)
**Platform:** Mobile Service Appointment Platform

---

## 1. Overview

This feature lets the business owner record and, where a real payment processor is connected, actually collect payment against a booking using four tender types: **Zelle, Venmo, Cash, and Credit Card**. It extends Checkout (already scoped in the master PRD) with a payment-method step, and extends every booking, the Sales Reporting use case, and the Financial Health Dashboard with a `payment_method` field so revenue can be broken out by how it was actually collected — the same tender-type breakdown already visible in the business's real Vagaro Sales Summary exports (Cash Sales, Sales - Venmo, Sales - Zelle, Sales - American Express, Sales - VISA, etc.) and its real QuickBooks P&L. This isn't a new reporting concept for the business; it's catching the product up to how the business already gets paid.

The four tender types split into two fundamentally different implementations, and that split drives most of this PRD:

- **Zelle, Venmo, Cash** are *recorded, not processed*. The money moves outside the app (bank transfer, P2P app, physical cash), and DetailHub's job is to let the owner mark a booking as paid via that method, with an optional reference note, for accurate reporting. No payment processor, no PCI scope, no API call to Zelle or Venmo is required for v1 — see Section 6.2 for why.
- **Credit Card** is *processed in-app*. This requires a real payment processor integration and is the one tender type with genuine engineering dependencies, covered in Section 8.

## 2. Problem Statement

The business already accepts Zelle, Venmo, cash, and multiple card networks — that's visible in its own sales data today. None of that is captured in DetailHub right now; the prototype's checkout flow (Section 3.1 of the master PRD) ends at a total due, with no way to record how the customer actually paid or to charge a card without a separate, disconnected tool (today, that's Square's own POS app, based on the owner's Square Point of Sale setup). This creates two problems:

- **Reporting is incomplete.** Sales Reporting and the Financial Dashboard can show revenue, but not payment-method mix, reconciliation against bank/Venmo/Zelle deposits, or which channel is growing or shrinking.
- **Checkout is fragmented.** Card payments currently happen in a separate app (Square) disconnected from the booking record, so there's no automatic link between "this booking" and "this card charge" — the owner has to manually match them.

## 3. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Capture how every booking was actually paid | % of completed bookings with a `payment_method` recorded | ≥98% within 30 days of launch |
| Reduce reconciliation effort | Owner-reported time spent matching payments to bookings at month-end | Qualitative, tracked via feedback |
| Enable in-app card collection | % of credit card bookings charged inside DetailHub vs. a separate POS app | ≥80% within 60 days of card processing launch |
| Keep card data out of scope for the business | PCI SAQ level required of the business | SAQ A (no raw card data ever touches DetailHub's servers) |

## 4. Non-Goals (v1)

- No direct API integration with Zelle or Venmo to auto-confirm receipt of a P2P payment — neither offers a general-purpose API for a third-party small-business app to trigger or confirm a peer-to-peer transfer in real time (see Section 6.2). v1 treats both as manually-recorded tender types.
- No support for partial/split payments across multiple tender types on a single booking (e.g., $50 cash + $100 card) — single tender type per booking in v1.
- No recurring/stored-card billing or saved payment methods on file for repeat customers — deferred to a future phase.
- No in-app dispute/chargeback management UI — handled through the processor's own dashboard (Stripe/Square) for v1; DetailHub only reflects the resulting status.

## 5. Users & Core Story

**Primary user:** Business owner or technician completing checkout at the end of a job.

**User story:** As the person closing out a booking, I want to record how the customer paid — Zelle, Venmo, cash, or card — and if it's a card, charge it right there in the app, so the booking, the payment, and my reporting all stay in one place instead of split across DetailHub and a separate POS app.

## 6. Product Requirements

### 6.1 Functional Requirements

| # | Requirement | Priority |
|---|---|---|
| FR-1 | Checkout presents four payment method options: Zelle, Venmo, Cash, Credit Card. | P0 |
| FR-2 | Selecting Zelle, Venmo, or Cash marks the booking as paid via that method, timestamps it, and allows an optional free-text reference note (e.g., last 4 of a Zelle confirmation, or "exact change"). | P0 |
| FR-3 | Selecting Credit Card, when a processor is connected (Section 8), opens a tokenized card-entry flow (card-present via reader, or card-not-present manual entry) and charges the amount due through the connected processor. | P0 |
| FR-4 | On successful card charge, the booking is marked paid with the processor's transaction ID stored for reconciliation; on failure, checkout shows the decline reason and returns to payment-method selection without marking the booking paid. | P0 |
| FR-5 | If no processor is connected yet, Credit Card is shown as "Coming soon — connect a payment processor in Settings" rather than a broken/dead option. | P0 |
| FR-6 | Every booking's `payment_method` and (for card) processor transaction reference are visible on the booking detail screen. | P0 |
| FR-7 | Sales Reporting and the Financial Dashboard (master PRD Sections 4 and 7) break out revenue by payment method for any selected period. | P0 |
| FR-8 | Refunds route back through the original payment method: card refunds call the processor's refund API against the original transaction; Zelle/Venmo/Cash refunds are recorded as a manual reversal note (money still moves outside the app). | P1 |
| FR-9 | Admin settings screen shows processor connection status (connected/not connected, which processor, last sync) and a disconnect/reconnect action. | P1 |
| FR-10 | Card reader pairing (for in-person tap/swipe/insert) is managed from Admin settings, independent of any individual booking. | P1 |

### 6.2 Why Zelle and Venmo Are Recorded, Not Processed

Neither Zelle nor Venmo offers an API that lets a small-business app like DetailHub programmatically request payment from a customer and receive real-time confirmation the way a card processor does:

- **Zelle** requires the business to enroll for "Zelle for Business" through their own bank, and payment confirmation happens inside that banking relationship — there isn't a public, general-purpose API for a third-party app to verify a specific incoming Zelle payment against a specific booking.
- **Venmo** does have a developer API, but it's exposed through PayPal's Checkout/Braintree platform for "Pay with Venmo" e-commerce buttons — built for online checkout redirect flows, not for a mobile technician marking an in-person or already-completed P2P payment as received against a specific job.

Building against either would mean real engineering dependency on a bank or PayPal integration for a benefit — auto-confirmation — that a manual "mark as paid + optional reference note" flow delivers today with zero integration risk. This mirrors what the business's own real Vagaro data shows: "Sales - Venmo" and "Sales - Zelle" are already just tender-type tags on a completed sale, not a live payment flow.

### 6.3 UX Requirements

- Payment method selection is a single screen at the end of checkout, after line items and total are confirmed — four large tappable options, matching the pattern in the master PRD's checkout flow (Section 3.1).
- Zelle/Venmo/Cash: selecting one immediately shows a confirmation state ("Marked paid via Zelle") with an optional note field; no additional screens.
- Credit Card: selecting it opens the card-entry step (reader prompt if a reader is paired, otherwise a manual card-not-present form), shows a clear processing spinner, and a success/decline state.
- Booking detail and the calendar view show a small payment-method badge/icon per booking so the owner can scan a day and see how each job was paid without opening it.
- Admin settings has a dedicated "Payments" section: processor connection status, card reader pairing, and (later) the two threshold-style settings other DetailHub features already use this pattern for (Gas Meter, Fuel Gauge).

## 7. Data Requirements

| Data | Source | Notes |
|---|---|---|
| `Booking.payment_method` | New field | Enum: `zelle`, `venmo`, `cash`, `credit_card`. |
| `Booking.payment_reference` | New field | Free text; confirmation code/note for manual methods, processor transaction ID for card. |
| `Booking.payment_recorded_at` | New field | Timestamp of when payment was marked/charged. |
| `Booking.refund_status`, `.refund_reference` | New fields | Mirrors payment fields for FR-8. |
| Processor connection (API keys/tokens) | New business setting, stored server-side only | Never exposed to the client; see Section 8. |
| Card reader pairing state | New business setting | Per-device, managed in Admin settings. |
| Processor transaction webhook payloads | Stripe/Square webhook | Source of truth for async charge/refund status changes. |

## 8. System Considerations — Dependency Features for Card Processing

Credit card is the one tender type that isn't just a UI addition — it depends on standing up real payment infrastructure before FR-3/FR-4 can ship. These are prerequisite features, not optional polish:

- **A connected processor account.** The business needs a Stripe or Square merchant account before any card can be charged. **Worth flagging directly:** the real business is already set up on Square Point of Sale (visible in its own onboarding activity), so Square is the lower-friction choice — no new merchant account or hardware to buy, and existing Square card readers may already be usable. Stripe would require a net-new merchant account and (if in-person tap/swipe is wanted) new reader hardware, but offers more flexibility if the business ever needs custom checkout flows Square doesn't support. This should be a deliberate decision, not a default — see Open Questions.
- **Tokenized card capture (never raw card data).** All card entry — reader or manual — must go through the processor's own SDK (Stripe Terminal + Elements, or Square's In-App Payments/Web Payments SDK), which tokenizes the card before it ever reaches DetailHub's backend. DetailHub's servers should never receive, log, or store a raw card number. This is what keeps the business at PCI SAQ A instead of a far heavier compliance burden.
- **A webhook listener.** Card charges are not always synchronous — DetailHub needs a backend endpoint that receives and verifies the processor's webhook events (charge succeeded/failed, refund processed, dispute opened) and updates the booking accordingly, rather than trusting only the client-side response.
- **Refund/void API integration.** FR-8 requires calling the processor's refund endpoint against the original transaction ID, not just marking a booking as refunded locally.
- **Card reader hardware and pairing flow**, if in-person tap/swipe/insert is in scope for v1 (recommended, since technicians are on-site) — Bluetooth pairing UI, per-technician or per-device reader assignment.
- **Reconciliation into Sales Reporting and the Financial Dashboard.** The processor's own transaction fees (interchange + a per-transaction fee, distinct from the flat Vagaro platform fee already modeled in the Financial Dashboard's Section 7) need their own cost line so the dashboard doesn't conflate a platform subscription fee with a card-processing fee — the business's real June P&L already keeps these separate (Vagaro Fee vs. Transaction Fee as distinct lines), and DetailHub's model should match that.

## 9. Edge Cases

| Case | Handling |
|---|---|
| Card charge is declined | Show decline reason from the processor; booking stays unpaid; owner can retry or fall back to another method. | 
| Owner selects Zelle/Venmo but the customer never actually sends the money | No system-level protection in v1 (no API confirmation exists) — this is a known risk of manually-recorded tender types, same as it is for the business today outside the app. |
| Card reader disconnects mid-transaction | Fall back to manual card-not-present entry rather than losing the checkout in progress. |
| No processor connected and owner taps Credit Card | Show "Coming soon" state (FR-5) with a direct link to Admin settings to connect one. |
| Refund requested weeks after a card charge | Still routes through the processor's refund API against the stored transaction ID, as long as it's within the processor's own refund window. |
| Booking is edited (add-on service) after payment is already marked | Payment record stays tied to the original amount; any additional amount due needs its own payment-method selection — no silent amount changes on an already-paid record. |

## 10. Phased Rollout

**Phase 1 (MVP):** Zelle, Venmo, and Cash as recorded tender types (FR-1, FR-2, FR-6, FR-7). No processor integration yet — Credit Card shows the "coming soon" state (FR-5). This alone closes the reporting gap in Section 2 and requires no new infrastructure.

**Phase 2:** Processor selection and connection (decision needed — see Open Questions), webhook listener, tokenized card-not-present entry (FR-3, FR-4, FR-9).

**Phase 3:** Card reader pairing and in-person tap/swipe/insert (FR-10), refund routing (FR-8).

**Phase 4 (future):** Saved/stored cards for repeat customers, split/partial tender types on one booking, subscription-style recurring billing for package customers.

## 11. Metrics & Instrumentation

- Payment-method mix over time (% Zelle / Venmo / Cash / Card), trended alongside the Financial Dashboard's existing revenue trend.
- Card decline rate and top decline reasons, once Phase 2 ships.
- Time from "booking marked complete" to "payment recorded," by method — a proxy for how much manual chasing cash/Zelle/Venmo payments still require versus the immediacy of a card charge.
- % of bookings still requiring the separate Square POS app after Phase 2 launches (should trend toward zero).

## 12. Risks & Open Questions

- **Processor decision risk:** Stripe vs. Square is a real architectural fork (different SDKs, different fee structures, different reader hardware) and should be decided before Phase 2 starts, not mid-build. Given the business is already on Square, that's the default worth validating first.
- **Reconciliation accuracy risk:** manually-recorded Zelle/Venmo/Cash payments have no system-level verification — a technician could mark a booking paid before the money actually arrives. Worth a lightweight owner-side daily reconciliation habit, not a system fix, since no API exists to close this gap (Section 6.2).
- **PCI scope risk:** any deviation from "always use the processor's own SDK for card capture" (e.g., a developer building a custom card form that touches raw PAN) would blow through SAQ A into a much heavier compliance tier — this should be an explicit engineering guardrail, not just a PRD note.
- **Open question:** should Phase 1 (manual tender types) ship independently and soon, decoupled from the Phase 2 processor decision, since it requires no new infrastructure and closes the reporting gap fastest?
- **Open question:** does the business want in-person tap/swipe/insert (needs a reader) in the first card-processing release, or is card-not-present manual entry sufficient to start, deferring hardware to Phase 3?
- **Open question:** who holds the Stripe/Square API keys and how are they rotated/stored — this needs an engineering decision (secrets manager, environment scoping) before Phase 2, not just a "store it somewhere safe" assumption.

## 13. Appendix — Payment Method Summary

```
Zelle    → recorded only, no API, manual reference note, no processor dependency
Venmo    → recorded only, no general merchant API fits this use case, manual reference note
Cash     → recorded only, always manual, no dependency
Credit Card → processed in-app, REQUIRES:
              - Stripe or Square merchant account (Square already in use by the business)
              - Tokenized capture via the processor's own SDK (never raw card data)
              - Webhook listener for async charge/refund status
              - Refund API integration
              - Card reader + pairing flow (if in-person capture is in scope)
              - Separate processing-fee cost line in Financial Dashboard, distinct from
                the existing Vagaro platform fee line
```
