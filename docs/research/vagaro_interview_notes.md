# Vagaro Pro — User Interview Notes

**Participant:** Owner, mobile/multi-employee service business (barbering/detailing-adjacent — jobs are booked with variable crew size, "the guys" work jobs individually or in pairs). Current Vagaro Pro user.

## Competitors mentioned (names uncertain — transcription unclear, verify before citing externally)

- **"Mize"** (phonetic, unconfirmed spelling) — targets mobile businesses, detail shops.
- **"Rebarrel"** (phonetic, unconfirmed spelling) — targets gyms, salons, detailers, HVAC — broader horizontal field-service/wellness play.
- Participant **used a third, unnamed competitor for a few months and dropped it**. Reason: no persistent client profile — purchase/package history existed but lived in a general purchase log, not attached to the individual client's profile. (This was a complaint about the *competitor*, not Vagaro — Vagaro reportedly does this correctly.)

## How reporting is actually used

Primary use case: **payroll prep**, not business analytics.

- Revenue: top-line overall, and revenue **per employee**.
- Per-employee, per job: package booked, size/tier, price charged, tip, discounts applied.
- **Tips are tracked closely** — not for the owner's own tax purposes (owner doesn't retain tips), but to document the pass-through: proof the business collected a tip on a card and paid it out to the employee, since not all tips are cash.
- Business-level trend reporting: most popular packages, add-on attach/trend rates, viewable by week / total / trend.

## Payroll workflow — manual, bypasses Vagaro's built-in payroll entirely

1. Pulls per-job, per-employee data out of the Vagaro app by hand.
2. Re-enters it into a personal spreadsheet.
3. Applies a manual ~30% formula to calculate each employee's payout.
4. Adjusts by hand when a job was split across multiple employees or was a bigger/non-standard job.

**Why manual, despite Vagaro offering native payroll:**
- Never actually evaluated Vagaro's payroll feature — habit/comfort ("I'm so set in my way of doing it... it's just automatic. It's very simple.")
- Belief that automatic formulas can't flex for job splits or one-off adjustments the way a spreadsheet can.
- Assumes it's a paid add-on ("every fucking feature is a fee").

## Pricing/packaging sentiment (recurring theme)

Strong frustration with Vagaro's à la carte, per-feature and **per-employee** fee structure. Explicitly framed as a competitive opening: a flat, all-in fee with a fully-functional app out of the box would beat Vagaro's piecemeal pricing. Doesn't understand rationale for per-employee charges.

## Implications for the redesign / prioritization

- **Reporting & Payroll isn't currently one of the four priority flows in the audit** (Calendar, Checkout, Client Profile, Dashboard). This interview suggests it should be — real users are re-keying Vagaro data into spreadsheets by hand because the in-app payroll doesn't visibly support flexible commission splits on multi-employee jobs.
- Confirms (via a competitor's failure, not Vagaro's) that **profile-linked purchase/package history** is a make-or-break expectation for this user segment — worth stress-testing that Vagaro's own client profile actually surfaces this clearly, since the earlier review research also flagged profile/duplicate-account friction.
- Pricing structure isn't a UX/interaction problem, but it colors how "extra" features (like payroll) get perceived and adopted — worth a short callout in the audit even though it's outside pure interface redesign scope.
- New potential gap to validate: **no visible support for split commission on a single job across multiple employees.**

## Booking flow walkthrough (screen share, same participant)

Participant demoed booking a new job end-to-end from the calendar, which they described as "my main view every day."

**Flow as demoed:**
1. Tap a time slot on the calendar → **Book New Appointment**.
2. Search/add client — typed a name, selected the match, and the client's existing profile pulled in automatically.
3. A liability waiver e-signature popup appeared at this point (for potential vehicle/property damage disclosure). Participant didn't send it during the demo — unclear whether it's sent automatically on booking or requires a manual trigger. **Worth clarifying in a follow-up.**
4. **Select Service** — pulled from a self-built catalog of categories, packages, descriptions, and prices. Participant built 100% of this manually ("we manually put all of these in"). Not framed as a complaint, but it's real setup burden worth noting for onboarding.
5. Option to assign a *different* detailer to a specific service within the same appointment exists, but participant said they use it "point-zero-one percent of the time" — low-value for this user; possible candidate for progressive disclosure (hide by default, surface on demand) rather than removal.
6. **Deposit**: percentage-based (defaults around 50% of service price), manually adjustable up or down. UI behavior: the primary action button reads **"Book Appointment"** when the deposit is $0, and switches to **"Charge Deposit"** once a deposit amount is set. Participant called this out approvingly — noted as a good conditional-UI pattern already in the product.
7. **Checkout/payment options at booking time**: send an invoice, apply a gift card, charge a card on file, or manually key in card details (used when booking over the phone). Flexible, multiple paths — no complaints here.
8. Hitting **Book & Charge** finalizes it: sends client an email + text notification, sends the assigned staff member(s) a push notification, and the appointment appears on the calendar.
9. **No two-way confirmation step** — booking is one-directional. Client is notified, not asked to confirm/accept. Participant confirmed this is expected/fine for their business model (staff schedules on the client's behalf, doesn't rely on self-service confirmation).

**Gap found while editing a booked appointment:**
- Opening an already-booked appointment to edit it does **not** expose the "add a service / add-on" option that's available during initial booking — only price editing was available in the edit view. Participant flagged this as a real inconsistency ("usually you would have the option here to add [an add-on], but it doesn't give me any options"). **This is a concrete, specific bug/gap**: add-ons can be attached at booking time but not appended afterward via edit.

**Overall read:** the booking flow itself is functional and reasonably well-designed — deposit handling and flexible checkout paths were called out positively, with no major complaints. The one concrete new finding is the **missing add-on option on the appointment-edit screen**, which is narrower and more tactical than the five flows already prioritized in the audit. Manual catalog setup is a secondary onboarding-friction note, not a redesign priority.

*(Participant indicated there was more to walk through — "I do have one more" — transcript continues.)*
