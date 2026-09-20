# PRD: Add-Client Parity (Clients Page + Booking Flow)

**Status:** Draft
**Owner:** Bob
**Last updated:** September 22, 2026
**Reviewers:** —

**Flag before you read further:** this message referenced "fields in the screenshot," but no image came through. Section on Assumptions covers what field set this PRD defaults to (the real `clients` schema) — confirm or correct before handoff.

## Summary

Two gaps, one fix: the Clients page (`clients.tsx`) has **no way to add a client at all** today — confirmed by reading the file, it's search-and-list only, no button, no form. The only place a client can currently be created is the booking flow's quick-add, and it deliberately collects just first/last name + phone. Recommendation: add a real "Add Client" entry point to the Clients page using the full field set the schema already supports, and route every client write — regardless of which screen it started on — through the same shared form and the same two mutations (`useCreateClient`, `useUpdateClient`) that already exist and already work correctly on `client-detail.tsx`'s Edit dialog.

## Problem

- **The Clients page can't create anything.** A business with zero clients, or one who wants to pre-load a client before ever booking them, has no path to do that from the page whose whole job is managing clients.
- **The booking flow's quick-add form already assumes a capability that doesn't exist.** Its own code comment says email/address are skipped because they can be "filled in later from the Clients page" — true only for editing an already-created client via `client-detail.tsx`, not for creating one with full details from the start. This PRD closes a gap the codebase already assumed was closed.
- **Two creation paths risk drifting apart.** Without a shared form/validation source, "add a client" from the Clients page and "quick-add" from booking could silently diverge in required fields, validation rules, or error handling — same underlying `clients` table, two different ideas of what a valid client looks like.

## Goals

- A client can be created directly from the Clients page, with the full field set the schema supports (name, phone, email, address, notes).
- The booking flow's add-client form gains access to the same full field set — not forced to full-length every time (see Alternatives), but no longer capped at name+phone only.
- Every client write, from either surface, goes through one shared validation/form path and lands in the same `clients` table via the same two existing endpoints (`POST /clients`, `PATCH /clients/:id`) — no parallel creation logic.
- Non-goals: duplicate-client detection/merge, bulk import, avatar/photo upload. None of these are what was asked for.

## Success metrics

- **Primary:** a client can be fully created (all five fields) from the Clients page in one flow, with zero code duplication between that form and `client-detail.tsx`'s existing Edit dialog (same shared component, not two hand-maintained copies).
- **Guardrail:** the booking flow's quick-add doesn't regress to a slower default — the fast, name+phone-only path from `PRD_Mobull_Appointment_Creation_Flow_Enhancement.md`'s minimalism goal stays the default interaction, with fuller fields available, not forced.

## Recommended solution

Extract a shared `ClientForm` component from `client-detail.tsx`'s existing Edit dialog (name, phone, email, address, notes — already validated, already wired to `useUpdateClient`). Reuse it in two new places: a new "Add Client" dialog/page on `clients.tsx` (wired to `useCreateClient`), and as an optional "add more details" expansion on the booking flow's quick-add (still defaulting to the fast first/last/phone-only path).

### Key flows / requirements

- [ ] `clients.tsx` gets an "Add Client" button (empty-state CTA when the list is empty, per the file's existing `hasNoClientsAtAll` branch, plus a persistent button once clients exist).
- [ ] New client form fields: name, phone (required — matches the schema's `notNull` columns), email, address, notes (optional — matches nullable columns). Same email-format validation already implemented in `client-detail.tsx` (`EMAIL_RE`), reused rather than reimplemented.
- [ ] Booking flow's quick-add (`booking-new.tsx`) keeps its fast default (first/last name + phone), but gains an optional expand/disclosure to the same shared form for email/address/notes when someone wants to add them at booking time, rather than always presenting all five fields up front.
- [ ] Both surfaces call the same generated hooks (`useCreateClient`/`useUpdateClient`) with the same request shape — no second client-creation function, no duplicated field-mapping logic.
- [ ] Confirm the new Clients-page create flow invalidates the same query keys the booking flow's quick-add already does (`getListClientsQueryKey()`), so a client created from either place shows up immediately on both screens without a manual refresh.

### Alternatives considered (and rejected)

| Option | Why rejected |
|---|---|
| Make the booking flow's quick-add always show all five fields | Directly undoes the deliberate minimalism from the earlier Appointment Creation Flow PRD, which explicitly cut this form down to first/last/phone to reduce friction mid-booking. An optional expand keeps both goals. |
| Build a separate, purpose-built form for the Clients page instead of sharing a component | Guarantees exactly the drift this PRD is trying to prevent — two forms, two validation rulesets, one schema. |

## Not doing (v1)

Duplicate-client detection or merge tooling — flagging as a real and growing risk once two creation surfaces exist (see Risks), but genuinely out of scope here. Bulk client import. Client photo/avatar.

## B2B SaaS considerations

- **Multi-tenancy:** no change — client rows are already RLS-scoped by `organizationId`, and both `POST /clients` and `PATCH /clients/:id` already enforce that via `requireOrgSession`.
- **Admin vs. end-user:** no role distinction exists on client CRUD today; this PRD doesn't introduce one.
- **API/integration surface:** none new — this is a frontend-only change reusing two endpoints that already exist and already work.
- **Migration path:** none — purely additive UI, no schema or data changes.

## Risks and open questions

- **No duplicate-client detection exists anywhere** (confirmed: `POST /clients` has zero dedupe logic against phone or name). Today there's only one creation surface, so this risk is latent; adding a second one makes it live — the same "John Smith" could get created twice from two different screens with no warning. Not fixing this now, but flagging it plainly rather than letting it be an unpleasant discovery later.
- **The exact field set is an assumption, not a confirmation** — no screenshot came through with this request. Defaulted to the real `clients` schema (name, phone, email, address, notes) since that's what's already proven out in `client-detail.tsx`'s Edit dialog. If the intended field set is different (e.g., separate first/last name as stored fields rather than a single combined `name`), this needs correcting before build.

## Assumptions

- Field set = name, phone, email, address, notes — the real schema's columns, pending the screenshot confirmation above.
- Extracting a shared `ClientForm` component from the existing Edit dialog is a small refactor, not a rewrite — the dialog's current implementation (fields, validation, mutation wiring) is treated as already correct and just needs to be reused, not redesigned.

## Rollout plan

- Single phase — Clients-page create, booking-flow expansion, and the shared-component extraction ship together, since splitting them would mean maintaining the old duplicated pattern in the interim.
- Sign-off needed: confirm the field set (screenshot) before backend/frontend work starts.

## Appendix

Relevant code: `artifacts/detail-hub/src/pages/clients.tsx` (no create UI today), `artifacts/detail-hub/src/pages/client-detail.tsx` (existing, working Edit dialog — the pattern to extract), `artifacts/detail-hub/src/pages/booking-new.tsx` (existing quick-add, name+phone only), `lib/db/src/schema/clients.ts` (schema: name/phone required, email/address/notes nullable), `artifacts/api-server/src/routes/clients.ts` (`POST /clients`, `PATCH /clients/:id` — both already correct, no changes needed there).
