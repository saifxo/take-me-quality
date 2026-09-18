/**
 * TMQ scoring engine — a faithful port of the Analysis sheet's score formula (column AE):
 *
 *   IF(any High Impact Handling Issue, 0,
 *      (Σ Yes·1 + Partial·0.5  −  Σ critical deductions) ÷ COUNT(answers ≠ N/A))
 *
 * Deliberate differences from the sheet (see the platform plan):
 *   - an unanswered criterion is reported as missing instead of silently counting as "No";
 *   - a section where everything is N/A is "not scored" (null) instead of #DIV/0!;
 *   - an optional score floor (default 0%) stops scores going negative.
 */

export type Answer = "yes" | "partial" | "no" | "na";
export type Band = "perfect" | "meets" | "below" | "fail";

export type EngineCriterion = {
  id: string;
  sectionKey: string;
  title: string;
  allowPartial: boolean;
  allowNa: boolean;
  penaltyNo: number;
  penaltyPartial: number;
};

export type EngineSettings = {
  kpiPass: number;
  weights: { yes: number; partial: number; no: number };
  scoreFloor: number | null;
};

export type Deduction = { criterionId: string; title: string; answer: "no" | "partial"; amount: number };

export type ScoreResult = {
  /** Criteria that count towards the score (answered and not N/A). */
  applicable: number;
  points: number;
  penalty: number;
  /** Unfloored percentage, or null when nothing is applicable. */
  raw: number | null;
  /** Percentage after the HiHi rule and the floor; null when not scorable. */
  score: number | null;
  band: Band | null;
  autoFail: boolean;
  sections: Record<string, number | null>;
  deductions: Deduction[];
  /** Criteria with no answer yet. A submission requires this to be empty. */
  missing: string[];
  /** Answers that break a criterion's rules (e.g. Partial where the rubric has none). */
  invalid: string[];
};

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function bandFor(score: number | null, kpiPass: number, autoFail = false): Band | null {
  if (autoFail) return "fail";
  if (score === null) return null;
  const s = round(score);
  if (s >= 100) return "perfect";
  if (s > kpiPass) return "meets";
  if (s > 0) return "below";
  return "fail";
}

export function scoreEvaluation(
  criteria: EngineCriterion[],
  answers: Record<string, Answer | null | undefined>,
  issueCount: number,
  settings: EngineSettings,
): ScoreResult {
  const { weights } = settings;
  let points = 0;
  let penalty = 0;
  let applicable = 0;
  const deductions: Deduction[] = [];
  const missing: string[] = [];
  const invalid: string[] = [];
  const sectionAcc = new Map<string, { pts: number; n: number }>();

  for (const c of criteria) {
    if (!sectionAcc.has(c.sectionKey)) sectionAcc.set(c.sectionKey, { pts: 0, n: 0 });
    const a = answers[c.id];
    if (!a) {
      missing.push(c.id);
      continue;
    }
    if ((a === "partial" && !c.allowPartial) || (a === "na" && !c.allowNa)) invalid.push(c.id);
    if (a === "na") continue;

    const p = a === "yes" ? weights.yes : a === "partial" ? weights.partial : weights.no;
    points += p;
    applicable += 1;
    const acc = sectionAcc.get(c.sectionKey)!;
    acc.pts += p;
    acc.n += 1;

    if (a === "no" && c.penaltyNo > 0) {
      penalty += c.penaltyNo;
      deductions.push({ criterionId: c.id, title: c.title, answer: "no", amount: c.penaltyNo });
    } else if (a === "partial" && c.penaltyPartial > 0) {
      penalty += c.penaltyPartial;
      deductions.push({ criterionId: c.id, title: c.title, answer: "partial", amount: c.penaltyPartial });
    }
  }

  const sections: Record<string, number | null> = {};
  for (const [key, acc] of sectionAcc) {
    sections[key] = acc.n > 0 ? round((acc.pts / (acc.n * weights.yes)) * 100, 2) : null;
  }

  const autoFail = issueCount > 0;
  const raw = applicable > 0 ? round(((points - penalty) / (applicable * weights.yes)) * 100) : null;

  let score: number | null;
  if (autoFail) score = 0;
  else if (raw === null) score = null;
  else score = settings.scoreFloor === null ? raw : Math.max(raw, settings.scoreFloor);

  return {
    applicable,
    points: round(points),
    penalty: round(penalty),
    raw,
    score: score === null ? null : round(score, 2),
    band: bandFor(score, settings.kpiPass, autoFail),
    autoFail,
    sections,
    deductions,
    missing,
    invalid,
  };
}

/** Pre-selected answers for a new review: Yes everywhere, N/A where the call type makes a criterion irrelevant. */
export function defaultAnswers(
  criteria: { id: string; applicableCallTypes: string[] }[],
  callType: string,
): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const c of criteria) {
    out[c.id] = c.applicableCallTypes.length > 0 && !c.applicableCallTypes.includes(callType) ? "na" : "yes";
  }
  return out;
}

export const BAND_LABEL: Record<Band, string> = {
  perfect: "Perfect",
  meets: "Meets KPI",
  below: "Below KPI",
  fail: "Fail",
};
