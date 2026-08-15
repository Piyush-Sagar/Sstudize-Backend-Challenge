import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export type AuditEvent =
  | 'REGISTER_SUCCESS'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'OTP_SENT'
  | 'OTP_FAILED'
  | 'OTP_VERIFIED'
  | 'TOKEN_REFRESHED'
  | 'LOGOUT'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_SUCCESS'
  | 'TWO_FA_ENABLED'
  | 'TWO_FA_DISABLED'
  | 'REFRESH_TOKEN_REUSE_DETECTED';

export interface AuditLogEntry {
  userId?: string;
  event: AuditEvent;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

type AuditLogSelect = {
  id: true;
  event: true;
  metadata: true;
  ip: true;
  userAgent: true;
  createdAt: true;
  userId?: true;
};

export const auditService = {
  /**
   * Log an authentication event
   * Never logs sensitive data (passwords, tokens, OTPs)
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          event: entry.event,
          metadata: entry.metadata as Prisma.InputJsonValue | undefined,
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (error) {
      // Audit logging should never break the main flow
      console.error('❌ Audit log failed:', error);
    }
  },

  /**
   * Get audit logs for a user (for admin/debugging)
   */
  async getUserLogs(userId: string, limit: number = 50): Promise<Array<{
    id: string;
    event: string;
    metadata: Prisma.JsonValue | null;
    ip: string | null;
    userAgent: string | null;
    createdAt: Date;
  }>> {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        event: true,
        metadata: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    });
  },

  /**
   * Get recent audit logs (for monitoring)
   */
  async getRecentLogs(limit: number = 100): Promise<Array<{
    id: string;
    userId: string | null;
    event: string;
    metadata: Prisma.JsonValue | null;
    ip: string | null;
    userAgent: string | null;
    createdAt: Date;
  }>> {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        event: true,
        metadata: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    });
  },
};