// NQAITS Worker Register validation lists, for form dropdowns. Client-safe.
// Values are the exact register strings so import/export line up.

export const TITLES = [
  "Br", "Dr", "Fr", "Master", "Miss", "Mr", "Mrs", "Ms", "Sr", "Mx",
] as const;

export const AU_STATES = [
  "ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA",
] as const;

export const NQAITS_POSITIONS = [
  "Educator",
  "Volunteer",
  "Student",
  "Non-Educator Staff",
  "Early Childhood Teacher",
  "Co-ordinator",
  "Assistant",
  "Contractor",
] as const;

export const NON_EDUCATOR_ROLES = [
  "Bus Driver", "Centre Director", "Cook", "Cleaner", "Gardener", "Other",
] as const;

export const EMPLOYMENT_NATURES = ["Direct", "Indirect"] as const;

export const QUALIFICATION_TYPES = [
  "Certificate III", "Certificate IV", "Diploma", "ECT", "Degree", "Masters",
] as const;

export const SIGHTED_BY = ["Provider", "Nominated Supervisor"] as const;

export const TRAINING_TYPES = [
  "First Aid",
  "Anaphylaxis",
  "Asthma",
  "Child Safety",
  "Child Protection",
  "Other",
] as const;

export type TrainingType = (typeof TRAINING_TYPES)[number];

// Training types every worker is expected to hold; "Other" is optional.
export const CORE_TRAINING_TYPES: TrainingType[] = [
  "First Aid",
  "Anaphylaxis",
  "Asthma",
  "Child Safety",
  "Child Protection",
];
