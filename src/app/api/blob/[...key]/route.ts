import { NextRequest, NextResponse } from "next/server";
import { getBlobStore, verifyFsBlobToken } from "@/lib/blob";
import { NotFoundError, ForbiddenError, toResponse } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ key: string[] }> };

/**
 * Backs the fs blob driver's signedUrl() in local/dev — the S3/R2 driver
 * hands out a real presigned URL and never routes through here. Access is
 * gated by a short-lived HMAC token minted by the caller that already
 * verified ownership (see blob.ts's signFsBlobToken), not by re-checking the
 * session here — there is no user/problem context left by the time a raw
 * blob key reaches this route.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { key } = await params;
    const blobKey = key.join("/");
    const token = req.nextUrl.searchParams.get("token");
    if (!token || !verifyFsBlobToken(blobKey, token)) {
      throw new ForbiddenError("Invalid or expired blob link.");
    }

    const store = getBlobStore();
    if (!(await store.exists(blobKey))) {
      throw new NotFoundError("Blob not found");
    }
    const buf = await store.get(blobKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
