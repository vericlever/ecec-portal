# Handoff: Vericlever public site — landing page, sign-in, visual language

## Overview
Vericlever is a multi-tenant B2B SaaS compliance and staff-management portal for Australian ECEC providers. This handoff covers the **public-facing marketing site** (landing page + sign-in) and the **visual language system** that ties it to the existing portal. The core idea the visuals carry: policy → procedure → training → outcomes is one unbroken chain, drawn as one ring made of four coloured quarters.

Out of scope: any portal screen, workflow or data structure. Naming is still pending trademark clearance, so avoid baking "Vericlever" into complex logo lockups.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy directly. The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, etc.) using its established patterns, component library and routing — or, if no front end exists yet, to pick the most appropriate framework and implement them there.

## Fidelity
**High fidelity.** Colours, type, spacing, geometry and copy are final-intent. Recreate closely. The one deliberate placeholder: form submission, auth and all links are non-functional.

## Design language in one paragraph
Crisp Bauhaus. Pure white ground, near-black ink, thick black rules dividing structural regions, flat geometry doing all decorative work — no gradients, no shadows, no photography, no rounded corners. Concentric thin arcs (always **three** rings per mark) are the recurring motif. Four accent colours, one per chain stage, used only as identifiers.

## Design Tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| paper | #FFFFFF | page and card background |
| ink | #1A1A17 | text, rules, borders |
| ink-muted | #45423A | body copy |
| ink-faint | #6B6659 | labels, meta |
| policy blue | #1F51A8 | stage 1 |
| procedure amber | #C98A0E | stage 2 (use #9A6A08 for small text on white) |
| training vermilion | #C8451F | stage 3 |
| outcomes green | #1B7A3E | stage 4 **and the brand accent** (buttons, links, eyebrows) |
| green hover | #166533 | primary button hover |
| dark ground | #1A1A17 | consultancy section |
| on-dark body | #C9C4B6 | body copy on dark |
| on-dark green | #6FBF8B | eyebrow on dark (contrast-safe) |
| inactive | #1A1A17 @ 18% opacity | unfinished chain links |

