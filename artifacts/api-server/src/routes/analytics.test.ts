import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../app";
import { resetBillingStoreForTests, updateSubscription } from "../lib/billing";
import { resetAnalyticsStoreForTests, type StatsResponse } from "../lib/analytics";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  resetBillingStoreForTests();
  resetAnalyticsStoreForTests();
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_USER_IDS;
});

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_USER_IDS;
});

describe("Analytics & Private /api/stats", () => {
  it("rejects unknown analytics event names and accepts allowlisted events", async () => {
    const bad = await fetch(`${baseUrl}/api/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "arbitrary_spam_event", sessionId: "s1" }),
    });
    expect(bad.status).toBe(400);

    const ok = await fetch(`${baseUrl}/api/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "demo_term_click",
        sessionId: "sess-1",
        path: "/",
        properties: { term: "Machine Epsilon" },
      }),
    });
    expect(ok.status).toBe(204);
  });

  it("denies /api/stats to unauthenticated users and non-admins", async () => {
    process.env.ADMIN_EMAILS = "owner@gmail.com";

    const unauth = await fetch(`${baseUrl}/api/stats`);
    expect(unauth.status).toBe(401);

    const otherUser = await fetch(`${baseUrl}/api/stats`, {
      headers: { Authorization: "Bearer test-user:user-2:visitor@example.com" },
    });
    expect(otherUser.status).toBe(403);
  });

  it("fails closed when ADMIN_EMAILS and ADMIN_USER_IDS are unset", async () => {
    const res = await fetch(`${baseUrl}/api/stats`, {
      headers: { Authorization: "Bearer test-user:user-1:owner@gmail.com" },
    });
    expect(res.status).toBe(403);
  });

  it("returns aggregated stats to the configured admin email or user ID", async () => {
    process.env.ADMIN_EMAILS = "owner@gmail.com";

    await updateSubscription("user-free", {
      email: "student@example.edu",
      plan: "free",
      queriesUsed: 4,
      queriesLimit: 15,
    });
    await updateSubscription("user-pro", {
      email: "pro@example.com",
      plan: "pro",
      queriesUsed: 12,
      queriesLimit: 250,
      budgetUsedMicros: 250_000,
    });

    await fetch(`${baseUrl}/api/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "page_view", sessionId: "sess-a", path: "/" }),
    });
    await fetch(`${baseUrl}/api/analytics/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user:user-free:student@example.edu",
      },
      body: JSON.stringify({
        eventName: "demo_term_click",
        sessionId: "sess-a",
        path: "/",
        properties: { term: "Significand" },
      }),
    });

    const res = await fetch(`${baseUrl}/api/stats?days=7`, {
      headers: { Authorization: "Bearer test-user:admin-1:o.wner+stats@gmail.com" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as StatsResponse;

    expect(data.windowDays).toBe(7);
    expect(data.summary.uniqueSessions).toBe(1);
    expect(data.summary.pageViews).toBe(1);
    expect(data.summary.registeredUsers).toBe(2);
    expect(data.summary.proUsers).toBe(1);
    expect(data.summary.freeUsers).toBe(1);
    expect(data.summary.totalServerCostUsd).toBeCloseTo(0.25, 4);
    expect(data.funnel.demo_term_click).toBe(1);
    expect(data.daily).toHaveLength(7);
    expect(data.users).toHaveLength(2);
    expect(data.recentEvents[0].eventName).toBe("demo_term_click");
  });
});
