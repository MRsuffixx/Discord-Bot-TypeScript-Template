import { ChatInputCommandInteraction, GuildMember, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

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

const LOG_PREFIX = '[Command:Kick]';

export class KickCommand implements Command {
    public names = [Lang.getRef('chatCommands.kick', Language.Default)];
    public cooldown = new RateLimiter(2, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['KickMembers'];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        if (!intr.guild) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        const targetUser = intr.options.getUser(
            Lang.getRef('arguments.user', Language.Default),
            true
        );
        const reason = intr.options.getString(
            Lang.getRef('arguments.reason', Language.Default),
            true
        );

        const moderator = intr.member as GuildMember | null;
        if (!moderator) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        if (targetUser.id === moderator.id) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.modSelf', data.lang)
            );
            return;
        }
        if (targetUser.id === intr.client.user?.id) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.modBot', data.lang)
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

        let target: GuildMember | undefined;
        try {
            target = await intr.guild.members.fetch(targetUser.id);
        } catch {
            target = undefined;
        }

        if (!target) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.notInGuild', data.lang, {
                    TARGET: targetUser.toString(),
                })
            );
            return;
        }

        const hierarchy = ModHierarchyUtils.canActOn(
            moderator,
            target,
            intr.guild.members.me as GuildMember
        );
        if (!hierarchy.ok) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.hierarchy', data.lang, {
                    REASON: hierarchy.reason ?? Lang.getRef('other.na', data.lang),
                })
            );
            return;
        }

        try {
            await target.kick(`SufBot | ${moderator.user.tag}: ${reason}`);
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to kick user ${targetUser.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.kickFailed', data.lang, {
                    TARGET: targetUser.tag,
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: 'KICK',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.warn(
            `${LOG_PREFIX} Kicked user ${targetUser.id} (${targetUser.tag}) in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}. Reason: ${reason}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: describeMember(target),
            moderatorTag: moderator.user.tag,
            color: 'warning',
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.kickSuccess', data.lang, {
                TARGET: targetUser.toString(),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
