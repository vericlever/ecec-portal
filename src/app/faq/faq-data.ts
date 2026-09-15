import type { ArchColour } from "@/components/bauhaus";

// Source copy: design_handoff_vericlever_site/vericlever-faq-draft.md,
// prepared 15 September 2026, regulatory positions current as at that date.
// Transcribed rather than paraphrased - this is compliance-facing content and
// the wording (including "reasonable steps", version binding, etc.) is
// deliberate. Update REVIEWED / NEXT_REVIEW together if the copy changes, and
// keep the JSON-LD in src/app/faq/page.tsx pointed at this same array so the
// visible page and the schema never diverge.

export const REVIEWED = "15 September 2026";
export const REVIEWED_ISO = "2026-09-15";
export const NEXT_REVIEW = "15 March 2027";

export type FaqBlock =
  | { t: "p"; md: string }
  | { t: "list"; ordered?: boolean; items: string[] }
  | { t: "callout"; label: string; md: string }
  | { t: "note"; md: string };

export type FaqEntry = {
  id: string;
  question: string;
  colour: ArchColour;
  body: FaqBlock[];
};

const CYCLE: ArchColour[] = ["blue", "amber", "vermilion", "green"];

const RAW: Omit<FaqEntry, "colour">[] = [
  {
    id: "policy-vs-procedure",
    question: "What is the difference between a policy and a procedure?",
    body: [
      {
        t: "p",
        md: 'A policy states what your service commits to and why. A procedure states who does what, in what order, and how it is recorded. The Education and Care Services National Regulations require both, and Regulation 168 refers throughout to "policies and procedures" as a pair rather than as one document.',
      },
      {
        t: "p",
        md: "The practical test is the audience. A policy is a governing document. Families read it, the approved provider approves it and it rarely changes. A procedure is an operating document. Educators work from it, it changes whenever practice changes and it is the thing a staff member should have in front of them during an incident.",
      },
      {
        t: "p",
        md: 'Most services conflate the two, and it shows up in exactly one place: assessment and rating. An authorised officer who asks how a policy is implemented is asking to see the procedure. If the policy is a fourteen-page document that ends with "staff will follow this policy", there is nothing to show.',
      },
      {
        t: "callout",
        label: "Worked example",
        md: "Sleep and Rest is a mandatory policy category under Regulation 168(2)(a)(v). The policy states the service's commitment to safe sleep practice and the evidence base it relies on. The procedure states that a named educator checks each sleeping child at ten-minute intervals, records the check on the sleep chart, and what to do if a child is found in an unsafe position. The policy is approved once a year. The procedure changes the week you change cot placement.",
      },
    ],
  },
  {
    id: "reg-170",
    question: "What does Regulation 170 actually require?",
    body: [
      {
        t: "p",
        md: 'Regulation 170 requires the approved provider to take reasonable steps to ensure that educators, staff members and volunteers follow the service\'s policies and procedures. It does not define "reasonable steps", and this is the single most commonly misread obligation in the framework.',
      },
      {
        t: "p",
        md: "Having the policy is not a reasonable step. Emailing it is not a reasonable step. A reasonable step is one you can evidence after the fact. In practice a regulator will test three things: that the person had access to the current version, that the person engaged with it, and that the provider did something when they did not.",
      },
      {
        t: "p",
        md: "The gap this opens is that most services can prove the first and none of the second or third.",
      },
      {
        t: "callout",
        label: "Worked example",
        md: "Two services both hold a current Delivery and Collection of Children Policy. Service A emailed it to all staff in February. Service B records that each staff member opened the current version, acknowledged it against a named date and time, and holds a report showing which staff had not completed it at thirty days along with what the director did about those three people. Only Service B has evidence of reasonable steps. Both have the policy.",
      },
      {
        t: "p",
        md: "Vericlever exists because that second record is laborious to keep by hand and the reason services fail this obligation is not unwillingness, it is administration.",
      },
    ],
  },
  {
    id: "prove-staff-read",
    question: "How do I prove that staff have actually read a policy?",
    body: [
      {
        t: "p",
        md: "You need three records, not one: that the staff member accessed the version current at that moment, that they acknowledged it at a recorded date and time, and that the acknowledgement is tied to a specific version rather than to the document in general.",
      },
      {
        t: "p",
        md: 'The third is the one most systems miss. A signature against "the Emergency and Evacuation Policy" is worth very little, because the policy has been revised twice since. A signature against version 4.2, published 11 March 2026, is evidence. Version binding is what converts a sign-off into a compliance record.',
      },
      {
        t: "p",
        md: "A comprehension check strengthens this further, because reading and understanding are different claims and only the second is what Regulation 170 is really reaching for.",
      },
      {
        t: "callout",
        label: "Worked example",
        md: "An authorised officer asks how you know your educators understand the anaphylaxis procedure. A sign-in sheet from a staff meeting shows attendance. A version-bound acknowledgement shows that fourteen of fourteen educators acknowledged version 3.1 within the required window. A comprehension result shows that all fourteen answered three questions correctly, and that two of them needed a second attempt. The third record answers the question that was actually asked.",
      },
    ],
  },
  {
    id: "mandatory-categories",
    question: "Which policies and procedures are mandatory?",
    body: [
      {
        t: "p",
        md: "Regulation 168(2) sets out the mandatory categories. As at September 2026 they are:",
      },
      {
        t: "list",
        items: [
          "**(a)** Health and safety, covering nutrition, food and beverages and dietary requirements, sun protection, water safety, administration of first aid, and sleep and rest",
          "**(b)** Incident, injury, trauma and illness, complying with Regulation 85",
          "**(c)** Dealing with infectious diseases, per Regulation 88",
          "**(d)** Dealing with medical conditions in children, per Regulation 90",
          "**(e)** Emergency and evacuation, including the matters in Regulation 97",
          "**(f)** Delivery of children to, and collection from, the service, per Regulation 99",
          "**(g)** Excursions, per Regulations 100 to 102",
          "**(ga)** Transportation of children other than as part of an excursion",
          "**(gb)** Safe arrival of children, per Regulation 102AAB",
          "**(h)** Providing a child safe environment, including promoting a culture of child safety and the safe use of online environments",
          "**(i)** Staffing, including a code of conduct, determining the responsible person, and participation of volunteers and students",
          "**(j)** Interactions with children, per Regulations 155 and 156",
          "**(k)** Enrolment and orientation",
          "**(l)** Governance and management of the service, including confidentiality of records",
          "**(m)** Acceptance and refusal of authorisations",
          "**(n)** Payment of fees and collection of unpaid fees",
          "**(o)** Dealing with complaints, including child focused complaint handling and responding to harmful sexual behaviour",
        ],
      },
      {
        t: "p",
        md: "Paragraph (gb) is new and is the category most often missing from an otherwise complete library. Paragraphs (h) and (o) were both expanded by the 2026 reforms, and a document written before 2026 will usually cover the old scope only.",
      },
    ],
  },
  {
    id: "safe-arrival",
    question: "Do we need a Safe Arrival of Children policy?",
    body: [
      {
        t: "p",
        md: "Yes, if any child in your care travels between your service and another education or early childhood service. Regulation 168(2)(gb) makes it a mandatory policy category and Regulation 102AAB sets out what it must contain.",
      },
      {
        t: "p",
        md: "This is the category most commonly absent from an otherwise complete policy library, usually because the obligation is recent and because services assume their Safe Transportation Policy covers it. It generally does not. Transportation covers the journey. Safe arrival covers confirmation that the child reached the destination, and what happens when that confirmation does not come.",
      },
      {
        t: "p",
        md: "Regulation 102AAB also requires the approved provider to consult service staff, parents of enrolled children and, where appropriate, the children themselves, when establishing the procedures. Regulation 102AAC requires a risk assessment for the purposes of these policies and procedures.",
      },
      {
        t: "callout",
        label: "Worked example of the full chain",
        md: "Regulation 168(2)(gb) requires the policy. Regulation 102AAB sets what the policy must establish. Regulation 102AAC requires the supporting risk assessment. The policy commits the service to confirming arrival for every child who travels. The procedure names who telephones the receiving school, by what time, what is recorded, and the escalation if arrival is not confirmed within fifteen minutes. Every educator who does school runs acknowledges that procedure by version. The risk assessment is reviewed when the route or the receiving service changes. That is five linked artefacts from one regulation, and a gap at any point breaks the chain.",
      },
    ],
  },
  {
    id: "review-frequency",
    question: "How often do policies and procedures need to be reviewed?",
    body: [
      {
        t: "p",
        md: "The National Regulations do not set a review frequency. This surprises most providers, and it is the reason review practice across the sector is so inconsistent.",
      },
      {
        t: "p",
        md: "What the framework does require is that policies and procedures are current and that families are consulted on changes that affect them. In practice this produces an annual review cycle as the working standard, with three event triggers that override the calendar: a regulatory change, a serious incident or complaint that touches the document, and a change in service practice.",
      },
      {
        t: "p",
        md: "The event triggers matter more than the annual cycle. A twelve-month review schedule will leave a policy wrong for up to twelve months after a regulation changes, and 2026 has had five separate commencement dates.",
      },
      {
        t: "callout",
        label: "Worked example",
        md: "A service reviewed its Reportable Conduct Scheme Policy in November 2025 and scheduled the next review for November 2026. On 23 February 2026 the administering body in Victoria changed. For nine months that policy directed staff to notify the wrong organisation, in the document they would reach for in the worst possible moment. An annual cycle did not fail here. The absence of a regulatory change trigger did.",
      },
    ],
  },
  {
    id: "reg-172-notice",
    question: "When do we have to tell families about a policy change?",
    body: [
      {
        t: "p",
        md: "Regulation 172 requires at least 14 days written notice to families before a change that will have a significant impact on the provision of education and care, on the family's ability to use the service, or on the fees charged or the way they are collected.",
      },
      {
        t: "p",
        md: "Two practical points. First, the obligation attaches to the approved and final version, not to a draft or an internal edit. Second, the judgement of what is significant sits with the approved provider, and the safer reading is broad. A change to sleep and rest practice affects care. A change to the complaints process affects the family's ability to use the service.",
      },
      {
        t: "p",
        md: "The record you need afterwards is not the policy. It is proof that notice went to the affected families, when it went and to which version it related.",
      },
      {
        t: "callout",
        label: "Worked example",
        md: "A service revises its Payment of Fees Policy to change the late payment process. That is a change to the way fees are collected, so Regulation 172 applies. Notice must go out at least 14 days before the change takes effect, and the service should be able to produce, a year later, the list of families notified and the date. In Vericlever this notification is generated from the approval event itself rather than being remembered separately, because the common failure is not refusal to notify, it is a policy that was approved and published without anyone triggering the notice.",
      },
    ],
  },
  {
    id: "signoffs-on-revision",
    question: "What happens to staff sign-offs when a procedure is revised?",
    body: [
      {
        t: "p",
        md: "A sign-off is evidence about a specific version, so revising the procedure does not carry the sign-off forward. If version 3 is replaced by version 4, every acknowledgement against version 3 remains valid evidence about version 3 and tells you nothing about version 4.",
      },
      {
        t: "p",
        md: 'This is where most manual systems quietly fail. A spreadsheet with a column headed "Anaphylaxis procedure: signed" will show a green tick for a staff member who signed a document that no longer exists.',
      },
      {
        t: "p",
        md: "The operational question that follows is how long staff have to acknowledge the new version. The regulations do not set a period, so the provider sets one, and the setting should reflect risk. A change to a medical or emergency procedure is not a thirty-day item.",
      },
      {
        t: "callout",
        label: "Worked example",
        md: "A service revises its Asthma Procedure on 3 March. Twenty-two educators had acknowledged the previous version. On publication, all twenty-two acknowledgements become historical records and twenty-two new acknowledgements fall due. A service that treats this as a new obligation is compliant. A service that treats the original tick as still valid has an evidence base that quietly decayed, and will not discover it until an incident or an assessment.",
      },
    ],
  },
  {
    id: "child-safety-training",
    question: "Who has to complete the national child safety training, and by when?",
    body: [
      {
        t: "p",
        md: "Everyone working or volunteering in an NQF-regulated service. The requirement commenced on 27 February 2026 and the training is delivered in two tiers.",
      },
      {
        t: "p",
        md: "**Foundation modules (courses 1 and 2)** apply to everyone. Existing workers appointed before 14 August 2026 had until 27 August 2026. Anyone appointed after that date must complete them before they start working directly with children or within 14 days of being employed, whichever comes first.",
      },
      {
        t: "p",
        md: "**Advanced modules** depend on role. Nominated supervisors and persons in day-to-day charge complete the full set. Staff working directly with children complete courses 3 and 4. Persons with management or control complete course 5. Those in a relevant role before 30 September 2026 have until 31 March 2027. Those starting after 30 September 2026 have three months from appointment.",
      },
      {
        t: "p",
        md: "Refresher training is required every two years.",
      },
      {
        t: "callout",
        label: "Two things services get wrong",
        md: "The requirement covers volunteers and students, not just employees, and many policies scope it to employees only. And the record you need is not a certificate in a folder. It is a completion date tied to a named person, tested against their appointment date, which is a different thing and is the part no filing cabinet does.",
      },
    ],
  },
  {
    id: "worker-register",
    question: "Who goes on the National Early Childhood Worker Register?",
    body: [
      {
        t: "p",
        md: "Everyone employed, engaged or appointed by the approved provider or the service, including through labour hire, who performs a role at an approved service. That is broader than most services assume.",
      },
      {
        t: "p",
        md: "The registrable list includes educators, early childhood teachers, nominated supervisors, coordinators, assistants, non-educator staff, regular volunteers and students or trainees on placement. Visitors are excluded.",
      },
      {
        t: "p",
        md: 'The cohort most often missed is non-educator staff. Cooks, cleaners, drivers and administrative staff are registrable. A policy that describes the obligation as applying to "staff members, educators, students and volunteers" will read as complete and will still leave the cook off the register.',
      },
      {
        t: "p",
        md: "Providers must update the register within 14 days when a worker starts, leaves, changes roles or changes their details. The approved provider remains responsible for accuracy even where the function is delegated.",
      },
      {
        t: "note",
        md: "Note: Western Australia has not made the Worker Register mandatory. Confirm your jurisdiction's position.",
      },
    ],
  },
  {
    id: "personal-phones",
    question: "Can educators carry personal phones while working with children?",
    body: [
      {
        t: "p",
        md: "No, not in centre-based services while working directly with children. This changed on 27 February 2026. Images and recordings may only be captured on a service-supplied or service-authorised device.",
      },
      {
        t: "p",
        md: "The part services miss is that the prohibition is not absolute in the way many policies were rewritten to say. The framework allows limited authorised exceptions, and those exceptions have to be recorded in a register of authorised device use.",
      },
      {
        t: "p",
        md: "An absolute ban is easier to supervise, and plenty of services adopted one deliberately. The difficulty is that it leaves no compliant answer for an educator who needs to be contactable on an excursion, and it does not match the structure of the obligation, which an authorised officer will be reading against.",
      },
      {
        t: "callout",
        label: "Worked example",
        md: "A service with an absolute ban takes four-year-olds to a local farm. The educator needs a phone for the return journey and for emergencies. Under an absolute ban the educator is either non-compliant with the policy or unreachable. Under the framework as written, the excursion is an authorised exception, the authorisation is recorded in the register of authorised device use before departure, and the record closes when the group returns. Same practice, and only one version is defensible.",
      },
      {
        t: "p",
        md: "A register of service-owned devices is a different document and does not satisfy this. Check which one you actually hold.",
      },
    ],
  },
  {
    id: "evidence-at-assessment",
    question: "How do we evidence policy implementation at assessment and rating?",
    body: [
      {
        t: "p",
        md: "By producing the chain, not the document. An authorised officer testing Quality Area 7 is not asking whether the policy exists. They are asking whether it governs what happens in the room.",
      },
      {
        t: "p",
        md: "The chain that answers this has five links: the regulation that requires the policy, the current approved policy, the procedure that operationalises it, the record that staff acknowledged that procedure by version, and evidence that the provider acted when someone did not. Produce all five and the question is answered. Produce the first two and you have shown a filing system.",
      },
      {
        t: "p",
        md: "The 2026 amendments strengthened the child safety focus in Quality Areas 2 and 7 from 1 January 2026, which means documents written before that date were assessed against a different standard than the one now applied.",
      },
      {
        t: "callout",
        label: "Worked example",
        md: "Asked how the service ensures its Child Safe Environment Policy is implemented, a director opens the policy, then the three procedures that sit under it, then a report showing acknowledgement status by staff member and version, then the two follow-up records for the educators who were overdue in June. That takes about ninety seconds. Assembling the same answer from a shared drive and a signature folder takes about a week, which is why most services answer the question with the policy alone.",
      },
    ],
  },
  {
    id: "vic-ssr-vecra",
    question: "Victoria: who do we notify now, the CCYP, the SSR or VECRA?",
    body: [
      {
        t: "p",
        md: "It depends on the obligation, and the answer changed on 23 February 2026.",
      },
      {
        t: "p",
        md: "**The Social Services Regulator (SSR)** now administers the Child Safe Standards, the Reportable Conduct Scheme, the Working with Children Check and the Worker and Carer Exclusion Scheme. These functions previously sat with the Commission for Children and Young People. Reportable conduct notifications go to the SSR within 3 business days of becoming aware of a reportable allegation, with the investigation outcome provided within 30 calendar days of that initial notification.",
      },
      {
        t: "p",
        md: '**VECRA, the Victorian Early Childhood Regulatory Authority,** is the early childhood regulator. Serious incidents and complaints under the National Law go to VECRA through the NQA IT System within 24 hours. Where a Victorian ECEC document says "the Regulatory Authority", it means VECRA.',
      },
      {
        t: "p",
        md: "The two obligations can both be triggered by a single event, and they run on different clocks to different bodies.",
      },
      {
        t: "callout",
        label: "Why this one matters more than it looks",
        md: "Any policy written before February 2026 that names the CCYP is now wrong, and it is wrong in a document staff reach for under pressure. If you review nothing else this year, review every document that names a notification recipient. In our own library this correction touched seven documents.",
      },
    ],
  },
  {
    id: "vic-child-safe-standards",
    question: "Victoria: how do the Child Safe Standards interact with NQF policies?",
    body: [
      {
        t: "p",
        md: "They are separate obligations that cover overlapping ground, and satisfying one does not satisfy the other. Victoria's eleven Child Safe Standards apply to organisations that work with children, including ECEC services, and sit alongside rather than inside the National Quality Framework.",
      },
      {
        t: "p",
        md: "The practical consequence is that a document can be complete under Regulation 168 and still leave a Child Safe Standards gap, most often on cultural safety, on empowering children to participate, and on making complaint processes child focused.",
      },
      {
        t: "p",
        md: "Both obligations are now overseen in Victoria by the Social Services Regulator, which since 23 February 2026 holds the Child Safe Standards, the Reportable Conduct Scheme and the Working with Children Check together.",
      },
      {
        t: "callout",
        label: "The mapping problem",
        md: "Because the two frameworks are structured differently, a policy library organised by Regulation 168 categories cannot be read against the eleven standards without tagging each document against both. Services that maintain the mapping in a spreadsheet find it is accurate on the day it is written and wrong within a quarter. Tagging documents against both frameworks at the document level, so that coverage reports and orphan reports generate from the library itself, is the difference between knowing your coverage and believing it.",
      },
    ],
  },
  {
    id: "policy-procedure-chain",
    question: "What does a complete policy-to-procedure chain look like?",
    body: [
      {
        t: "p",
        md: "Five links, each with a named owner and a record. Using mandatory child safety training as the example, because it is current, contested and touches every service in the country:",
      },
      {
        t: "list",
        ordered: true,
        items: [
          "**The obligation.** National child safety training became mandatory on 27 February 2026 for everyone working or volunteering in an NQF-regulated service.",
          "**The policy.** The service's governance policy states the commitment, the scope covering employees, volunteers and students, and the two-year renewal.",
          "**The procedure.** A named person checks completion at appointment, records the date, tests it against the 14-day rule for new starters, and escalates at day ten rather than day fifteen.",
          "**The record.** Completion dates per person, tied to appointment dates, queryable as a single report rather than reconstructed from certificates.",
          "**The response.** Evidence of what happened when someone did not complete it, because an obligation with no consequence on the record is not an implemented obligation.",
        ],
      },
      {
        t: "p",
        md: "Most services have links one and two. Many have three. The chain breaks at four and five, and those are the two links a regulator asks for.",
      },
      {
        t: "p",
        md: "This is the shape of every obligation in the framework. Once you can see it, a policy library stops being a document collection and starts being a set of chains that are either intact or broken. That reframing is the whole of the work.",
      },
    ],
  },
];

export const FAQ_ENTRIES: FaqEntry[] = RAW.map((entry, i) => ({
  ...entry,
  colour: CYCLE[i % CYCLE.length],
}));

export const CLOSING_NOTE =
  "This page covers the National Quality Framework as it applies across Australia, with Victorian specifics marked. It is general information about regulatory obligations and is not legal advice. Regulatory positions stated here were verified against ACECQA, VECRA and the Education and Care Services National Regulations on 15 September 2026.";
