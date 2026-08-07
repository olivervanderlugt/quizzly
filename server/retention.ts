import type { PrismaClient } from "@prisma/client";

/**
 * Data retention: delete games older than DATA_RETENTION_DAYS.
 *
 * Deleting the `Game` row cascades to its players and answers — that cascade
 * is the entire mechanism, so one delete removes everything a play session
 * ever produced. A game older than the retention window is swept regardless of
 * status: a "live" game from weeks ago is an abandoned lobby, not a game.
 *
 * This is the retention policy docs/LEGAL.md asks for. It runs in-process
 * (once at boot, then daily) rather than as an external cron so that a
 * single-container deploy — the documented shape — needs nothing extra.
 */

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startRetentionJob(db: PrismaClient, days: number): void {
  const sweep = async () => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const { count } = await db.game.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        console.log(`[retention] deleted ${count} game(s) older than ${days} days`);
      }
    } catch (err) {
      // A failed sweep is retried in 24h; never let it take the server down.
      console.error("[retention] sweep failed", err);
    }
  };

  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS).unref();
}
