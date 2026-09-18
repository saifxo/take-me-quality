import { describe, expect, it } from "vitest";
import { nameKey, parsePortalText, type ParsedCall } from "@/lib/smart-paste";

const ok = (r: ReturnType<typeof parsePortalText>[number]): ParsedCall => {
  if (!r.ok) throw new Error(`expected a parsed row, got: ${r.reason} (${r.raw})`);
  return r;
};

const TAB_ROWS = [
  "Queue\t561 / 1465 - Bushra Maknoon - BIRPK - BE\t07700900123\t2026-08-31 02:12:07\t00:01:25\t» Play « » Download « » Email «",
  "Queue\t557 / 1465 - Bushra Maknoon - BIRPK - BE\t07700900456\t2026-08-31 02:28:43\t00:02:46\t» Play « » Download « » Email «",
  "Exten\tAsfan JIM Khan - BIR - BE\tBushra Maknoon - BIRPK - BE\t2026-08-31 02:57:57\t00:00:10\t» Play « » Download « » Email «",
].join("\n");

describe("smart paste — portal rows", () => {
  it("parses tab-separated rows copied from the portal table", () => {
    const rows = parsePortalText(TAB_ROWS);
    expect(rows).toHaveLength(3);
    const a = ok(rows[0]);
    expect(a).toMatchObject({
      context: "queue",
      queue: "561",
      extension: "1465",
      agentName: "Bushra Maknoon",
      siteCode: "BIRPK",
      teamCode: "BE",
      callerNumber: "07700900123",
      callerMasked: "077•• •••123",
      durationSec: 85,
      callWeek: "2026-08-31",
    });
    // 02:12 BST on 31 Aug 2026 is 01:12 UTC.
    expect(a.callAt).toBe("2026-08-31T01:12:07.000Z");
    expect(ok(rows[1]).durationSec).toBe(166);
  });

  it("recognises internal extension calls and keeps the other party", () => {
    const c = ok(parsePortalText(TAB_ROWS)[2]);
    expect(c.context).toBe("extension");
    expect(c.agentName).toBe("Asfan JIM Khan");
    expect(c.siteCode).toBe("BIR");
    expect(c.internalParty).toBe("Bushra Maknoon - BIRPK - BE");
    expect(c.callerNumber).toBeNull();
  });

  it("handles rows pasted with spaces instead of tabs", () => {
    const r = ok(parsePortalText("Queue 551 / 1465 - Sarah Patel - SOL - DE 07799845791 2026-08-31 02:51:45 00:00:40")[0]);
    expect(r.agentName).toBe("Sarah Patel");
    expect(r.siteCode).toBe("SOL");
    expect(r.durationSec).toBe(40);
  });

  it("handles several rows collapsed onto one line", () => {
    const one = TAB_ROWS.replace(/\n/g, " ");
    const rows = parsePortalText(one);
    expect(rows.filter((r) => r.ok)).toHaveLength(3);
  });

  it("handles each cell on its own line (some browsers copy tables this way)", () => {
    const cells = "Queue\n561 / 1465 - Sarah Patel - SOL - DE\n07700900123\n2026-08-31 02:12:07\n00:01:25\n» Play «\n» Download «\n» Email «";
    const rows = parsePortalText(cells);
    expect(rows).toHaveLength(1);
    expect(ok(rows[0]).agentName).toBe("Sarah Patel");
  });

  it("ignores the header row and blank lines", () => {
    const text = `Context\tDestination\tOrigination\tDate Time\tDuration\tOptions\n\n${TAB_ROWS}\n\n`;
    expect(parsePortalText(text).filter((r) => r.ok)).toHaveLength(3);
    expect(parsePortalText(text).filter((r) => !r.ok)).toHaveLength(0);
  });

  it("keeps paste order when strict and fallback rows are mixed", () => {
    const text = [
      "Queue 561 / 1465 - Sarah Patel - SOL - DE 07700900123 2026-08-31 02:12:07 00:01:25",
      "Queue 561 / 1470 - Dan Carter 07700900999 2026-08-31 03:00:00 00:02:00",
      "Queue 561 / 1465 - Sarah Patel - SOL - DE 07700900456 2026-08-31 04:12:07 00:01:25",
    ].join("\n");
    const rows = parsePortalText(text).map(ok);
    expect(rows.map((r) => r.callAt)).toEqual([...rows.map((r) => r.callAt)].sort());
    expect(rows[1]).toMatchObject({ agentName: "Dan Carter", siteCode: null, teamCode: null });
  });

  it("accepts withheld callers, +44 numbers and UK-format dates", () => {
    const withheld = ok(parsePortalText("Queue 561 / 1465 - Sarah Patel - SOL - DE Anonymous 2026-08-31 02:12:07 00:01:25")[0]);
    expect(withheld.anonymousCaller).toBe(true);
    expect(withheld.callerMasked).toBe("Withheld");

    const intl = ok(parsePortalText("Queue 561 / 1465 - Sarah Patel - SOL - DE +447700900123 31/08/2026 14:05 01:25")[0]);
    expect(intl.callerNumber).toBe("07700900123");
    expect(intl.callAt).toBe("2026-08-31T13:05:00.000Z");
  });

  it("uses GMT outside British Summer Time", () => {
    const r = ok(parsePortalText("Queue 561 / 1465 - Sarah Patel - SOL - DE 07700900123 2026-12-01 09:00:00 00:01:00")[0]);
    expect(r.callAt).toBe("2026-12-01T09:00:00.000Z");
    expect(r.callWeek).toBe("2026-11-30");
  });

  it("returns friendly errors instead of throwing on junk", () => {
    const rows = parsePortalText("hello there 123\nQueue 561 / 1465 - Sarah Patel - SOL - DE 07700900123 2026-02-31 02:12:07 00:01:25");
    expect(rows.every((r) => !r.ok)).toBe(true);
    expect(rows.some((r) => !r.ok && r.reason.includes("date"))).toBe(true);
    expect(parsePortalText("")).toEqual([]);
    expect(parsePortalText("   \n  ")).toEqual([]);
  });

  it("caps very large pastes", () => {
    const many = Array.from({ length: 80 }, () => TAB_ROWS.split("\n")[0]).join("\n");
    expect(parsePortalText(many, 50)).toHaveLength(50);
  });

  it("builds forgiving roster keys", () => {
    expect(nameKey("  Asfan  JIM Khan ")).toBe(nameKey("asfan jim khan"));
    expect(nameKey("Zoë O'Neil")).toBe("zoe oneil");
  });
});
