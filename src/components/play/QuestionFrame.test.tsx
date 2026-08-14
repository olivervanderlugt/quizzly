import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuestionFrame } from "./QuestionFrame";
import type { PlayerQuestionView } from "@/types/realtime";

/**
 * An uploaded image is a root-relative path rather than the absolute URL this
 * component was written for, so this pins down the thing that would break
 * silently: that all three image layouts still put it in an `<img src>`, and
 * that the alt text rides along.
 */

const UPLOADED = "/api/media/0123456789abcdef0123456789abcdef.webp";
const PASTED = "https://example.com/bus.jpg";

function render(layout: string, media: string) {
  const view = {
    index: 0,
    total: 3,
    prompt: "Which bridge is this?",
    points: 1000,
    endsAt: Date.now() + 20_000,
    serverNow: Date.now(),
    type: "MULTIPLE_CHOICE",
    payload: {
      type: "MULTIPLE_CHOICE",
      options: [{ id: "a", text: "Westminster" }],
    },
    presentation: {
      layout,
      media,
      mediaAlt: "A red bus on a bridge",
      hideTimer: false,
    },
  } as unknown as PlayerQuestionView;

  return renderToStaticMarkup(
    <QuestionFrame view={view}>
      <div>answers</div>
    </QuestionFrame>,
  );
}

describe("QuestionFrame with an image", () => {
  for (const layout of ["mediaTop", "mediaSplit", "banner"] as const) {
    it(`renders an uploaded image in the ${layout} layout`, () => {
      const html = render(layout, UPLOADED);
      expect(html).toContain(`src="${UPLOADED}"`);
      expect(html).toContain('alt="A red bus on a bridge"');
    });

    it(`still renders a pasted URL in the ${layout} layout`, () => {
      expect(render(layout, PASTED)).toContain(`src="${PASTED}"`);
    });
  }

  it("shows no image in a text-only layout", () => {
    expect(render("classic", UPLOADED)).not.toContain("<img");
  });
});
