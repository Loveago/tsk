import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

export interface StagingData {
  filename: string;
  totalRows: number;
  validNumbers: string[];
  portedCount?: number;
  portedNumbers?: string[];
  duplicateCount: number;
  duplicates: string[];
  alreadyAcceptedCount: number;
  alreadyAccepted: string[];
  invalidCount: number;
  invalid: { line: number; raw: string; reason: string }[];
  createdAt: number;
}

const STAGING_DIR = path.join(os.tmpdir(), "tskconnect-mtn-imports");
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function ensureStagingDir() {
  if (!fsSync.existsSync(STAGING_DIR)) {
    try {
      fsSync.mkdirSync(STAGING_DIR, { recursive: true });
    } catch {
      // ignore
    }
  }
}

// In-memory cache for fast lookup if within same process
const memoryCache = new Map<string, { data: StagingData; expiresAt: number }>();

/**
 * Periodically cleans up staging files older than TTL
 */
async function cleanExpiredSessions() {
  try {
    ensureStagingDir();
    const files = await fs.readdir(STAGING_DIR);
    const now = Date.now();

    for (const [id, entry] of memoryCache.entries()) {
      if (entry.expiresAt < now) {
        memoryCache.delete(id);
      }
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(STAGING_DIR, file);
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat && now - stat.mtimeMs > TTL_MS) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

export async function createImportStagingSession(data: Omit<StagingData, "createdAt">): Promise<string> {
  ensureStagingDir();
  cleanExpiredSessions().catch(() => {});

  const sessionId = `mtn_stage_${Date.now()}_${randomUUID().replace(/-/g, "")}`;
  const record: StagingData = {
    ...data,
    createdAt: Date.now(),
  };

  // Cache in memory
  memoryCache.set(sessionId, {
    data: record,
    expiresAt: Date.now() + TTL_MS,
  });

  // Persist to disk
  const filePath = path.join(STAGING_DIR, `${sessionId}.json`);
  await fs.writeFile(filePath, JSON.stringify(record), "utf-8");

  return sessionId;
}

export async function getImportStagingSession(sessionId: string): Promise<StagingData | null> {
  const cached = memoryCache.get(sessionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  ensureStagingDir();
  const filePath = path.join(STAGING_DIR, `${sessionId}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data: StagingData = JSON.parse(raw);
    if (Date.now() - data.createdAt > TTL_MS) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function consumeImportStagingSession(sessionId: string): Promise<string[] | null> {
  const session = await getImportStagingSession(sessionId);
  if (!session) return null;

  // Cleanup after consumption
  memoryCache.delete(sessionId);
  const filePath = path.join(STAGING_DIR, `${sessionId}.json`);
  await fs.unlink(filePath).catch(() => {});

  return session.validNumbers;
}

export async function generateErrorReportCsv(sessionId: string): Promise<string | null> {
  const session = await getImportStagingSession(sessionId);
  if (!session) return null;

  const lines: string[] = ["Type,Line,Raw Value,Reason"];

  for (const item of session.invalid) {
    const rawEscaped = item.raw.replace(/"/g, '""');
    const reasonEscaped = item.reason.replace(/"/g, '""');
    lines.push(`"INVALID",${item.line},"${rawEscaped}","${reasonEscaped}"`);
  }

  for (const num of session.duplicates) {
    const numEscaped = num.replace(/"/g, '""');
    lines.push(`"DUPLICATE_IN_FILE",,"${numEscaped}","Duplicate entry in upload file"`);
  }

  for (const num of session.alreadyAccepted) {
    const numEscaped = num.replace(/"/g, '""');
    lines.push(`"ALREADY_ACCEPTED",,"${numEscaped}","Number is already accepted in database"`);
  }

  return lines.join("\n");
}
