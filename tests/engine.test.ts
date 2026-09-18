import { describe, expect, it } from "vitest";
import { bandFor, defaultAnswers, scoreEvaluation, type Answer, type EngineCriterion } from "@/lib/scoring/engine";
import { DEFAULT_SETTINGS, TMQ_SECTIONS } from "@/lib/framework/tmq";

// Build engine criteria straight from the framework, keyed by the sheet's column letters (I..AC).
const criteria: (EngineCriterion & { applicableCallTypes: string[] })[] = TMQ_SECTIONS.flatMap((s) =>
  s.criteria.map((c) => ({
    id: c.sheetColumn,
    sectionKey: s.key,
    title: c.title,
    allowPartial: c.allowPartial ?? true,
    allowNa: true,
    penaltyNo: c.penaltyNo ?? 0,
    penaltyPartial: c.penaltyPartial ?? 0,
    applicableCallTypes: c.applicableCallTypes ?? [],
  })),
);

const sheet = { ...DEFAULT_SETTINGS, scoreFloor: null }; // the spreadsheet has no floor
const typical = (): Record<string, Answer> => defaultAnswers(criteria, "booking");
const score = (changes: Record<string, Answer>, issues = 0, settings = sheet) =>
  scoreEvaluation(criteria, { ...typical(), ...changes }, issues, settings);

describe("framework shape", () => {
  it("has 21 criteria in 4 sections with the sheet's critical deductions", () => {
    expect(criteria).toHaveLength(21);
    expect(TMQ_SECTIONS.map((s) => s.criteria.length)).toEqual([3, 6, 10, 2]);
    const critical = criteria.filter((c) => c.penaltyNo > 0).map((c) => c.id);
    expect(critical).toEqual(["L", "M", "N", "P", "Q"]);
    expect(criteria.filter((c) => c.penaltyPartial > 0).map((c) => c.id)).toEqual(["N", "P", "Q"]);
  });

  it("a typical booking pre-selects N/A for authentication, procedures and airport (like every row in the sheet)", () => {
    const a = typical();
    expect([a.N, a.P, a.Q]).toEqual(["na", "na", "na"]);
    expect(Object.values(a).filter((v) => v === "yes")).toHaveLength(18);
  });
});

describe("worked examples from the plan (parity with Analysis!AE)", () => {
  it("typical booking scores 100% Perfect", () => {
    const r = score({});
    expect(r.applicable).toBe(18);
    expect(r.score).toBe(100);
    expect(r.band).toBe("perfect");
  });

  it("asked to spell Tesco → 91.67% Meets KPI", () => {
    const r = score({ M: "partial", Z: "no" });
    expect(r.points).toBe(16.5);
    expect(r.penalty).toBe(0);
    expect(r.score).toBe(91.67);
    expect(r.band).toBe("meets");
  });

  it("missed the full address → 83.33% Below KPI with a −2 deduction", () => {
    const r = score({ M: "no" });
    expect(r.penalty).toBe(2);
    expect(r.deductions).toEqual([{ criterionId: "M", title: "Full Address Details for Bookings", answer: "no", amount: 2 }]);
    expect(r.score).toBe(83.33);
    expect(r.band).toBe("below");
  });

  it("airport, terminal not confirmed → 92.50% Meets KPI", () => {
    const r = score({ P: "yes", Q: "partial" });
    expect(r.applicable).toBe(20);
    expect(r.score).toBe(92.5);
    expect(r.band).toBe("meets");
  });

  it("exactly 90.00% counts as Below KPI (the sheet counts <=90% as below)", () => {
    const r = score({ P: "yes", Q: "yes", U: "no", X: "no" });
    expect(r.score).toBe(90);
    expect(r.band).toBe("below");
  });

  it("account caller not authenticated → 84.21% Below KPI", () => {
    const r = score({ N: "no" });
    expect(r.applicable).toBe(19);
    expect(r.score).toBe(84.21);
  });

  it("any zero-tolerance issue forces 0% Fail regardless of answers", () => {
    const r = score({}, 1);
    expect(r.autoFail).toBe(true);
    expect(r.score).toBe(0);
    expect(r.band).toBe("fail");
  });

  it("every answer No gives −47.62% in the sheet, floored to 0% on the platform", () => {
    const allNo = Object.fromEntries(criteria.map((c) => [c.id, "no" as Answer]));
    const sheetResult = scoreEvaluation(criteria, allNo, 0, sheet);
    expect(sheetResult.raw).toBeCloseTo(-47.619, 2);
    expect(sheetResult.score).toBe(-47.62);
    const platform = scoreEvaluation(criteria, allNo, 0, DEFAULT_SETTINGS);
    expect(platform.score).toBe(0);
    expect(platform.band).toBe("fail");
  });
});

describe("safeguards the sheet lacked", () => {
  it("reports unanswered criteria instead of counting them as No", () => {
    const a = typical();
    delete (a as Record<string, Answer | undefined>).S;
    const r = scoreEvaluation(criteria, a, 0, sheet);
    expect(r.missing).toEqual(["S"]);
    expect(r.applicable).toBe(17);
    expect(r.score).toBe(100);
  });

  it("an all-N/A section is not scored rather than #DIV/0!", () => {
    const r = score({ I: "na", J: "na", K: "na" });
    expect(r.sections.greeting).toBeNull();
    expect(r.sections.interaction).toBe(100);
  });

  it("everything N/A is not scorable", () => {
    const allNa = Object.fromEntries(criteria.map((c) => [c.id, "na" as Answer]));
    const r = scoreEvaluation(criteria, allNa, 0, sheet);
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
  });

  it("flags Partial on a criterion whose rubric has no Partial", () => {
    const r = score({ N: "partial" });
    expect(r.invalid).toEqual(["N"]);
  });

  it("section scores ignore critical deductions (matching AJ:AM)", () => {
    const r = score({ M: "no" });
    expect(r.sections.booking).toBeCloseTo((2 / 3) * 100, 1);
  });
});

describe("bands follow the configured KPI", () => {
  it("uses strict greater-than for Meets KPI", () => {
    expect(bandFor(90, 90)).toBe("below");
    expect(bandFor(90.01, 90)).toBe("meets");
    expect(bandFor(100, 90)).toBe("perfect");
    expect(bandFor(0, 90)).toBe("fail");
    expect(bandFor(85, 80)).toBe("meets");
  });
});
