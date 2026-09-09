// The NQS quality areas and the Child Safe Standards, as fixed reference data.
// The authoritative rows live in the `nqs_quality_areas` and
// `child_safe_standards` tables (seeded by migrations 0039 / 0040, and the FK
// target for the tag junctions). These arrays are the display copy, kept in
// step with those seeds by hand. Client-safe: no server imports.

export type TagOption = { id: number; code: string; name: string };

export const NQS_QUALITY_AREAS: TagOption[] = [
  { id: 1, code: "QA1", name: "Educational program and practice" },
  { id: 2, code: "QA2", name: "Children's health and safety" },
  { id: 3, code: "QA3", name: "Physical environment" },
  { id: 4, code: "QA4", name: "Staffing arrangements" },
  { id: 5, code: "QA5", name: "Relationships with children" },
  {
    id: 6,
    code: "QA6",
    name: "Collaborative partnerships with families and communities",
  },
  { id: 7, code: "QA7", name: "Governance and leadership" },
];

export const CHILD_SAFE_STANDARDS: TagOption[] = [
  {
    id: 1,
    code: "CSS1",
    name: "Culturally safe environments for Aboriginal children and young people",
  },
  {
    id: 2,
    code: "CSS2",
    name: "Child safety and wellbeing embedded in leadership, governance and culture",
  },
  {
    id: 3,
    code: "CSS3",
    name: "Children and young people are empowered about their rights and participate in decisions affecting them",
  },
  {
    id: 4,
    code: "CSS4",
    name: "Families and communities are informed and involved",
  },
  { id: 5, code: "CSS5", name: "Equity is upheld and diverse needs respected" },
  {
    id: 6,
    code: "CSS6",
    name: "People working with children and young people are suitable and supported",
  },
  {
    id: 7,
    code: "CSS7",
    name: "Processes for complaints and concerns are child focused",
  },
  {
    id: 8,
    code: "CSS8",
    name: "Staff and volunteers are equipped with knowledge, skills and awareness to keep children safe",
  },
  {
    id: 9,
    code: "CSS9",
    name: "Physical and online environments promote safety and wellbeing",
  },
  {
    id: 10,
    code: "CSS10",
    name: "Implementation of the Child Safe Standards is regularly reviewed and improved",
  },
  {
    id: 11,
    code: "CSS11",
    name: "Policies and procedures document how the organisation is safe for children and young people",
  },
];

export const MAX_QUALITY_AREAS = 2;
export const MAX_CHILD_SAFE_STANDARDS = 3;

export const qualityAreaById = new Map(NQS_QUALITY_AREAS.map((t) => [t.id, t]));
export const childSafeStandardById = new Map(
  CHILD_SAFE_STANDARDS.map((t) => [t.id, t]),
);

export type DocumentTagType = "policy" | "sop";
