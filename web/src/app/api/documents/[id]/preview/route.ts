import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, resolveTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { can } from "@/lib/domain/permissions";
import { previewCacheKey } from "@/lib/domain/visual-verification";
import { getStorageProvider } from "@/lib/storage";

const bodySchema = z.object({
  page: z.number().int().positive().max(500),
  kind: z.enum(["thumb", "page"]).default("page"),
  dataUrl: z.string().min(32).max(6_000_000),
});

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

async function loadDocument(
  ctx: { organizationId: string; communityId: string },
  id: string,
) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.organizationId, ctx.organizationId),
        eq(documents.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  return doc ?? null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await resolveTenantContext(session.user.id);
  if (!ctx || !can(ctx.capabilities, "documents.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const kind = url.searchParams.get("kind") === "thumb" ? "thumb" : "page";
  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  const doc = await loadDocument(ctx, id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const hash =
    doc.contentHash ||
    createHash("sha256")
      .update(`${doc.id}:${doc.updatedAt?.toISOString() ?? ""}`)
      .digest("hex");
  const key = previewCacheKey({
    communityId: ctx.communityId,
    documentId: doc.id,
    contentHash: hash,
    page,
    kind,
  });
  try {
    const stored = await getStorageProvider().getObject(key);
    return new NextResponse(new Uint8Array(stored.body), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview not cached yet" }, { status: 404 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await resolveTenantContext(session.user.id);
  if (!ctx || !can(ctx.capabilities, "documents.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preview payload" }, { status: 400 });
  }
  const doc = await loadDocument(ctx, id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const png = dataUrlToBuffer(parsed.data.dataUrl);
  if (!png) {
    return NextResponse.json({ error: "Only PNG previews are accepted" }, { status: 400 });
  }
  const hash =
    doc.contentHash ||
    createHash("sha256").update(png).digest("hex");
  const key = previewCacheKey({
    communityId: ctx.communityId,
    documentId: doc.id,
    contentHash: hash,
    page: parsed.data.page,
    kind: parsed.data.kind,
  });
  await getStorageProvider().putObject({
    communityId: ctx.communityId,
    originalFilename: `${parsed.data.kind}-p${parsed.data.page}.png`,
    mimeType: "image/png",
    body: png,
    storageKey: key,
  });
  if (!doc.contentHash) {
    await db
      .update(documents)
      .set({ contentHash: hash, updatedAt: new Date() })
      .where(and(eq(documents.id, doc.id), eq(documents.communityId, ctx.communityId)));
  }
  return NextResponse.json({ ok: true, page: parsed.data.page, kind: parsed.data.kind });
}
