import { AuthSessionId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";

import { canManageAuthAccess, projectAuthAccess } from "./connections.ts";

describe("connections presentation", () => {
  it("sorts current and connected clients before offline clients", () => {
    const presentation = projectAuthAccess({
      pairingLinks: [],
      clientSessions: [
        {
          sessionId: AuthSessionId.make("offline"),
          subject: "offline-subject",
          scopes: ["orchestration:read"],
          method: "browser-session-cookie",
          client: { deviceType: "unknown" },
          issuedAt: DateTime.makeUnsafe("2026-07-27T10:00:00.000Z"),
          expiresAt: DateTime.makeUnsafe("2026-08-27T10:00:00.000Z"),
          lastConnectedAt: null,
          connected: false,
          current: false,
        },
        {
          sessionId: AuthSessionId.make("connected"),
          subject: "connected-subject",
          scopes: ["orchestration:read", "orchestration:operate"],
          method: "bearer-access-token",
          client: { label: "Phone", deviceType: "mobile", os: "iOS" },
          issuedAt: DateTime.makeUnsafe("2026-07-27T09:00:00.000Z"),
          expiresAt: DateTime.makeUnsafe("2026-08-27T09:00:00.000Z"),
          lastConnectedAt: DateTime.makeUnsafe("2026-07-27T09:30:00.000Z"),
          connected: true,
          current: false,
        },
        {
          sessionId: AuthSessionId.make("current"),
          subject: "current-subject",
          scopes: ["orchestration:read"],
          method: "bearer-access-token",
          client: { deviceType: "desktop", os: "macOS", browser: "Lynxtron" },
          issuedAt: DateTime.makeUnsafe("2026-07-27T08:00:00.000Z"),
          expiresAt: DateTime.makeUnsafe("2026-08-27T08:00:00.000Z"),
          lastConnectedAt: DateTime.makeUnsafe("2026-07-27T08:30:00.000Z"),
          connected: true,
          current: true,
        },
      ],
    });

    expect(presentation.clientSessions.map((session) => session.sessionId)).toEqual([
      "current",
      "connected",
      "offline",
    ]);
    expect(presentation.clientSessions[0]).toMatchObject({
      primaryLabel: "macOS · Lynxtron",
      deviceInfoBits: ["Desktop", "macOS", "Lynxtron"],
      isLive: true,
      scopeCount: 1,
    });
    expect(presentation.clientSessions[1]).toMatchObject({
      primaryLabel: "Phone",
      deviceInfoBits: ["Mobile", "iOS"],
      isLive: true,
      scopeCount: 2,
    });
  });

  it("sorts pairing links newest first and excludes credentials", () => {
    const presentation = projectAuthAccess({
      pairingLinks: [
        {
          id: "older",
          credential: "older-secret",
          scopes: ["orchestration:read"],
          subject: "subject",
          createdAt: DateTime.makeUnsafe("2026-07-27T08:00:00.000Z"),
          expiresAt: DateTime.makeUnsafe("2026-07-27T08:05:00.000Z"),
        },
        {
          id: "newer",
          credential: "newer-secret",
          scopes: ["orchestration:read", "orchestration:operate"],
          subject: "subject",
          label: "Tablet",
          createdAt: DateTime.makeUnsafe("2026-07-27T09:00:00.000Z"),
          expiresAt: DateTime.makeUnsafe("2026-07-27T09:05:00.000Z"),
        },
      ],
      clientSessions: [],
    });

    expect(presentation.pairingLinks).toEqual([
      {
        id: "newer",
        label: "Tablet",
        subject: "subject",
        scopes: ["orchestration:read", "orchestration:operate"],
        scopeCount: 2,
        createdAt: "2026-07-27T09:00:00.000Z",
        expiresAt: "2026-07-27T09:05:00.000Z",
      },
      {
        id: "older",
        label: "Pairing link",
        subject: "subject",
        scopes: ["orchestration:read"],
        scopeCount: 1,
        createdAt: "2026-07-27T08:00:00.000Z",
        expiresAt: "2026-07-27T08:05:00.000Z",
      },
    ]);
    expect(JSON.stringify(presentation)).not.toContain("secret");
  });

  it("summarizes empty and populated access inventory", () => {
    expect(projectAuthAccess({ pairingLinks: [], clientSessions: [] })).toMatchObject({
      pairingLinkCount: 0,
      clientSessionCount: 0,
      hasEntries: false,
    });
  });

  it("derives access management from the current session write scope", () => {
    const presentation = projectAuthAccess({
      pairingLinks: [],
      clientSessions: [
        {
          sessionId: AuthSessionId.make("other-admin"),
          subject: "other-admin",
          scopes: ["access:write"],
          method: "bearer-access-token",
          client: { deviceType: "desktop" },
          issuedAt: DateTime.makeUnsafe("2026-07-27T08:00:00.000Z"),
          expiresAt: DateTime.makeUnsafe("2026-08-27T08:00:00.000Z"),
          lastConnectedAt: null,
          connected: true,
          current: false,
        },
        {
          sessionId: AuthSessionId.make("current-reader"),
          subject: "current-reader",
          scopes: ["access:read"],
          method: "bearer-access-token",
          client: { deviceType: "desktop" },
          issuedAt: DateTime.makeUnsafe("2026-07-27T09:00:00.000Z"),
          expiresAt: DateTime.makeUnsafe("2026-08-27T09:00:00.000Z"),
          lastConnectedAt: null,
          connected: true,
          current: true,
        },
      ],
    });

    expect(canManageAuthAccess(presentation)).toBe(false);
    expect(
      canManageAuthAccess({
        ...presentation,
        clientSessions: presentation.clientSessions.map((session) =>
          session.current ? { ...session, scopes: ["access:read", "access:write"] } : session,
        ),
      }),
    ).toBe(true);
  });
});
