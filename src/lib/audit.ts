import { prisma } from "./prisma";

interface AuditInput {
  userId?: string | null;
  actorLabel?: string;
  action: string;
  target: string;
  previousValue?: string | null;
  newValue?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        actorLabel: input.actorLabel ?? "system",
        action: input.action,
        target: input.target,
        previousValue: input.previousValue ?? null,
        newValue: input.newValue ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch {
    // Audit logging must never break the primary operation
  }
}
