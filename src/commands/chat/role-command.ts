import { ChatInputCommandInteraction, GuildMember, PermissionsString, Role } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { RoleAction } from '../../enums/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import {
    buildModLogEmbed,
    caseService,
    describeMember,
    Lang,
    Logger,
    sendModLog,
} from '../../services/index.js';
import { InteractionUtils, ModHierarchyUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const LOG_PREFIX = '[Command:Role]';

export class RoleCommand implements Command {
    public names = [Lang.getRef('chatCommands.role', Language.Default)];
    public cooldown = new RateLimiter(2, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['ManageRoles'];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        if (!intr.guild) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        const action = intr.options.getString(
            Lang.getRef('arguments.action', Language.Default),
            true
        ) as RoleAction;
        const targetUser = intr.options.getUser(
            Lang.getRef('arguments.user', Language.Default),
            true
        );
        const role = intr.options.getRole(
            Lang.getRef('arguments.role', Language.Default),
            true
        ) as Role;
        const reason =
            intr.options.getString(Lang.getRef('arguments.reason', Language.Default)) ??
            'No reason provided.';

        const moderator = intr.member as GuildMember | null;
        if (!moderator) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        if (targetUser.id === intr.guild.ownerId) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.modOwner', data.lang)
            );
            return;
        }

        const roleCheck = ModHierarchyUtils.canManageRole(
            moderator,
            role,
            intr.guild.members.me as GuildMember
        );
        if (!roleCheck.ok) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.hierarchy', data.lang, {
                    REASON: roleCheck.reason ?? Lang.getRef('other.na', data.lang),
                })
            );
            return;
        }

        let target: GuildMember;
        try {
            target = await intr.guild.members.fetch(targetUser.id);
        } catch {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.notInGuild', data.lang, {
                    TARGET: targetUser.toString(),
                })
            );
            return;
        }

        const memberCheck = ModHierarchyUtils.canActOn(
            moderator,
            target,
            intr.guild.members.me as GuildMember
        );
        if (!memberCheck.ok) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.hierarchy', data.lang, {
                    REASON: memberCheck.reason ?? Lang.getRef('other.na', data.lang),
                })
            );
            return;
        }

        const hasRole = target.roles.cache.has(role.id);
        if (action === RoleAction.ADD && hasRole) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.roleAlreadyAssigned', data.lang, {
                    TARGET: targetUser.toString(),
                    ROLE: role.toString(),
                })
            );
            return;
        }
        if (action === RoleAction.REMOVE && !hasRole) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.roleNotAssigned', data.lang, {
                    TARGET: targetUser.toString(),
                    ROLE: role.toString(),
                })
            );
            return;
        }

        try {
            if (action === RoleAction.ADD) {
                await target.roles.add(
                    role,
                    `SufBot | ${moderator.user.tag}: ${reason}`
                );
            } else {
                await target.roles.remove(
                    role,
                    `SufBot | ${moderator.user.tag}: ${reason}`
                );
            }
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to ${action} role ${role.id} for user ${targetUser.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.roleFailed', data.lang, {
                    ACTION: action,
                    TARGET: targetUser.tag,
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: action === RoleAction.ADD ? 'ROLE_ADD' : 'ROLE_REMOVE',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} ${action.toUpperCase()} role ${role.id} (${role.name}) ` +
                `${action === RoleAction.ADD ? 'to' : 'from'} ${targetUser.id} (${targetUser.tag}) in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: describeMember(target),
            moderatorTag: moderator.user.tag,
            color: action === RoleAction.ADD ? 'success' : 'warning',
            extraFields: [{ name: 'Role', value: role.toString(), inline: true }],
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed(action === RoleAction.ADD
                ? 'displayEmbeds.roleAddSuccess'
                : 'displayEmbeds.roleRemoveSuccess', data.lang, {
                TARGET: targetUser.toString(),
                ROLE: role.toString(),
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
