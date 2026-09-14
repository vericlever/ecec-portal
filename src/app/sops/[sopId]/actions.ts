"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

type Result =
  | {
      ok: true;
      passed: boolean;
      attemptId: string;
      // Per-question right/wrong only - never which option was correct, so
      // a failed attempt still has to be reasoned through again on retry
      // rather than just clicking the now-known answer.
      results: { questionId: string; correct: boolean }[];
    }
  | { ok: false; error: string };

// Step 46. Grading happens here, never on the client - the client only ever
// sees { id, prompt, options }, never correct_option, so there is nothing to
// leak by reading the page source. Answers are matched back to each
// question's real correct_option and the full attempt (prompt, options,
// selected, correct) is logged either way, pass or fail - "the training
// signal", not just a pass/fail bit.
export async function submitComprehensionAttempt(
  sopId: string,
  answers: { questionId: string; selectedIndex: number }[],
): Promise<Result> {
  const me = await requireProfile();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const supabase = createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select("id, organisation_id")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop || sop.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Procedure not found." };
  }

  const { data: questions } = await supabase
    .from("comprehension_questions")
    .select("id, prompt, options, correct_option")
    .eq("sop_id", sopId);
  const rows = questions ?? [];
  if (rows.length === 0) {
    return { ok: false, error: "This procedure has no comprehension check to submit." };
  }

  const byId = new Map(rows.map((q) => [q.id as string, q]));
  // The answer set must exactly match the current question set - if an
  // editor added or removed a question mid-attempt, the client is stale.
  if (
    answers.length !== rows.length ||
    !answers.every((a) => byId.has(a.questionId))
  ) {
    return {
      ok: false,
      error: "The questions have changed since you started. Reload and try again.",
    };
  }

  let passed = true;
  const detail = answers.map((a) => {
    const q = byId.get(a.questionId)!;
    const correctIndex = q.correct_option as number;
    const isCorrect = a.selectedIndex === correctIndex;
    if (!isCorrect) passed = false;
    return {
      question_id: q.id,
      prompt: q.prompt,
      options: q.options,
      selected_index: a.selectedIndex,
      correct_index: correctIndex,
    };
  });

  const { data: attempt, error } = await supabase
    .from("comprehension_attempts")
    .insert({
      organisation_id: me.organisation_id,
      sop_id: sopId,
      profile_id: me.id,
      passed,
      answers: detail,
    })
    .select("id")
    .single();
  if (error || !attempt) {
    return { ok: false, error: error?.message ?? "Could not record the attempt." };
  }

  const results = detail.map((d) => ({
    questionId: d.question_id as string,
    correct: d.selected_index === d.correct_index,
  }));

  return { ok: true, passed, attemptId: attempt.id as string, results };
}
