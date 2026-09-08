# Material Flow — MSME Supply Chain

A working UI for the design in `CONTEXT.md`: the five supply-chain stages of an Indian MSME
manufacturer as one product shell, with **Sourcing Desk** (the buyer's screen, SRC-01→04) and
**Line Watch** (the owner's floor view) as live dashboards over the §9 seed data.

```bash
npm install
npm run test        # 89 assertions — the §9 figures as regression targets
npm run typecheck
npm run build
npm run dev         # http://localhost:3000
```

Next.js App Router · TypeScript · Tailwind v4 · hand-built SVG charts. No database, no auth, no
API — every figure is computed client-side from the seed.

## The two rules that shape the code

**1. Every number on screen is derived and inspectable.** Nothing is stored as a display value.
Each calculation in `lib/domain/calc.ts` returns a `Derived<T>` carrying the §5 formula and its
substituted inputs, and `components/ui/Num.tsx` is the only component that renders a figure —
clicking any one opens the derivation. So "where does 620 come from" is answerable from the screen
for *every* number, with no per-number work.

**2. The system suggests, holds and recommends. It never places an order.** No action in the state
machine can send anything. Approve drafts a PO. "Ask vendor to split MOQ" drafts a message. The
guardrail holds a line and demands a written reason — override, never block — and every decision
lands in an append-only audit log with an actor, a reason and a timestamp.

## Three things §13 left open, closed from the data

**Valuation basis (§13-1).** The prototypes valued stock at the cheapest current quote, which §13
itself calls wrong. The right basis is recoverable: non-usable quantity × the recommended vendor's
base rate sums to **exactly the ₹29,308** §9.1 states, where landed cost gives ₹30,871.40 and the
cheapest quote ₹28,769.00. So the basis is **last purchase price, ex-freight**, applied everywhere
stock is valued — the Sourcing Desk tile, the inventory stock-truth table and Line Watch all call
the same function and cannot disagree.

**Line Watch unit rates (§9.2).** §9.2 quotes two totals but no unit rates. One consistent,
realistic rate set reproduces both exactly — ₹36,516 unusable and ₹7.60 L cash needed. Those rates
are in the seed and both totals are asserted.

**Lead time.** §5 calls it non-negotiable that lead time is the trailing average of the last six
*actual* receipts, never the vendor's quoted figure. Storing it as a scalar would fail that on the
document's most emphasised number, so 162 receipt records are seeded and every lead time on every
screen is derived from them.

Two further §13 items are surfaced rather than hidden: `CYCLE_DAYS = 15` and the flat 2.0-month
coverage ceiling are editable on the desk's **Policy & ceilings** tab, and moving them recomputes
the whole run. The differing supplier defaults between the two screens (§13-2) are a stated,
visible policy — the desk optimises on landed cost, Line Watch keeps the usual supplier.

Where §9.1's quoted rejection allowance disagrees with the §5 rule (8 of 27 quotes do), the
landed-cost inspector and the SRC-03 rejection figure both show the quoted value and the rule's
value and name the drift, instead of silently picking one.

Three dark-theme tokens — `--critical-soft`, `--warn-soft`, `--good-soft` — are not in §10's dark
block, which defines no soft colours. They are chosen so status pills keep their contrast on the
dark ground; without them the light softs would leak through.

Still open, and stated on the desk's Policy tab: unit conversion (§13-6) is not modelled, every
action is attributed to one demo buyer because there is no login, and safety stock is a per-item
given rather than recomputed from variance.

## Verifying it

`test/reconcile.test.ts` asserts the §9 figures against the same functions the UI renders: all nine
reorder points, quantities and statuses (MgO → `at_risk_late`, CM-TRB-2W held at 2.91 months with a
net need of 1,420), ₹4,55,100 across 3 POs, ₹29,308 non-usable, all 27 landed costs, 6 vendor flips
/ 3 confirms, and every Line Watch cover, job outcome and tile.

`/reports` runs the same checks live in the browser, so a broken formula goes red there before
anyone notices on a dashboard.

## Layout

```
app/                 routes — Overview, Reports, and the five stages
lib/domain/          calc.ts (§5 formulas, §6 status) · derive.ts · policy.ts · linewatch.ts
lib/seed/            §9.1 and §9.2 verbatim — raw facts only, no display values
state/               theme, audit log, derivation inspector
components/          shell · ui · charts · desk · linewatch · stage
```

The §10 palette lives once in `app/globals.css` as CSS custom properties with the three-way theme
rule, bridged to Tailwind with `@theme inline` — which keeps `var()` in the emitted utilities, so
switching theme is one attribute write and no React re-render. The categorical chart hues pass the
CVD validator in both modes; in light mode three fall below 3:1 against the surface, so every chart
ships direct labels and a value table.

---

*All figures are illustrative sample data prepared for demonstration. None of it is any client's
real trading data.*
