import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  generateSessionToken,
  hashSessionToken,
  hashPassword,
} from "@/lib/crypto";
import { DEFAULT_THEME, DEFAULT_PRESENTATION } from "@/lib/theme";
import { quizSettingsSchema } from "@/lib/scoring";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { attachRealtime } from "./gameServer";

/**
 * The realtime path, end to end over real sockets: a host attaches with a real
 * session cookie, a player joins by PIN, answers a live question, and the
 * result lands in Postgres. This is the test docs/ARCHITECTURE.md promises.
 *
 * It drives the same `attachRealtime` the production server mounts — only Next
 * is absent, because the game path never touches it.
 */

const EMAIL = "e2e-realtime-host@test.local";
const PIN = "990017"; // fixed test PIN, cleaned up before and after

let httpServer: HttpServer;
let origin: string;
let gameId: string;
let hostCookie: string;

const sockets: Socket[] = [];

function client(extraHeaders?: Record<string, string>): Socket {
  const socket = connect(origin, {
    path: "/api/socket",
    transports: ["websocket"],
    extraHeaders,
  });
  sockets.push(socket);
  return socket;
}

/** Await one occurrence of an event, with a hard timeout. */
function once<T>(socket: Socket, event: string, ms = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      ms,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck<T = { ok: boolean; error?: string }>(
  socket: Socket,
  event: string,
  ...args: unknown[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no ack for "${event}"`)),
      10_000,
    );
    socket.emit(event, ...args, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function cleanup(): Promise<void> {
  // Deleting the user cascades through quiz, game, players and answers.
  await db.user.deleteMany({ where: { email: EMAIL } });
  await db.game.deleteMany({ where: { pin: PIN } });
}

beforeAll(async () => {
  await cleanup();

  const host = await db.user.create({
    data: {
      email: EMAIL,
      passwordHash: await hashPassword("e2e-test-password"),
      displayName: "E2E Host",
    },
  });

  const sessionToken = generateSessionToken();
  await db.session.create({
    data: {
      id: hashSessionToken(sessionToken),
      userId: host.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  hostCookie = `${SESSION_COOKIE}=${sessionToken}`;

  // countdown 0 so the question shows the moment the host starts.
  const settings = quizSettingsSchema.parse({ countdownSeconds: 0 });
  const question = {
    id: "e2e-q1",
    type: "MULTIPLE_CHOICE",
    prompt: "Which option is right?",
    payload: {
      type: "MULTIPLE_CHOICE",
      options: [
        { id: "right", text: "This one" },
        { id: "wrong", text: "Not this one" },
      ],
      correctId: "right",
    },
    presentation: DEFAULT_PRESENTATION,
    timeLimitSec: 20,
    points: 1000,
    explanation: null,
    authorName: null,
  };

  const quiz = await db.quiz.create({
    data: {
      ownerId: host.id,
      title: "E2E realtime quiz",
      theme: DEFAULT_THEME as object,
      settings: settings as object,
    },
  });

  const game = await db.game.create({
    data: {
      quizId: quiz.id,
      hostId: host.id,
      pin: PIN,
      quizSnapshot: {
        quizId: quiz.id,
        title: quiz.title,
        theme: DEFAULT_THEME,
        settings,
        isCollab: false,
        questions: [question],
      } as object,
    },
  });
  gameId = game.id;

  httpServer = createServer();
  attachRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  origin = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await cleanup();
  await db.$disconnect();
});

describe("realtime game, end to end", () => {
  it("refuses host attach without a session cookie", async () => {
    const anon = client();
    const ack = await emitAck(anon, "host:attach", { gameId });
    expect(ack.ok).toBe(false);
    anon.disconnect();
  });

  it("refuses a signed-in non-owner as host", async () => {
    // A valid session for a different account must not grant host control.
    const stranger = await db.user.create({
      data: {
        email: "e2e-realtime-stranger@test.local",
        passwordHash: await hashPassword("e2e-test-password"),
        displayName: "Stranger",
      },
    });
    const token = generateSessionToken();
    await db.session.create({
      data: {
        id: hashSessionToken(token),
        userId: stranger.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const socket = client({ cookie: `${SESSION_COOKIE}=${token}` });
    const ack = await emitAck(socket, "host:attach", { gameId });
    expect(ack.ok).toBe(false);

    socket.disconnect();
    await db.user.deleteMany({ where: { email: "e2e-realtime-stranger@test.local" } });
  });

  it("blocks a profane nickname at the door", async () => {
    const player = client();
    const ack = await emitAck(player, "player:join", {
      pin: PIN,
      nickname: "k4nker99",
    });
    expect(ack.ok).toBe(false);
    player.disconnect();
  });

  it("plays a full game: attach, join, answer, score, persist", async () => {
    const host = client({ cookie: hostCookie });
    const attach = await emitAck(host, "host:attach", { gameId });
    expect(attach.ok).toBe(true);

    const player = client();
    const join = await emitAck<{
      ok: boolean;
      playerId?: string;
      token?: string;
    }>(player, "player:join", { pin: PIN, nickname: "SocketTester" });
    expect(join.ok).toBe(true);
    expect(join.playerId).toBeTruthy();
    expect(join.token).toBeTruthy();

    // Start the game; with countdown 0 the question broadcast is immediate.
    const shown = once<{ index: number; endsAt: number; payload: unknown }>(
      player,
      "question:show",
    );
    const started = await emitAck(host, "host:start");
    expect(started.ok).toBe(true);

    const view = await shown;
    expect(view.index).toBe(0);
    // The player view must not carry the correct answer.
    expect(JSON.stringify(view.payload)).not.toContain("correctId");

    // Answer correctly; being the only player, this triggers lock + reveal.
    const result = once<{ correct: boolean; totalScore: number }>(
      player,
      "question:result",
    );
    const answered = await emitAck(player, "player:answer", {
      index: 0,
      response: { kind: "choice", optionId: "right" },
    });
    expect(answered.ok).toBe(true);

    const personal = await result;
    expect(personal.correct).toBe(true);
    expect(personal.totalScore).toBeGreaterThan(0);

    // A second submission for the same question must be refused.
    const again = await emitAck(player, "player:answer", {
      index: 0,
      response: { kind: "choice", optionId: "right" },
    });
    expect(again.ok).toBe(false);

    // Last question already played → advancing ends the game.
    const over = once<{ podium: Array<{ nickname: string; score: number }> }>(
      player,
      "game:over",
    );
    const ended = await emitAck(host, "host:next");
    expect(ended.ok).toBe(true);

    const podium = await over;
    expect(podium.podium[0]?.nickname).toBe("SocketTester");

    // The database, not the socket, is the system of record — check it. The
    // engine emits `game:over` before its final status write lands, so give
    // that write a moment rather than racing it.
    let game = await db.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { players: true, answers: true },
    });
    for (let i = 0; i < 50 && game.status !== "ENDED"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      game = await db.game.findUniqueOrThrow({
        where: { id: gameId },
        include: { players: true, answers: true },
      });
    }
    expect(game.status).toBe("ENDED");
    expect(game.players).toHaveLength(1);
    expect(game.players[0]?.score).toBeGreaterThan(0);
    expect(game.answers).toHaveLength(1);
    expect(game.answers[0]?.correct).toBe(true);

    host.disconnect();
    player.disconnect();
  });
});
