import { ScenarioStatus } from "../types";

/**
 * `errored` is deliberately distinct from `protected`. A scenario the runner
 * could not start tells us nothing about the endpoint's defences, and folding
 * it into "blocked" would overstate coverage.
 */
export type RunOutcome = "executed" | "protected" | "errored";

export function getOutcome(status: ScenarioStatus): RunOutcome {
  if (status === "completed") return "executed";
  if (status === "failed") return "errored";
  return "protected";
}

/** A scenario the runner has finished with, whatever the verdict. */
export function isSettled(status: ScenarioStatus): boolean {
  return (
    status === "completed" ||
    status === "blocked" ||
    status === "mitigated" ||
    status === "failed"
  );
}

/** The five readiness grades `gradeFor` can return. */
export type Grade = "A" | "B" | "C" | "D" | "F";

/**
 * Grade tones. A, C, D and F reuse the semantic label steps off "Badge ·
 * Showcase · Dark" — success, caution, warning and error — so the grade reads
 * on the same scale as the severity chips. B sits on the brand light purple.
 */
export const GRADE_TONE: Record<Grade, string> = {
  A: "#00CC86",
  B: "#A289FC",
  C: "#FBBF24",
  D: "#FB923C",
  F: "#FE92A3",
};
