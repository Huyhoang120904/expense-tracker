import { describe, expect, it } from "vitest";
import {
  formatLocalDate,
  formatUtcDateTime,
  parseAmountMinorInput,
  parseLocalDateInput,
} from "../src/lib/format";

describe("parseAmountMinorInput", () => {
  it("parses standard and shorthand VND amounts accurately", () => {
    expect(parseAmountMinorInput("45000", "VND")).toBe(45000);
    expect(parseAmountMinorInput("45.000", "VND")).toBe(45000);
    expect(parseAmountMinorInput("25.000.000", "VND")).toBe(25000000);
    expect(parseAmountMinorInput("₫120.000", "VND")).toBe(120000);
    expect(parseAmountMinorInput("45k", "VND")).toBe(45000);
    expect(parseAmountMinorInput("45,5k", "VND")).toBe(45500);
    expect(parseAmountMinorInput("25tr", "VND")).toBe(25000000);
    expect(parseAmountMinorInput("1.5tr", "VND")).toBe(1500000);
    expect(parseAmountMinorInput("1,25tr", "VND")).toBe(1250000);
  });

  it("rejects zero, negative, and malformed inputs", () => {
    expect(parseAmountMinorInput("", "VND")).toBeNull();
    expect(parseAmountMinorInput("0", "VND")).toBeNull();
    expect(parseAmountMinorInput("-50k", "VND")).toBeNull();
    expect(parseAmountMinorInput("abc", "VND")).toBeNull();
    expect(parseAmountMinorInput("45.5", "VND")).toBeNull();
  });

  it("parses 2-decimal currencies like USD into minor units", () => {
    expect(parseAmountMinorInput("12.50", "USD")).toBe(1250);
    expect(parseAmountMinorInput("$1,250.50", "USD")).toBe(125050);
  });
});

describe("date formatting and parsing", () => {
  it("formats ISO dates deterministically as dd/MM/yyyy with slash separators", () => {
    expect(formatLocalDate("2026-11-21")).toBe("21/11/2026");
    expect(formatLocalDate("2026-03-05", "full")).toBe("05/03/2026");
    expect(formatLocalDate("2026-11-21", "short")).toBe("21/11");
    expect(formatLocalDate("not-a-date")).toBe("not-a-date");
  });

  it("parses dd/MM/yyyy, d/M/yyyy, dd-MM-yyyy, and ISO dates into canonical YYYY-MM-DD", () => {
    expect(parseLocalDateInput("21/11/2026")).toBe("2026-11-21");
    expect(parseLocalDateInput("5/3/2026")).toBe("2026-03-05");
    expect(parseLocalDateInput("21-11-2026")).toBe("2026-11-21");
    expect(parseLocalDateInput("2026-11-21")).toBe("2026-11-21");

    expect(parseLocalDateInput("29/02/2026")).toBeNull();
    expect(parseLocalDateInput("31/04/2026")).toBeNull();
    expect(parseLocalDateInput("32/01/2026")).toBeNull();
    expect(parseLocalDateInput("invalid")).toBeNull();
  });

  it("formats UTC timestamps in dd/MM/yyyy HH:mm format", () => {
    expect(formatUtcDateTime("2026-11-21T06:05:00Z")).toMatch(
      /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/,
    );
  });
});
