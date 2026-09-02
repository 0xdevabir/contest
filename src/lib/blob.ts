import { createHash, createHmac, timingSafeEqual } from "crypto";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Blobs are content-addressed by SHA-256 so identical test data across
 * versions/problems is stored once. Callers pass a logical `key` (e.g.
 * `tests/{problemId}/{versionId}/{caseId}.in`) — the driver is free to use it
 * as-is (fs) or namespace it under a bucket prefix (s3); either way the
 * returned `hash` is always the content hash, independent of the key.
 */
export interface BlobStore {
  put(
    key: string,
    body: Buffer | string,
    meta?: { contentType?: string }
  ): Promise<{ key: string; hash: string; bytes: number }>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<ReadableStream>;
  signedUrl(key: string, ttlSec: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function sha256(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

function nodeStreamToWeb(stream: NodeJS.ReadableStream): ReadableStream {
  return Readable.toWeb(stream as Readable) as ReadableStream;
}

// --- Filesystem driver (dev default) ---------------------------------

class FsBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Blob keys are server-generated (content hashes / problem ids), never
    // taken verbatim from client input, but normalise defensively anyway —
    // a key must resolve to a path inside root.
    const normalized = path.normalize(key).replace(/^([./\\]+)/, "");
    const full = path.join(this.root, normalized);
    if (!full.startsWith(this.root)) {
      throw new Error(`Blob key escapes storage root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer | string) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
    return { key, hash: sha256(buf), bytes: buf.length };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async getStream(key: string): Promise<ReadableStream> {
    return nodeStreamToWeb(createReadStream(this.resolve(key)));
  }

  async signedUrl(key: string, ttlSec: number): Promise<string> {
    const token = signFsBlobToken(key, ttlSec);
    return `/api/blob/${encodeURIComponent(key)}?token=${token}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

// --- S3 / R2 driver (production) --------------------------------------

class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(opts: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer | string, meta?: { contentType?: string }) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buf,
        ContentType: meta?.contentType,
      })
    );
    return { key, hash: sha256(buf), bytes: buf.length };
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Blob not found: ${key}`);
    return Buffer.from(bytes);
  }

  async getStream(key: string): Promise<ReadableStream> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Blob not found: ${key}`);
    return res.Body.transformToWebStream();
  }

  async signedUrl(key: string, ttlSec: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSec,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * The fs driver has no real object-storage signing, so a same-origin route
 * (`/api/blob/[...key]`) stands in for it, gated by a short-lived HMAC token
 * instead of a session cookie — the caller already checked ownership before
 * minting this URL (e.g. the publish gate response), and the token itself is
 * what makes the URL bearer-safe to hand to the browser.
 */
function signFsBlobToken(key: string, ttlSec: number): string {
  const secret = process.env.AUTH_SECRET ?? "dev-insecure-blob-secret";
  const expires = Date.now() + ttlSec * 1000;
  const payload = `${key}:${expires}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${expires}.${sig}`;
}

export function verifyFsBlobToken(key: string, token: string): boolean {
  const [expiresStr, sig] = token.split(".");
  if (!expiresStr || !sig) return false;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  const secret = process.env.AUTH_SECRET ?? "dev-insecure-blob-secret";
  const payload = `${key}:${expires}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

let cached: BlobStore | null = null;

export function getBlobStore(): BlobStore {
  if (cached) return cached;

  const driver = process.env.BLOB_DRIVER === "s3" ? "s3" : "fs";

  if (driver === "s3") {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        "BLOB_DRIVER=s3 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET"
      );
    }
    cached = new S3BlobStore({ accountId, accessKeyId, secretAccessKey, bucket });
    return cached;
  }

  cached = new FsBlobStore(path.join(process.cwd(), ".data", "blobs"));
  return cached;
}

/** Test-only: forces the next getBlobStore() call to re-resolve the driver. */
export function _resetBlobStoreForTests(): void {
  cached = null;
}

/**
 * Production startup/health check: a real put → get → delete round trip
 * against the configured driver. Used by /admin/system so a misconfigured
 * blob backend is caught before a teacher's first upload fails.
 */
export async function blobHealthCheck(): Promise<{ ok: boolean; message?: string }> {
  const store = getBlobStore();
  const key = `_health/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const payload = "contesthub-blob-health-check";
  try {
    await store.put(key, payload);
    const read = await store.get(key);
    if (read.toString("utf8") !== payload) {
      return { ok: false, message: "Round-trip content mismatch" };
    }
    await store.delete(key);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
