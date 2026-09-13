import { prisma } from "../src/lib/prisma";

const statements = [
  `CREATE TABLE IF NOT EXISTS "MtnVerificationBatch" (
    "id" TEXT NOT NULL,
    "batchReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdBy" TEXT,
    "exportedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalNumbers" INTEGER NOT NULL DEFAULT 0,
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MtnVerificationBatch_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MtnVerificationBatch_batchReference_key" ON "MtnVerificationBatch"("batchReference");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationBatch_batchReference_idx" ON "MtnVerificationBatch"("batchReference");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationBatch_status_idx" ON "MtnVerificationBatch"("status");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationBatch_createdAt_idx" ON "MtnVerificationBatch"("createdAt");`,

  `CREATE TABLE IF NOT EXISTS "AcceptedMtnNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "batchId" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcceptedMtnNumber_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AcceptedMtnNumber_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MtnVerificationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AcceptedMtnNumber_normalizedNumber_key" ON "AcceptedMtnNumber"("normalizedNumber");`,
  `CREATE INDEX IF NOT EXISTS "AcceptedMtnNumber_normalizedNumber_idx" ON "AcceptedMtnNumber"("normalizedNumber");`,
  `CREATE INDEX IF NOT EXISTS "AcceptedMtnNumber_source_idx" ON "AcceptedMtnNumber"("source");`,
  `CREATE INDEX IF NOT EXISTS "AcceptedMtnNumber_createdAt_idx" ON "AcceptedMtnNumber"("createdAt");`,
  `CREATE INDEX IF NOT EXISTS "AcceptedMtnNumber_batchId_idx" ON "AcceptedMtnNumber"("batchId");`,

  `CREATE TABLE IF NOT EXISTS "MtnVerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "batchId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MtnVerificationRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MtnVerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MtnVerificationRequest_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MtnVerificationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationRequest_userId_idx" ON "MtnVerificationRequest"("userId");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationRequest_normalizedNumber_idx" ON "MtnVerificationRequest"("normalizedNumber");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationRequest_status_idx" ON "MtnVerificationRequest"("status");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationRequest_batchId_idx" ON "MtnVerificationRequest"("batchId");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationRequest_createdAt_idx" ON "MtnVerificationRequest"("createdAt");`,

  `CREATE TABLE IF NOT EXISTS "MtnVerificationBatchNumber" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "verificationRequestId" TEXT,
    "number" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MtnVerificationBatchNumber_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MtnVerificationBatchNumber_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MtnVerificationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MtnVerificationBatchNumber_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "MtnVerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationBatchNumber_batchId_idx" ON "MtnVerificationBatchNumber"("batchId");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationBatchNumber_verificationRequestId_idx" ON "MtnVerificationBatchNumber"("verificationRequestId");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationBatchNumber_normalizedNumber_idx" ON "MtnVerificationBatchNumber"("normalizedNumber");`,
  `CREATE INDEX IF NOT EXISTS "MtnVerificationBatchNumber_status_idx" ON "MtnVerificationBatchNumber"("status");`,

  `CREATE TABLE IF NOT EXISTS "BlockedMtnNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstUserId" TEXT,
    "lastUserId" TEXT,
    "orderCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlockedMtnNumber_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BlockedMtnNumber_normalizedNumber_key" ON "BlockedMtnNumber"("normalizedNumber");`,
  `CREATE INDEX IF NOT EXISTS "BlockedMtnNumber_normalizedNumber_idx" ON "BlockedMtnNumber"("normalizedNumber");`,
  `CREATE INDEX IF NOT EXISTS "BlockedMtnNumber_status_idx" ON "BlockedMtnNumber"("status");`,
  `CREATE INDEX IF NOT EXISTS "BlockedMtnNumber_lastSeenAt_idx" ON "BlockedMtnNumber"("lastSeenAt");`,
];

async function main() {
  console.log("Running MTN verification schema migration...");
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log("Migration executed successfully!");
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
