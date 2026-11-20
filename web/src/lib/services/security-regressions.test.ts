import { beforeEach, describe, expect, it, vi } from "vitest";
import { hash, compare } from "bcryptjs";
import { capabilitiesForRoles, type TenantContext } from "@/lib/domain/permissions";

const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: mocks }));
import { acceptInvite } from "./invites";
import { addManualFact } from "./documents";

function result(rows: unknown[]) {
  const query = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.limit.mockResolvedValue(rows);
  return query;
}

describe("security regressions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects an invite holder who does not know the existing account password", async () => {
    const passwordHash = await hash("original-password", 4);
    mocks.select
      .mockReturnValueOnce(result([{
        id: "invite", email: "existing@example.com", expiresAt: new Date(Date.now() + 60000),
        revokedAt: null, acceptedAt: null,
      }]))
      .mockReturnValueOnce(result([{ id: "user", passwordHash }]));
    await expect(acceptInvite({ token: "x".repeat(40), name: "Attacker", password: "new-password" }))
      .rejects.toThrow("existing account password");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(await compare("original-password", passwordHash)).toBe(true);
  });

  it("requires verification capability before creating a verified fact", async () => {
    const ctx = { capabilities: capabilitiesForRoles(["property_manager"]) } as TenantContext;
    await expect(addManualFact(ctx, {
      documentId: "00000000-0000-4000-8000-000000000001",
      factType: "cash_balance", label: "Cash", numericValue: "100.00",
      verificationStatus: "verified",
    })).rejects.toThrow("finance.verify");
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
