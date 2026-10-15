import { describe, expect, it } from "vitest";
import { addDays, daysInMonth, isValidDay, jstDateTime, jstDay, jstMonth, weekStart } from "../src/time";

describe("日本時間の区切り", () => {
  it("UTC 14:59 はまだ同じ日、15:00 で翌日", () => {
    expect(jstDay(new Date("2026-10-14T14:59:59Z"))).toBe("2026-10-14");
    expect(jstDay(new Date("2026-10-14T15:00:00Z"))).toBe("2026-10-15");
  });

  it("月の境目", () => {
    expect(jstMonth(new Date("2026-09-30T14:59:59Z"))).toBe("2026-09");
    expect(jstMonth(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10");
    expect(jstMonth(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01");
  });

  it("日時は日本時間の表記", () => {
    expect(jstDateTime(new Date("2026-10-14T15:05:00Z"))).toBe("2026-10-15T00:05");
  });

  it("週は月曜はじまり", () => {
    expect(weekStart("2026-10-15")).toBe("2026-10-12"); // 木
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // 月
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // 日
    expect(addDays("2026-10-12", 6)).toBe("2026-10-18");
  });

  it("月の日数と日付の実在チェック", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-10")).toBe(31);
    expect(isValidDay("2026-02-29")).toBe(false);
    expect(isValidDay("2026-10-15")).toBe(true);
  });
});
