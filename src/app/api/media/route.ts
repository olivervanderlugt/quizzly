import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { processImageUpload } from "@/lib/media/image";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, mediaPathForKey } from "@/lib/media/ref";
import { storeMedia } from "@/lib/media/storage";
import { consume } from "@/lib/rate-limit";

/**
 * Upload an image for a quiz you own.
 *
 * A route handler rather than a Server Action for one practical reason:
 * Server Actions cap their request body at 1 MB by default, and raising that
 * limit raises it for every action in the app. An upload is the only thing
 * here that needs megabytes, so it gets its own door.
 *
 * The response is the same-origin path the image is served from, which the
 * editor drops straight into `presentation.media` or the quiz's cover.
 */

export const dynamic = "force-dynamic";

/**
 * Per-user ceiling. Generous for someone building a picture round, tight
 * enough that one account cannot quietly fill the volume overnight.
 */
const UPLOAD_RATE = { limit: 100, windowMs: 60 * 60 * 1000 };

/** Multipart framing around the file itself: boundaries, headers, field names. */
const MULTIPART_OVERHEAD_BYTES = 8 * 1024;

function fail(status: number, error: string, headers?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: Request) {
  // Cookie auth plus a plain multipart POST is exactly the shape a cross-site
  // form can forge. Server Actions get this check from Next for free; a route
  // handler has to make it itself.
  if (request.headers.get("origin") !== env.APP_ORIGIN) {
    return fail(403, "Upload requests must come from this site.");
  }

  const user = await getCurrentUser();
  if (!user) return fail(401, "Sign in to upload an image.");

  // Cheap rejection before reading a body we already know is too big. The
  // header is a claim, not proof, so the real check happens on the bytes.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return fail(413, `That image is larger than ${MAX_UPLOAD_LABEL}.`);
  }

  const rate = consume(`media-upload:${user.id}`, UPLOAD_RATE);
  if (!rate.allowed) {
    return fail(429, "That's a lot of images at once. Try again shortly.", {
      "retry-after": String(Math.ceil(rate.retryAfterMs / 1000)),
    });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "That upload wasn't readable.");

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No image was attached.");

  const quizId = String(form.get("quizId") ?? "");
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { ownerId: true },
  });
  // Being signed in is not the same as being allowed to add an image to *this*
  // quiz. Same answer for "no such quiz" and "not yours" — no existence oracle,
  // matching `ownedQuiz()` in the quiz actions.
  if (!quiz || quiz.ownerId !== user.id) return fail(404, "Quiz not found.");

  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, `That image is larger than ${MAX_UPLOAD_LABEL}.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const processed = await processImageUpload(bytes);
  if (!processed.ok) return fail(400, processed.error);

  const key = await storeMedia(processed.image.data);

  return NextResponse.json(
    {
      url: mediaPathForKey(key),
      width: processed.image.width,
      height: processed.image.height,
      bytes: processed.image.data.length,
    },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
