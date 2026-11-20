import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: mocks }));
vi.mock("next-auth", () => ({ default: () => ({}) }));
import { resolveTenantContext } from "./config";

function query(rows: unknown[]) {
  const q = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), orderBy: vi.fn() };
  q.from.mockReturnValue(q);
  q.where.mockReturnValue(q);
  q.limit.mockResolvedValue(rows);
  q.orderBy.mockResolvedValue(rows);
  return q;
}

describe("default community", () => {
  beforeEach(() => vi.resetAllMocks());
  it("resolves a custom community from membership", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ id: "user", email: "a@example.com", name: "Admin", isPlatformAdmin: false }]))
      .mockReturnValueOnce(query([{ communityId: "custom", role: "community_admin", unitId: null }]))
      .mockReturnValueOnce(query([{ id: "custom", organizationId: "org", slug: "oak-grove" }]));
    expect(await resolveTenantContext("user")).toMatchObject({ communityId: "custom", roles: ["community_admin"] });
  });
  it("does not select an unrelated community for a user without memberships", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ id: "user", isPlatformAdmin: false }]))
      .mockReturnValueOnce(query([]));
    expect(await resolveTenantContext("user")).toBeNull();
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });
});
