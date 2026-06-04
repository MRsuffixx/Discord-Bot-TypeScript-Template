import { DatabaseSync } from 'node:sqlite';
import { Guild, GuildMember, User } from 'discord.js';

import { getDatabase } from './database-service.js';

export type ModAction =
    | 'BAN'
    | 'UNBAN'
    | 'KICK'
    | 'MUTE'
    | 'UNMUTE'
    | 'TIMEOUT'
    | 'WARN'
    | 'PURGE'
    | 'LOCK'
    | 'UNLOCK'
    | 'SLOWMODE'
    | 'NICK'
    | 'ROLE_ADD'
    | 'ROLE_REMOVE'
    | 'NOTE';

export interface ModCase {
    caseId: number;
    guildId: string;
    targetId: string;
    moderatorId: string;
    action: ModAction;
    reason: string;
    durationMs: number | null;
    active: boolean;
    createdAt: number;
}

export interface ModCaseInsert {
    guildId: string;
    targetId: string;
    moderatorId: string;
    action: ModAction;
    reason: string;
    durationMs?: number | null;
    active?: boolean;
}

interface CaseRow {
    case_id: number;
    guild_id: string;
    target_id: string;
    moderator_id: string;
    action: string;
    reason: string;
    duration_ms: number | null;
    active: number;
    created_at: number;
}

function rowToCase(row: CaseRow): ModCase {
    return {
        caseId: row.case_id,
        guildId: row.guild_id,
        targetId: row.target_id,
        moderatorId: row.moderator_id,
        action: row.action as ModAction,
        reason: row.reason,
        durationMs: row.duration_ms,
        active: row.active === 1,
        createdAt: row.created_at,
    };
}

