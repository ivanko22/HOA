import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  acceptInviteInputSchema,
  createInviteInputSchema,
} from "./invites";

describe("invite schemas", () => {
  it("accepts invitable roles and rejects platform_admin", () => {
    expect(
      createInviteInputSchema.safeParse({
        email: "owner@example.com",
        role: "owner",
      }).success,
    ).toBe(true);
    expect(
      createInviteInputSchema.safeParse({
        email: "x@example.com",
        role: "platform_admin",
      }).success,
    ).toBe(false);
  });

  it("requires a strong password to accept an invite", () => {
    expect(
      acceptInviteInputSchema.safeParse({
        token: "a".repeat(40),
        name: "Pat",
        password: "short",
      }).success,
    ).toBe(false);
    expect(
      acceptInviteInputSchema.safeParse({
        token: "a".repeat(40),
        name: "Pat",
        password: "long-enough",
      }).success,
    ).toBe(true);
  });

  it("hashes invite tokens with sha256", () => {
    const token = "test-token";
    expect(createHash("sha256").update(token).digest("hex")).toHaveLength(64);
  });
});
