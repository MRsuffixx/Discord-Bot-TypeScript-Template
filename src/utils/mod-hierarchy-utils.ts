import {
    Guild,
    GuildMember,
    PermissionFlagsBits,
    PermissionsString,
    Role,
} from 'discord.js';

export interface HierarchyCheckResult {
    ok: boolean;
    reason?: string;
}

export class ModHierarchyUtils {
    public static canActOn(
        moderator: GuildMember,
        target: GuildMember,
        botMember: GuildMember
    ): HierarchyCheckResult {
        if (target.id === moderator.id) {
            return { ok: false, reason: 'You cannot perform this action on yourself.' };
        }
        if (target.id === botMember.id) {
            return { ok: false, reason: 'I cannot perform this action on myself.' };
        }
        if (target.id === moderator.guild.ownerId) {
            return { ok: false, reason: 'You cannot act on the server owner.' };
        }
        if (target.roles.highest.position >= moderator.roles.highest.position) {
            return {
                ok: false,
                reason: 'You cannot act on a member with a role equal to or higher than yours.',
            };
        }
        if (
            target.roles.highest.position >= botMember.roles.highest.position ||
            !botMember.roles.highest.position
        ) {
            return {
                ok: false,
                reason: 'I cannot act on a member with a role equal to or higher than mine.',
            };
        }
        return { ok: true };
    }

    public static canManageRole(
        moderator: GuildMember,
        role: Role,
        botMember: GuildMember
    ): HierarchyCheckResult {
        if (role.id === moderator.guild.id) {
            return { ok: false, reason: 'The @everyone role cannot be assigned manually.' };
        }
        if (role.managed) {
            return {
                ok: false,
                reason: 'This role is managed by an integration and cannot be assigned manually.',
            };
        }
        if (role.position >= moderator.roles.highest.position) {
            return {
                ok: false,
                reason: 'You cannot manage a role equal to or higher than your highest role.',
            };
        }
        if (role.position >= botMember.roles.highest.position) {
            return {
                ok: false,
                reason: 'I cannot manage a role equal to or higher than my highest role.',
            };
        }
        return { ok: true };
    }

    public static guildHasPerms(
        guild: Guild,
        permissions: PermissionsString[]
    ): { ok: boolean; missing: PermissionsString[] } {
        const me = guild.members.me;
        if (!me) return { ok: false, missing: permissions };
        const missing = permissions.filter(p => !me.permissions.has(p as PermissionFlagsBits));
        return { ok: missing.length === 0, missing };
    }
}
