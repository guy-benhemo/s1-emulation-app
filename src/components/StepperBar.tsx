import { Scenario } from "../types";
import { getOutcome, isSettled } from "../utils/verdict";

interface StepperBarProps {
  scenarios: Scenario[];
  runQueue: string[];
}

/** Done steps sit on a flat colour, the running step on the ramp (A3–A5). */
const DONE_FILL: Record<string, string> = {
  executed: "var(--color-guardz-pink)",
  protected: "var(--color-brand-green)",
  errored: "#FFFFFF4D",
};

export default function StepperBar({ scenarios, runQueue }: StepperBarProps) {
  return (
    <div className="flex gap-1.5">
      {runQueue.map((id) => {
        const status = scenarios.find((s) => s.id === id)?.status ?? "ready";

        const style = isSettled(status)
          ? { backgroundColor: DONE_FILL[getOutcome(status)] }
          : status === "executing"
            ? { backgroundImage: "var(--gradient-bar)" }
            : { backgroundColor: "#A289FC26" };

        return (
          <div
            key={id}
            className="h-1.5 flex-1 rounded-full transition-colors duration-300"
            style={style}
          />
        );
      })}
    </div>
  );
}