Contrast rule: on the dark ground, blue and vermilion must be lightened (#6E9BE8 / #E8825E) — their light-ground values fail contrast on #1A1A17.

### Type
- Display / UI: **Jost** (Google Fonts), weights 300/400/500/600/700.
- Meta / data: **IBM Plex Mono** 400/500 — used ONLY for small factual notes (dates, "Reg 97 · NQS 2.2", the footer domain line).
- Eyebrows and category labels: Jost 600, uppercase, letter-spacing 0.24em (13px) or 0.16–0.2em (12px). These replaced mono labels — do not revert them to mono.
- H1: clamp(38px, 5.2vw, 60px), weight 600, line-height 1.03, letter-spacing -0.025em.
- H2: 40–42px, weight 600, line-height 1.08, letter-spacing -0.02em.
- Card title: 21px/600. Body: 17px/1.5. Small body: 15px/1.5.

### Line weights (the Bauhaus rules)
- Header bottom rule: 10px solid ink.
- Section dividers: 4px solid ink.
- Card borders: 2px solid ink, with a 10px coloured top border for stage cards.
- Sign-in page vertical divider: 10px solid ink (left border of the right panel).
- SVG arc strokes: 8px at 340 viewBox, 6px at 100, 3.4px at 32/40.

### Spacing / layout
- Max content width 1240px, page padding 40px.
- Section vertical padding 84px top / 90px bottom.
- Grid gaps: 64px between major columns, 24px between cards, 48px heading↔intro.
- No border radius anywhere. No shadows anywhere.

## The chain motif (core system)
Each stage is the **same ring at a different degree of completion**, always drawn as three concentric arcs:
| Stage | Geometry | Colour |
|---|---|---|
| Policy | quarter arc (0°→90°, top-right) | #1F51A8 |
| Procedure | half arc (0°→180°, over the top) | #C98A0E |
| Training | three-quarter arc | #C8451F |
| Outcomes | full closed ring + filled centre dot | #1B7A3E |

Combined hero mark: one ring of three concentric circles, split into four 90° quadrants coloured blue (top-right), amber (bottom-right), vermilion (bottom-left), green (top-left), with a small centre disc split into the same four quarters in the same orientation. SVG geometry, 340×340 viewBox, radii 150/126/102, stroke 8, centre disc r=16.

Logo mark (nav/footer): three concentric quarter-arcs anchored at the bottom-left corner plus a small filled dot at the origin, in green only. 40×40 viewBox, radii 10/18/26, stroke 3.4, dot r=2.8. Wordmark: "VERICLEVER" Jost 600, 16px, letter-spacing 0.2em, ink.

Inactive/incomplete links are the same geometry at ink 18% opacity — never a different shape.

## Screens

### 1. Landing page (`Vericlever Landing Page.dc.html`)
Sticky header, then five sections separated by 4px black rules.

**Header** — sticky, white, 10px black bottom rule, 20px/40px padding, max 1240px. Left: logo mark + wordmark. Right: How it works / Policies & procedures / Consultancy / Contact / Sign in (separated by a 1px left divider, 30px pad) / green CTA "Book a walkthrough" (11px 20px padding, white text). The right group wraps as a unit at narrow widths; links never shrink (`flex: none`, `white-space: nowrap`), gaps clamp(14px,2vw,30px).

**Hero** — two columns, `repeat(auto-fit, minmax(440px, 1fr))`, 64px gap, collapses to one column under ~1000px.
- Eyebrow "FOR AUSTRALIAN ECEC PROVIDERS" (green caps).
- H1 "Policy, procedure, training and evidence — one unbroken chain."
- Body: "Vericlever takes your service from policy to outcomes, tracking the work you do easily and systematically, making you inspection ready, every day."
- Buttons: green solid "Book a walkthrough", ink outline "See how it works" (15px 26px padding).
- Mono footnote: "Software built by the industry for the industry."
- Right: the four-quadrant hero ring, max-width 420px, centred.

**How it works (#chain)** — H2 "Four links. We hold them together for you." + intro. Then four stage cards in `repeat(auto-fit, minmax(290px,1fr))` (2×2 at tablet widths, 4-up at desktop). Each card: white, 2px ink border, 10px coloured top border, 28px padding; 64px arc icon, "01 / POLICY" caps label, title, description.

**Two tiers (#tiers)** — two columns (minmax 440px). Left: eyebrow "TWO TIERS, ON PURPOSE", H2 "Policies carry the obligation. Procedures carry the work.", body, three dashed list items. Right: a specimen card ("Emergency evacuation", mono reg reference) with four rows separated by 1px rules — each row is a 28px arc icon + title + meta + a coloured caps stage label right-aligned.

**Status table** — H2 "The whole service, one screen." + intro, then a bordered table with columns Topic / Policy / Procedure / Training / Evidence and three example rows; completed links are coloured arc glyphs (26px), incomplete are the same glyphs at 18% ink. Horizontal scroll allowed on narrow widths.

**Consultancy (#consultancy)** — full-bleed dark (#1A1A17) band, two columns. Eyebrow "WHERE SOFTWARE STOPS" in #6FBF8B, H2 "Judgement is not a feature.", body in #C9C4B6, white "Talk to a consultant" button. Right: two arch motifs (green, amber) sitting on a light horizontal rule.

**Contact (#contact)** — eyebrow "SEE IT ON YOUR OWN MATERIAL", H2 "Thirty minutes, your own policies on screen, no slide deck.", body, two buttons ("Book a walkthrough", "Send a question"), and a two-colour arc composition on the right. **No pricing anywhere on the site — deliberately out of scope.**

**Footer** — 4px black top rule, logo + mono "vericlever.com.au · Victoria, Australia", links How it works / Consultancy / Privacy / Contact.

### 2. Sign-in (`Vericlever Sign In.dc.html`)
Full-height, white both sides, split by a **10px black vertical rule** (left border of the right panel). Header: logo (links home) + "Not set up yet?" + outlined "Book a walkthrough", 10px black bottom rule.

**Left (form)** — max 620px, centred. Eyebrow "SIGN IN", H1 "Are you already VeriClever?" (note the internal capital C in this headline only), sub "Sign in to your service's portal."
Fields: Work email, Password — caps mono-free labels, white inputs with 2px ink borders, 15px/16px padding, 17px Jost, no radius, green 2px focus outline. Row: "Keep me signed in on this device" checkbox (accent-color green) + "Forgot password" link. Primary green button full width (17px 26px, hover #166533). "OR" divider with 1px rules. Secondary outlined button "Email me a sign-in link". Below a 4px black rule: help text with an "ask us" link.

**Right (context panel)** — eyebrow "INSIDE THE PORTAL", statement "Every procedure your team signs closes a ring — and stays closed until something changes.", the four-quadrant ring (max 380px), and a four-column legend above a 4px black rule: POLICY/The obligation, PROCEDURE/The practice (label #9A6A08), TRAINING/The knowledge, OUTCOMES/The evidence.

### 3. Portal page — Procedures empty state (`Vericlever Portal Procedures.dc.html`)
Shows how the public visual language carries into the logged-in product. **The portal itself is already built — this is a styling reference for backgrounds and page furniture only, not a redesign of portal structure or navigation.**

- Header: white, 10px black bottom rule, logo + wordmark, inline nav (Overview / Procedures / Policies / Manage) with the active item marked by a 3px amber underline, right side shows account name + role and a 2px-bordered "Sign out".
- Page body: white, with a **large decorative arc field** filling the empty area — a set of concentric quarter arcs anchored at the bottom-right corner (blue → amber → vermilion, moving inward) plus a smaller green quarter at the bottom-left. Drawn in a `position: absolute; inset: 0` SVG at `preserveAspectRatio="xMaxYMax slice"`, stroke-width 14, **opacity 0.14**, `pointer-events: none`. Content sits above it with `position: relative`.
- Content: amber eyebrow "PROCEDURES", H1 "Standard operating procedures", then an empty-state card (white, 2px ink border, 10px amber top border) explaining that procedures are issued by job role, with "Request a job role" (green) and "Browse policies" (outlined) actions, and a 200px ring showing only the policy quarter complete — the other three quarters at ink 18%.
- Below: a four-column status strip (POLICY / PROCEDURE / TRAINING / OUTCOMES) with 4px coloured top rules and a one-line state under each.

**Background motif rules (apply anywhere a page has large empty area):**
- Always concentric arcs, three per colour group, corner-anchored — never centred, never scattered.
- Opacity 0.13–0.14 against white. Never above 0.2; the motif must never compete with text.
- Stroke weight scales with size: ~12–14 at full-page scale.
- Colour order follows the chain outward-in (blue, amber, vermilion, green).
- Always `pointer-events: none`, always behind content in a relative-positioned wrapper.
- The landing page's contact section uses the same treatment at bottom-left (green then blue, opacity 0.13).

### 4. Visual language exploration (`Vericlever Visual Language.dc.html`)
Reference only — not a shippable page. Contains the earlier motif explorations (1a radiant arcs, 1b linked rings, 1d colour candidates) and the symbol-system options (2a four primitives, 2b the ring-completion set that was chosen). Useful for understanding why the system is what it is, and as a source of background/divider patterns.

## Interactions & Behavior
- All in-page nav links are anchor jumps (#chain, #tiers, #consultancy, #contact).
- Buttons: primary green → #166533 on hover; outlined → invert to ink fill on hover is acceptable but not specified.
- Links: green (#1B7A3E) default, ink on hover.
- Sign-in: no auth wired. Expected real behaviour — email+password submit, magic-link request, forgot-password flow, error state under the relevant field (ink text with a vermilion 2px left rule is the suggested treatment), disabled/loading state on the primary button.
- Responsive: single-column below ~1000px; header nav wraps to a second row; status table scrolls horizontally; H1 is fluid via clamp.
- No animation is specified. If motion is added, keep it to short linear/ease-out fades — nothing bouncy.

## State Management
Marketing pages are static. Sign-in needs: email, password, rememberMe, submitting, error. The status table on the landing page is illustrative static data; in the portal the equivalent component would take `{ topic, policy, procedure, training, evidence }` where each stage is complete | incomplete.

## Assets
No bitmap assets. Every graphic is inline SVG built from circles and arcs — reproduce as components (`<StageArc stage="policy" size={64} />`) rather than copying markup. Fonts: Jost and IBM Plex Mono from Google Fonts.

## Screenshots
`screenshots/` contains reference captures of the built designs:
- `landing-full.png` — landing page, top of page
- `01-landing.png` … `04-landing.png` — how-it-works, two tiers, consultancy, contact sections
- `05-sign-in.png` — sign-in page
- `06-portal-procedures.png` — portal procedures page with background motif
- `01-visual-language.png` … `04-visual-language.png` — symbol system (2a primitives, 2b ring completion) and the earlier arc/colour explorations

Screenshots are captured at preview width — treat the HTML files as the source of truth for exact measurements.

## Files
- `Vericlever Landing Page.dc.html` — landing page
- `Vericlever Sign In.dc.html` — sign-in page
- `Vericlever Portal Procedures.dc.html` — portal page styling reference (backgrounds, empty state)
- `Vericlever Visual Language.dc.html` — motif and symbol-system exploration
- `Vericlever_Claude_Design_Brief.md` — the original brief

Each HTML file is a self-contained design component: markup lives inside `<x-dc>`, all styling is inline, no build step. Open directly in a browser to view.
