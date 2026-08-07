# PRD Double Diamond — Agent Pipeline

Nine subagents that implement the double-diamond PRD process: **start with the goal, discover in parallel, write, stress-test in parallel, bring it together.**

Use this pipeline when you need broad discovery, one strong draft, and multiple critical reviews before calling a PRD final — not for a quick one-pager.

## Install

Drop the nine `.md` files from this folder into your project's `.claude/agents/` directory (create it if it doesn't exist). Claude Code will pick them up as named subagents automatically. `00-README-orchestration-guide.md` itself is not an agent — it's this guide.

## Working files

The agents read and write a shared trail of markdown files in a `prd-work/` folder in your project, so the pipeline is auditable and you can stop and resume at any stage:

```
prd-work/
  01-goal.md
  02a-analytics-findings.md
  02b-user-research-findings.md
  02c-stakeholder-input.md
  03-draft-prd.md
  04a-adversarial-engineering.md
  04b-adversarial-risk.md
  04c-adversarial-completeness.md
  05-final-prd.md
  05-changelog.md
```

## How to run it

You (or whoever is driving Claude Code) act as the orchestrator — invoke each agent via the Task/Agent mechanism, in this order. Steps marked **parallel** should be fired as multiple simultaneous agent calls in a single message, not one after another — that's the entire point of the fan-out.

| Step | Agent(s) | Mode | Depends on |
|---|---|---|---|
| 1 | `prd-goal-definer` | Solo | Whatever raw input you have — a rough ask, a ticket, an exec email, meeting notes |
| 2 | `prd-analytics-researcher`, `prd-user-researcher`, `prd-stakeholder-liaison` | **Parallel** | `01-goal.md` |
| — | *(you merge)* | — | Confirm all three `02*` files landed before moving on |
| 3 | `prd-writer` | Solo | `01-goal.md` + all three `02*` files |
| 4 | `prd-adversarial-engineering`, `prd-adversarial-risk`, `prd-adversarial-completeness` | **Parallel** | `03-draft-prd.md` |
| — | *(you merge)* | — | Confirm all three `04*` files landed |
| 5 | `prd-finalizer` | Solo | `03-draft-prd.md` + all three `04*` files |

Total: one solo step, one parallel fan-out, one solo synthesis, one parallel fan-out, one solo synthesis. Five "moments," nine agents.

## Why these three lenses at each fan-out

**Discovery (2A/2B/2C)** deliberately covers three different evidence types so the PRD isn't built on one kind of input alone: what the numbers say (analytics), what users say (research), and what the business says (stakeholders). These often disagree — that's expected and useful, not a bug to resolve early. The PRD writer is the first place they get reconciled.

**Stress-test (4A/4B/4C)** deliberately covers three different failure modes: can we actually build it (engineering), what could go wrong (risk/business), and is the document itself complete and internally consistent (completeness). A PRD that survives all three is in much better shape than one that only got a single read-through.

## Model choices

`prd-writer` and `prd-finalizer` are set to a stronger model (`opus`) since they're the two synthesis steps where reconciling conflicting inputs well matters most. The six research/critique agents are set to `sonnet`. Adjust to your own cost/quality tradeoff — nothing here is load-bearing.

## What these agents don't do

None of these agents can ask you clarifying questions mid-run — they're non-interactive, single-shot tasks. When an agent hits a genuine ambiguity, its job is to write it down as an explicit open question in its output file, not guess silently or stall. You resolve open questions between stages, or let them ride through to the final PRD's own Open Questions section if nobody's blocked on them.
