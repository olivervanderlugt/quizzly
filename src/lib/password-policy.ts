import { z } from "zod";

/**
 * One password rule for signup, reset and change, so they cannot drift apart.
 *
 * NIST guidance: length is what matters. Composition rules ("one symbol!")
 * mostly push people toward `Password1!`, so we ask for length instead.
 */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters — length matters more than symbols.")
  .max(200, "That password is too long.");
