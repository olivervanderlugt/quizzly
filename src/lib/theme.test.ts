import { describe, expect, it } from "vitest";

import { DEFAULT_PRESENTATION, presentationSchema, type Presentation } from "./theme";

/**
 * A game runs from `Game.quizSnapshot`, a row that may have been written by any
 * earlier deploy, and `server/realtime/gameServer.ts` re-parses it through
 * `presentationSchema` on every room load. A *required* new field therefore
 * doesn't break at merge time — it breaks whichever old snapshots are still in
 * the database, and only once the process restarts and the room cache empties,
 * at which point the player just sees "Game not found".
 *
 * So these tests fail if a new presentation field is not optional or defaulted.
 */
describe("presentationSchema stays readable by older snapshots", () => {
  it("parses a snapshot that predates every field it has today", () => {
    const parsed = presentationSchema.safeParse({});

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(DEFAULT_PRESENTATION);
  });

  it("parses a snapshot missing any one of the current fields", () => {
    const current: Required<Presentation> = {
      layout: "mediaTop",
      media: "https://example.com/bus.png",
      mediaAlt: "A red bus on a bridge",
      accentOverride: "#ff0055",
      hideTimer: true,
    };
    expect(presentationSchema.safeParse(current).success).toBe(true);

    // Drop each field in turn: an old row is exactly a row missing whichever
    // fields did not exist when it was written.
    for (const field of Object.keys(current) as Array<keyof Presentation>) {
      const older = { ...current };
      delete older[field];

      const parsed = presentationSchema.safeParse(older);
      expect(parsed.success, `dropping "${field}" must still parse`).toBe(true);
    }
  });
});
