import {
  composerDocumentSchema,
  type ComposerDocument,
} from "@/server/composer/schema";
import { Scenario, Severity } from "../types";
import { getOutcome } from "../utils/verdict";
import { getRecommendation } from "../data/recommendations";
import { TARGET_HOST, TARGET_IP } from "../data/scenarios";
import { REPORT_DEMO_URL } from "./links";

/**
 * The readiness report expressed in the composer's blocks, so it renders
 * through exactly the same pipeline as the sales-tool documents.
 */

export interface ReportInput {
  scenarios: Scenario[];
  runQueue: string[];
  coverage: number;
  grade: string;
  summary: string;
}

const SEVERITY_RANK: Record<Severity, number> = { High: 3, Medium: 2, Low: 1 };

export function reportFileName(): string {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  return `guardz-attack-readiness-${stamp}.pdf`;
}

export function buildReportDocument({
  scenarios,
  runQueue,
  coverage,
  grade,
  summary,
}: ReportInput): ComposerDocument {
  const ran = runQueue
    .map((id) => scenarios.find((s) => s.id === id))
    .filter((s): s is Scenario => Boolean(s));

  const undetected = ran
    .filter((s) => getOutcome(s.status) === "executed")
    .sort(
      (a, b) =>
        SEVERITY_RANK[getRecommendation(b.id).severity] -
        SEVERITY_RANK[getRecommendation(a.id).severity],
    );
  const blocked = ran.filter((s) => getOutcome(s.status) === "protected").length;
  const errored = ran.filter((s) => getOutcome(s.status) === "errored").length;

  const when = new Date().toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });

  const intro =
    `**${ran.length} ${ran.length === 1 ? "attack" : "attacks"}** were simulated against ` +
    `**${TARGET_HOST}** (${TARGET_IP}) on ${when}. ` +
    `${blocked} were blocked by the endpoint and ${undetected.length} ran to completion undetected, ` +
    `giving a detection coverage of **${coverage}%** — grade **${grade}**.` +
    (errored > 0
      ? ` **${errored}** could not be started by the runner and are excluded from the score — they prove nothing about this endpoint.`
      : "") +
    `\n\n` +
    `Every attack runs safely and reverts itself. ${summary}`;

  const why =
    undetected.length === 0
      ? "This endpoint blocked every attack in the run. Re-test after any change to endpoint policy to confirm coverage holds."
      : `${undetected.length} of the ${ran.length} attacks reached completion without being stopped. ` +
        `Each one below is a live gap an attacker could use on this endpoint today; the ` +
        `recommended actions are ordered by severity.`;

  const page1 = [
    {
      id: "title",
      type: "heading" as const,
      text: "Attack Readiness",
      accentText: "Report",
      tone: "purple" as const,
      size: "large" as const,
    },
    { id: "intro", type: "paragraph" as const, text: intro },
    {
      id: "stats",
      type: "statCards" as const,
      cards: [
        {
          value: String(blocked),
          label: "attacks blocked by the endpoint",
          tone: "mint" as const,
        },
        {
          value: String(undetected.length),
          label: "attacks went undetected",
          tone: "pink" as const,
        },
        {
          value: `${coverage}%`,
          label: "detection coverage across the run",
          tone: "lavender" as const,
        },
      ],
    },
    {
      id: "why",
      type: "callout" as const,
      title: "Why this matters",
      body: why,
    },
    {
      id: "results-heading",
      type: "heading" as const,
      text: "Attacks tested",
      accentText: "",
      tone: "indigo" as const,
      size: "small" as const,
    },
    {
      id: "results",
      type: "comparisonMatrix" as const,
      title: "",
      note: "Result reflects how this endpoint responded during the simulated run.",
      tiers: ["MITRE", "Category", "Result"],
      rows: ran.map((s) => ({
        label: s.name,
        checks: [
          s.mitreId,
          s.category,
          getOutcome(s.status) === "executed"
            ? "Undetected"
            : getOutcome(s.status) === "errored"
              ? "Didn't run"
              : "Blocked",
        ],
      })),
    },
  ];

  const page2 = [
    {
      id: "actions-heading",
      type: "heading" as const,
      text: "Recommended actions",
      accentText: "",
      tone: "indigo" as const,
      size: "small" as const,
    },
    undetected.length === 0
      ? {
          id: "actions-none",
          type: "paragraph" as const,
          text: "No remediation required — every attack in this run was blocked.",
        }
      : {
          id: "actions",
          type: "numberedList" as const,
          items: undetected.map((s) => {
            const rec = getRecommendation(s.id);
            return `**${s.name}** (${s.mitreId} · ${rec.severity.toLowerCase()} severity) — ${rec.action}`;
          }),
        },
    {
      id: "quote",
      type: "quote" as const,
      quote:
        "We built this test so MSPs can see precisely where their EDR falls short, from missed detections to response gaps, measured against real-world attacks.",
      name: "Elli Shlomo",
      role: "Head of Security Research",
    },
    {
      id: "cta",
      type: "cta" as const,
      lead: "See how Guardz blocks every one of these attacks.",
      primaryLabel: "Book a Demo",
      primaryUrl: REPORT_DEMO_URL,
      secondaryLabel: "",
      secondaryUrl: "",
    },
  ];

  return composerDocumentSchema.parse({
    schemaVersion: 1,
    docTitle: "EDR Attack Readiness Report",
    footer: { showLogo: true, showPageNumber: true },
    pages: [
      { id: "page-1", blocks: page1 },
      { id: "page-2", blocks: page2 },
    ],
  });
}