export class CaseService {
    public createCase(input: ModCaseInsert): ModCase {
        const db: DatabaseSync = getDatabase();
        const now = Date.now();

        db.exec('BEGIN');
        try {
            const existing = db
                .prepare('SELECT next_id FROM case_counters WHERE guild_id = ?')
                .get(input.guildId) as { next_id: number } | undefined;

            let nextId: number;
            if (existing) {
                nextId = existing.next_id;
                db.prepare('UPDATE case_counters SET next_id = next_id + 1 WHERE guild_id = ?').run(
                    input.guildId
                );
            } else {
                nextId = 1;
                db.prepare('INSERT INTO case_counters (guild_id, next_id) VALUES (?, 2)').run(
                    input.guildId
                );
            }

            const caseId = nextId - 1;

            db.prepare(
                `INSERT INTO cases
                    (case_id, guild_id, target_id, moderator_id, action,
                     reason, duration_ms, active, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                caseId,
                input.guildId,
                input.targetId,
                input.moderatorId,
                input.action,
                input.reason || 'No reason provided.',
                input.durationMs ?? null,
                (input.active ?? true) ? 1 : 0,
                now
            );

            db.exec('COMMIT');

            return {
                caseId,
                guildId: input.guildId,
                targetId: input.targetId,
                moderatorId: input.moderatorId,
                action: input.action,
                reason: input.reason || 'No reason provided.',
                durationMs: input.durationMs ?? null,
                active: input.active ?? true,
                createdAt: now,
            };
        } catch (error) {
            try {
                db.exec('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            throw error;
        }
    }

    public getCase(guildId: string, caseId: number): ModCase | null {
        const row = getDatabase()
            .prepare(
                `SELECT case_id, guild_id, target_id, moderator_id, action,
                        reason, duration_ms, active, created_at
                 FROM cases WHERE guild_id = ? AND case_id = ?`
            )
            .get(guildId, caseId) as CaseRow | undefined;

        return row ? rowToCase(row) : null;
    }

    public getCasesForUser(
        guildId: string,
        targetId: string,
        limit: number = 50,
        offset: number = 0
    ): ModCase[] {
        const rows = getDatabase()
            .prepare(
                `SELECT case_id, guild_id, target_id, moderator_id, action,
                        reason, duration_ms, active, created_at
                 FROM cases
                 WHERE guild_id = ? AND target_id = ?
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`
            )
            .all(guildId, targetId, limit, offset) as CaseRow[];

        return rows.map(rowToCase);
    }

    public countCasesForUser(guildId: string, targetId: string): number {
        const row = getDatabase()
            .prepare(`SELECT COUNT(*) AS count FROM cases WHERE guild_id = ? AND target_id = ?`)
            .get(guildId, targetId) as { count: number };
        return row.count;
    }

    public setCaseActive(guildId: string, caseId: number, active: boolean): void {
        getDatabase()
            .prepare(`UPDATE cases SET active = ? WHERE guild_id = ? AND case_id = ?`)
            .run(active ? 1 : 0, guildId, caseId);
    }

    public getLatestActiveCaseForUser(
        guildId: string,
        targetId: string,
        action: ModAction
    ): ModCase | null {
        const row = getDatabase()
            .prepare(
                `SELECT case_id, guild_id, target_id, moderator_id, action,
                        reason, duration_ms, active, created_at
                 FROM cases
                 WHERE guild_id = ? AND target_id = ? AND action = ? AND active = 1
                 ORDER BY created_at DESC
                 LIMIT 1`
            )
            .get(guildId, targetId, action) as CaseRow | undefined;

        return row ? rowToCase(row) : null;
    }
}

interface WarningRow {
    warning_id: number;
    case_id: number;
    guild_id: string;
    user_id: string;
    moderator_id: string;
    reason: string;
    created_at: number;
}

export class WarningService {
    public addWarning(
        guildId: string,
        userId: string,
        moderatorId: string,
        reason: string,
        caseId: number
    ): { warningId: number; createdAt: number } {
        const createdAt = Date.now();
        const result = getDatabase()
            .prepare(
                `INSERT INTO warnings
                    (case_id, guild_id, user_id, moderator_id, reason, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(caseId, guildId, userId, moderatorId, reason || 'No reason provided.', createdAt) as {
            lastInsertRowid: number | bigint;
            changes: number;
        };
        return { warningId: Number(result.lastInsertRowid), createdAt };
    }

    public getWarningsForUser(
        guildId: string,
        userId: string,
        limit: number = 10,
        offset: number = 0
    ): Array<{
        warningId: number;
        caseId: number;
        guildId: string;
        userId: string;
        moderatorId: string;
        reason: string;
        createdAt: number;
    }> {
        const rows = getDatabase()
            .prepare(
                `SELECT warning_id, case_id, guild_id, user_id, moderator_id, reason, created_at
                 FROM warnings
                 WHERE guild_id = ? AND user_id = ?
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`
            )
            .all(guildId, userId, limit, offset) as WarningRow[];

        return rows.map(row => ({
            warningId: row.warning_id,
            caseId: row.case_id,
            guildId: row.guild_id,
            userId: row.user_id,
            moderatorId: row.moderator_id,
            reason: row.reason,
            createdAt: row.created_at,
        }));
    }

    public countWarningsForUser(guildId: string, userId: string): number {
        const row = getDatabase()
            .prepare(`SELECT COUNT(*) AS count FROM warnings WHERE guild_id = ? AND user_id = ?`)
            .get(guildId, userId) as { count: number };
        return row.count;
    }
}

export class ChannelLockService {
    public recordLock(channelId: string, guildId: string, payload: string): void {
        getDatabase()
            .prepare(
                `INSERT INTO channel_locks (channel_id, guild_id, payload, locked_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(channel_id) DO UPDATE SET
                     payload = excluded.payload,
                     locked_at = excluded.locked_at`
            )
            .run(channelId, guildId, payload, Date.now());
    }

    public consumeLock(channelId: string): { guildId: string; payload: string } | null {
        const db = getDatabase();
        const row = db
            .prepare(`SELECT guild_id, payload FROM channel_locks WHERE channel_id = ?`)
            .get(channelId) as { guild_id: string; payload: string } | undefined;
        if (!row) return null;
        db.prepare(`DELETE FROM channel_locks WHERE channel_id = ?`).run(channelId);
        return { guildId: row.guild_id, payload: row.payload };
    }

    public peekLock(channelId: string): { guildId: string; payload: string } | null {
        const row = getDatabase()
            .prepare(`SELECT guild_id, payload FROM channel_locks WHERE channel_id = ?`)
            .get(channelId) as { guild_id: string; payload: string } | undefined;
        return row ? { guildId: row.guild_id, payload: row.payload } : null;
    }
}

export const caseService = new CaseService();
export const warningService = new WarningService();
export const channelLockService = new ChannelLockService();

export function describeTarget(guild: Guild | null, user: User): string {
    return user.bot ? `${user.tag} (bot)` : user.tag;
}

export function describeMember(member: GuildMember): string {
    return describeTarget(member.guild, member.user);
}

export { closeDatabase } from './database-service.js';
