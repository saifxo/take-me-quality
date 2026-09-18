import { describe, expect, it } from "vitest";
import {
  addDays,
  fromLocalInputValue,
  isValidIsoDate,
  lastFullWeekStart,
  londonWallTimeToUtc,
  parseDuration,
  toLocalInputValue,
  weekLabel,
  weekStartOf,
} from "@/lib/dates";
import { isAnonymousCaller, maskPhone, normalizeUkPhone } from "@/lib/phone";

describe("UK-time dates", () => {
  it("converts portal wall-clock times across BST and GMT", () => {
    expect(londonWallTimeToUtc(2026, 7, 1, 12, 0, 0).toISOString()).toBe("2026-07-01T11:00:00.000Z");
    expect(londonWallTimeToUtc(2026, 1, 15, 12, 0, 0).toISOString()).toBe("2026-01-15T12:00:00.000Z");
    // Clocks go back on 25 Oct 2026: 00:30 is still BST.
    expect(londonWallTimeToUtc(2026, 10, 25, 0, 30).toISOString()).toBe("2026-10-24T23:30:00.000Z");
  });

  it("reporting weeks start on Monday in UK time", () => {
    expect(weekStartOf(new Date("2026-09-06T22:30:00Z"))).toBe("2026-08-31"); // Sunday 23:30 BST
    expect(weekStartOf(new Date("2026-09-06T23:30:00Z"))).toBe("2026-09-07"); // Monday 00:30 BST
    expect(lastFullWeekStart(new Date("2026-09-15T10:00:00Z"))).toBe("2026-09-07");
    expect(addDays("2026-08-31", 7)).toBe("2026-09-07");
    expect(weekLabel("2026-08-31")).toBe("w/c 31 Aug 2026");
  });

  it("round-trips datetime-local inputs in UK time", () => {
    const d = fromLocalInputValue("2026-08-31T02:12")!;
    expect(d.toISOString()).toBe("2026-08-31T01:12:00.000Z");
    expect(toLocalInputValue(d)).toBe("2026-08-31T02:12");
    expect(fromLocalInputValue("nonsense")).toBeNull();
  });

  it("parses durations the way reviewers type them", () => {
    expect(parseDuration("85")).toBe(85);
    expect(parseDuration("1:25")).toBe(85);
    expect(parseDuration("00:01:25")).toBe(85);
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });

  it("validates ISO dates", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("31/08/2026")).toBe(false);
  });
});

describe("caller numbers", () => {
  it("normalises and masks UK numbers", () => {
    expect(normalizeUkPhone("+44 7700 900123")).toBe("07700900123");
    expect(normalizeUkPhone("0044 7700-900123")).toBe("07700900123");
    expect(maskPhone("07700 900123")).toBe("077•• •••123");
    expect(maskPhone("hello")).toBe("•••");
  });

  it("recognises withheld callers", () => {
    expect(isAnonymousCaller("Anonymous")).toBe(true);
    expect(isAnonymousCaller("withheld")).toBe(true);
    expect(isAnonymousCaller("07700900123")).toBe(false);
    expect(maskPhone("Private")).toBe("Withheld");
  });
});
