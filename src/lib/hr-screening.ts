// The exact wording of the pre-employment screening questions. When either
// question is answered, the current wording is snapshotted onto the
// worker_screening row, so re-wording a question here never rewrites what
// someone previously declared.

export const SCREENING_CHILD_PROTECTION_Q =
  "Have you ever been the subject of a child protection investigation, finding or disciplinary action relating to children?";

export const SCREENING_CRIMINAL_Q =
  "Do you have any current or historical criminal charges, convictions or findings relating to children or persons under 18?";
