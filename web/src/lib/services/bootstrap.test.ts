import { describe, expect, it } from "vitest";
import { bootstrapInputSchema } from "./bootstrap";

describe("bootstrapInputSchema", () => {
  it("requires a password of at least 8 characters", () => {
    const bad = bootstrapInputSchema.safeParse({
      email: "admin@example.com",
      password: "short",
      name: "Admin",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a valid first-admin payload", () => {
    const ok = bootstrapInputSchema.safeParse({
      email: "treasurer@willows.local",
      password: "willows-demo",
      name: "Willows Treasurer",
      communityName: "The Willows",
    });
    expect(ok.success).toBe(true);
  });
});
