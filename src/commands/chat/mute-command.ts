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
import {
    DurationUtils,
    InteractionUtils,
    ModHierarchyUtils,
} from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const LOG_PREFIX = '[Command:Mute]';

export class MuteCommand implements Command {
    public names = [Lang.getRef('chatCommands.mute', Language.Default)];
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
        const durationInput = intr.options.getString(
            Lang.getRef('arguments.duration', Language.Default),
            true
        );
        const reason =
            intr.options.getString(Lang.getRef('arguments.reason', Language.Default)) ??
            'No reason provided.';

        const parsed = DurationUtils.parse(durationInput);
        if (!parsed.ok || !parsed.ms) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.invalidDuration', data.lang, {
                    ERROR: parsed.error ?? Lang.getRef('other.na', data.lang),
                })
            );
            return;
        }

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

        if (targetUser.id === moderator.id) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.modSelf', data.lang)
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

        if (target.isCommunicationDisabled() && target.communicationDisabledUntil) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.alreadyMuted', data.lang, {
                    TARGET: targetUser.toString(),
                    UNTIL: Math.floor(target.communicationDisabledUntil.getTime() / 1000).toString(),
                })
            );
            return;
        }

        try {
            await target.timeout(
                parsed.ms,
                `SufBot | ${moderator.user.tag}: ${reason}`
            );
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to mute user ${targetUser.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.muteFailed', data.lang, {
                    TARGET: targetUser.tag,
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: 'MUTE',
            reason,
            durationMs: parsed.ms,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Muted user ${targetUser.id} (${targetUser.tag}) for ${DurationUtils.humanize(
                parsed.ms
            )} in guild ${intr.guild.id}. Case #${caseRecord.caseId}.`
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
            Lang.getEmbed('displayEmbeds.muteSuccess', data.lang, {
                TARGET: targetUser.toString(),
                DURATION: DurationUtils.humanize(parsed.ms),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
