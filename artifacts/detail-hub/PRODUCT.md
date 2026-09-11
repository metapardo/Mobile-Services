# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are owners of mobile service businesses that take the work to the customer — mobile detailers, pressure-washing crews, mobile groomers, mobile repair/mechanic teams, and similar field-service operators who run their business from behind the wheel. The owner is typically also the technician doing jobs themselves or managing a small crew, not an enterprise fleet operator.

The product is grounded in a real, currently-operating mobile detailing business (interviewed directly) — its real workflows, tools, and figures are authoritative evidence for this product, not a hypothetical persona.

Secondary users are that business's employees/technicians — currently notification-only recipients in the live product (job assignment/status pushes). A scoped self-service employee login (paystubs, profile, time-off requests) is specified for a future phase (`docs/prds/PRD_DetailHub_Payroll_Module.md`) but not yet built.

## Product Purpose

Mobull is a mobile-first business management app for mobile service businesses. It replaces the fragmented combination of a generic booking/calendar tool, a separate POS app for taking payment, and a separate accounting tool for understanding true profitability, with one connected place to book jobs, manage clients/employees/service packages, take payment, run payroll, and see real financial health.

Success means the owner can see, before accepting a booking, whether a job is actually worth taking once real costs (gas, drive time, labor) are factored in — not just whether the calendar slot is open.

## Positioning

Category-standard booking tools treat scheduling as the whole problem: is the slot free. Mobull's differentiating mechanism is treating booking as a margin problem — it weighs a prospective appointment's location, job length, travel/drive time, and overhead against its price before the owner commits (the "Fuel Gauge" mechanism: "Gas, time, drive — know the real cost before you book"). A pure scheduling tool or a pure payments tool could not truthfully make this claim, since neither models the cost side of a mobile business's economics.

## Operating Context

- The grounding business runs on Vagaro (booking/payroll), Square Point of Sale (in-person card payments), and QuickBooks (accounting) today, disconnected from each other. Mobull's financial modeling (Sales Reporting, Financial Dashboard, payroll) is deliberately built to match the shape of that business's actual Vagaro Sales Summary exports and real QuickBooks P&L line items, not an invented reporting format.
- Work happens in the field, from a phone, between jobs — not primarily at a desk. The app is mobile-first even though the current platform is web.
- A separate native mobile app exists at `artifacts/mobile` (Expo/React Native) as an actively planned surface alongside this web app. It's a distinct target with its own scope and has not been initialized in Impeccable yet — do not assume this PRODUCT.md covers it.

## Capabilities and Constraints

- Core booking/calendar, client management, employee management, service packages, checkout/payment recording, and financial reporting are real and backed by a Postgres database, not mock data.
- Payment methods: Zelle, Venmo, and Cash are recorded as real, persisted payments. Credit card payment is deliberately NOT processed — no payment processor is connected, and the UI shows it as a disabled "Coming soon" option. Real card processing is an explicit future decision (Stripe vs. Square), not yet made.
- Payroll's "Net Payroll" figure is a simplified, clearly-labeled ESTIMATE (federal tax brackets + FICA/Medicare, no state/local tax, no W-4 nuance) — explicitly not real tax withholding, filing, or compliance. Building real compliant payroll tax logic in-house is an explicit non-goal; a third-party payroll processor is the intended path if/when that's needed.
- Reports' Monthly/Quarterly/Annual financial statements blend real data (revenue, real payroll-sourced labor cost, package mix, revenue by employee, accounts receivable) with fixed reference constants for costs with no real underlying ledger yet (overhead, materials/gas rate, depreciation, loan balance, owner's equity). This is a deliberate, current scope boundary, not a bug to silently fix.
- Organization/tenant isolation is enforced both at the application-query level and via Postgres Row-Level Security — every business's data is scoped to its own organization.

## Brand Commitments

- Product name: **Mobull** (a blue gradient wave/peak mark + lowercase "mobull" wordmark). This is the current, final brand identity going forward.
- "Rare Air" / "RareAer" is retired legacy branding from an earlier phase of this product — do not reintroduce or preserve it in new design work. The production domain is now mobull.app and shipped product code is clear of "RareAir" strings; only non-shipped docs (PRDs, agent instructions) still use the old name for historical reference, which is not a bug to fix.
- Visual identity: a dark "blue glass" glassmorphism aesthetic (translucent dark-navy panels, blur, blue/purple gradients), implemented via the internal `@workspace/blue-glass-design-system` package. This is the current, intentional design language — treat it as confirmed visual authority for refinement work, not an incumbent default to second-guess.

## Evidence on Hand

- `docs/prds/` and the root-level `PRD_*.md` files contain real sourced figures from the grounding business: a real Vagaro Sales Summary breakdown (tender-type mix), a real QuickBooks P&L (with the Vagaro platform fee and card transaction fee kept as separate lines), and reference screenshots of Vagaro's own payroll product UI used to scope the Team/Payroll section.
- No customer testimonials, press, or case studies exist for Mobull — do not fabricate any for marketing copy.
- Brand mark asset: `artifacts/detail-hub/src/assets/mobull-mark.png` (renamed from its legacy `rare-aer-mark.png` filename; same file, now correctly named). The marketing page (`src/pages/signup.tsx`) is the most complete current example of the visual language in production.

## Product Principles

1. Cost-awareness before booking, not just availability — the Fuel Gauge mechanism is the product's core differentiator; protect and extend it rather than diluting it into a generic scheduling feature.
2. Real data over mock/fabricated data wherever a real source exists; where no real system exists yet, be explicit about using a fixed placeholder rather than inventing false precision.
3. Never overstate compliance or financial guarantees the product doesn't actually provide (payroll withholding estimate, no real card processing yet) — accuracy of claims matters as much as functionality.
4. One connected place to run the business, replacing the fragmented booking-tool + POS + accounting-tool reality — coherence across sections is a product value, not just a UI nicety.
5. Field-first, mobile-first usage — design and interaction patterns should assume a phone, between jobs, not a desk-bound admin session.
