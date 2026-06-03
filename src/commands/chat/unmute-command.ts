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

const LOG_PREFIX = '[Command:Unmute]';

export class UnmuteCommand implements Command {
    public names = [Lang.getRef('chatCommands.unmute', Language.Default)];
    public cooldown = new RateLimiter(2, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['ModerateMembers'];

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

        if (!target.isCommunicationDisabled()) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.notMuted', data.lang, {
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
            await target.timeout(null, `SufBot | ${moderator.user.tag}: ${reason}`);
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to unmute user ${targetUser.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.unmuteFailed', data.lang, {
                    TARGET: targetUser.tag,
                })
            );
            return;
        }

        const latestMute = caseService.getLatestActiveCaseForUser(
            intr.guild.id,
            targetUser.id,
            'MUTE'
        );
        if (latestMute) {
            caseService.setCaseActive(intr.guild.id, latestMute.caseId, false);
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: 'UNMUTE',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Unmuted user ${targetUser.id} (${targetUser.tag}) in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: describeMember(target),
            moderatorTag: moderator.user.tag,
            color: 'success',
            extraFields: latestMute
                ? [
                      {
                          name: 'Reversed Case',
                          value: `#${latestMute.caseId} (MUTE) marked inactive.`,
                          inline: true,
                      },
                  ]
                : [],
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.unmuteSuccess', data.lang, {
                TARGET: targetUser.toString(),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
