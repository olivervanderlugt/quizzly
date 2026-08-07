import { describe, expect, it } from "vitest";

import { sanitizeNickname } from "./nickname";

function accepted(raw: string): boolean {
  return sanitizeNickname(raw).ok;
}

describe("sanitizeNickname", () => {
  it("accepts ordinary nicknames", () => {
    for (const name of ["Ollie", "Quiz Master 3000", "emma!", "Târek", "李明"]) {
      expect(accepted(name), name).toBe(true);
    }
  });

  it("trims, collapses whitespace and caps length", () => {
    const result = sanitizeNickname("  Olivia    van   der  Lugt  extra  ");
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.nickname.length).toBeLessThanOrEqual(20);
      expect(result.nickname.startsWith("Olivia van der")).toBe(true);
    }
  });

  it("rejects an empty or whitespace-only nickname", () => {
    expect(accepted("")).toBe(false);
    expect(accepted("   ")).toBe(false);
  });

  it("blocks plain profanity and slurs", () => {
    for (const name of ["fuck", "BITCH", "kanker", "klootzak", "retard"]) {
      expect(accepted(name), name).toBe(false);
    }
  });

  it("blocks profanity embedded in a longer name", () => {
    for (const name of ["xXfuckXx", "mrshithead", "kankerlijer99"]) {
      expect(accepted(name), name).toBe(false);
    }
  });

  it("blocks leetspeak and separator evasions", () => {
    for (const name of ["f u c k", "sh!t", "b1tch", "f4ggot", "k@nker", "fuuuuck"]) {
      expect(accepted(name), name).toBe(false);
    }
  });

  it("blocks short terms only as the whole name", () => {
    expect(accepted("nazi")).toBe(false);
    expect(accepted("KKK")).toBe(false);
    expect(accepted("kut")).toBe(false);
    // ...but not embedded in innocent names.
    expect(accepted("Ashkenazi")).toBe(true);
    expect(accepted("Kuttner")).toBe(true);
  });

  it("does not fall for the Scunthorpe problem on common names", () => {
    for (const name of ["Cassandra", "Dickens", "Lulu", "Sass", "Klaas"]) {
      expect(accepted(name), name).toBe(true);
    }
  });

  it("accepts the one documented false positive as the cost of the trade", () => {
    // "Scunthorpe" contains a slur too abused to leave off the substring
    // list. Blocking the town's name in a quiz nickname is the accepted
    // cost; this test exists so removing the term is a conscious decision.
    expect(accepted("Scunthorpe")).toBe(false);
  });
});
