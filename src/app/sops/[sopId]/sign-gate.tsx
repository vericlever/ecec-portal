"use client";

import { useState } from "react";
import { SignForm } from "./sign-form";
import { ComprehensionQuiz, type QuizQuestion } from "./comprehension-quiz";

// Step 46: a procedure with no questions renders exactly as it did before -
// SignForm directly, no visual trace of this feature at all. One with
// questions shows the quiz first; signing is unavailable until it reports a
// pass.
export function SignGate({
  sopId,
  needsManager,
  questions,
}: {
  sopId: string;
  needsManager: boolean;
  questions: QuizQuestion[];
}) {
  const [attemptId, setAttemptId] = useState<string | null>(null);

  if (questions.length === 0) {
    return <SignForm sopId={sopId} needsManager={needsManager} />;
  }

  if (!attemptId) {
    return (
      <ComprehensionQuiz sopId={sopId} questions={questions} onPassed={setAttemptId} />
    );
  }

  return <SignForm sopId={sopId} needsManager={needsManager} attemptId={attemptId} />;
}
