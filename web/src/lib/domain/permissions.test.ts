import { describe, expect, it } from "vitest";
import {
  assertCan,
  AuthorizationError,
  capabilitiesForRoles,
  can,
} from "./permissions";

describe("permissions", () => {
  it("gives treasurer post but not member manage", () => {
    const caps = capabilitiesForRoles(["treasurer"]);
    expect(can(caps, "finance.post")).toBe(true);
    expect(can(caps, "community.members.manage")).toBe(false);
    expect(can(caps, "import.csv")).toBe(true);
    expect(can(caps, "import.approve")).toBe(true);
  });

  it("allows property manager to import but not approve", () => {
    const caps = capabilitiesForRoles(["property_manager"]);
    expect(can(caps, "import.csv")).toBe(true);
    expect(can(caps, "import.approve")).toBe(false);
  });

  it("gives owner transparency but not finance.write", () => {
    const caps = capabilitiesForRoles(["owner"]);
    expect(can(caps, "transparency.read")).toBe(true);
    expect(can(caps, "finance.write")).toBe(false);
    expect(can(caps, "audit.read")).toBe(false);
  });

  it("assertCan throws AuthorizationError", () => {
    const caps = capabilitiesForRoles(["auditor"]);
    expect(() => assertCan(caps, "finance.write")).toThrow(AuthorizationError);
  });

  it("unions multiple roles", () => {
    const caps = capabilitiesForRoles(["owner", "treasurer"]);
    expect(can(caps, "finance.post")).toBe(true);
    expect(can(caps, "unit.read_own")).toBe(true);
  });
});
