# Draft privacy notice update - Step 58 (Onshore AI)

Status: draft, ready for David's review, then Zeke inserts as `platform_notices` version 2
(the current live version is 1, effective 14 September 2026). The notice text lives as data in the
`platform_notices` table (migration 0064), not in the codebase - this file is a proposal, not something
the app reads.

## Why this is needed

The current (version 1) notice's Schedule 1, clause 9 ("Where your information is stored") lists AWS/Supabase,
Vercel and Resend as service providers, but does not mention the AI Staff Q&A feature at all, even though it
was already live before this notice was accepted at first login. Before Step 58, Q&A questions and matched
policy/procedure text were sent to Anthropic's API and Voyage AI's API directly (not through AWS) - neither
disclosed.

## What Step 58 actually changed (revised 28 September 2026)

The original plan was to move both Claude inference and the search embeddings behind it onto AWS Bedrock -
"one supplier, one bill." That changed after live testing:

- **Claude inference moved to AWS Bedrock, Sydney and Melbourne.** Confirmed live: the `au.*` cross-region
  inference profile routes only within Australia (checked directly in the Bedrock console), no New Zealand
  routing.
- **Search embeddings stayed on Voyage AI.** Amazon Titan Text Embeddings V2 - the only Bedrock embedding
  model available in the Sydney region at all (Cohere Embed has no serverless listing there) - was tested
  against 20 real staff questions and missed retrieval on several, including a safety-critical one ("What do
  I do if a child has an allergic reaction?" never surfaced the Anaphylaxis Management Policy). Voyage found
  it correctly. Given the choice between full onshoring and reliable retrieval on safety-relevant questions,
  reliability won. See `BUILD_LOG.md`, 28 September 2026, for the full comparison.

So this update needs to do two things at once: disclose the new onshore AI processing, **and** disclose
Voyage AI as an ongoing external provider for the first time (it was never in the version 1 notice either).
Voyage only ever receives the text of a staff question and extracts of the organisation's own published
policies and procedures - never personal information about children, families or staff records - but it is
still an external provider outside the Australian boundary and needs disclosing on that basis.

## Proposed addition to clause 9's provider table

| Provider | Function | Location of your data |
| --- | --- | --- |
| Amazon Web Services (Bedrock) | AI processing: generates the Staff Q&A assistant's answers | Sydney and Melbourne, Australia |
| Voyage AI | AI processing: converts your question and the organisation's published policies/procedures into a searchable form, to find the relevant material before an answer is generated | Outside Australia (Voyage AI is a United States company) |

## Proposed new paragraph, after the provider table, before "Where a provider may access your information from outside Australia..."

> The Staff Q&A assistant works in two steps. First, the text of your question and the relevant extracts of
> your organisation's own published policies and procedures are converted into a searchable form by Voyage
> AI, a United States provider, to find the material that best matches your question. Second, an AI model
> hosted by AWS Bedrock in Sydney and Melbourne, Australia generates an answer from that material. Voyage AI
> never receives personal information about a child, family or staff member - only your question and your
> organisation's own published policy and procedure text. Your question and the answer given are logged
> against your account (clause 8 of Part A) so your employer can audit what the assistant was asked and told;
> neither provider retains or trains on this data.

## Notes on drafting choices

- Kept to the existing document's voice: short declarative sentences, defined terms already in use
  (Customer, Operator, platform), no new defined terms introduced.
- Did not touch clause 11 ("Automated decisions") - the Q&A assistant answers a question, it does not decide
  anything about a staff member's employment, so it doesn't newly trigger that clause. Worth a second look
  once Step 59's AI-suggested procedure links exist, since a manager still confirms every suggestion (spec
  decision 4), so the same reasoning should hold, but David should have final say.
- Not addressed here: Step 59's redaction pipeline (Textract/Comprehend, both ap-southeast-2 only) and
  outcome-record AI suggestions (Bedrock, same as Q&A generation) will need their own addition once that
  ships - flagged for a follow-up draft, not folded in here, since Step 58 and Step 59 verify independently
  (spec: "No real outcome data is uploaded until Step 58 is verified").
- **This draft changed materially on 28 September** from an earlier version that assumed Voyage would be
  removed entirely. If David reviewed that earlier version already, it needs a fresh look - the provider
  table and the new paragraph are both substantively different now that Voyage stays in the picture.
