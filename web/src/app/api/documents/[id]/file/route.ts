import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth, resolveTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { can } from "@/lib/domain/permissions";
import { getStorageProvider } from "@/lib/storage";

export async function GET(
  _request: Request,
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

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.byteSize <= 0) {
    return NextResponse.json(
      { error: "No file bytes stored for this catalog entry" },
      { status: 404 },
    );
  }

  try {
    const file = await getStorageProvider().getObject(doc.storageKey);
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.mimeType ?? doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.originalFilename ?? "document"}"`,
        "Content-Length": String(file.body.byteLength),
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
}
