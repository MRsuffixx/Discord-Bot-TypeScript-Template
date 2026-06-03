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

const LOG_PREFIX = '[Command:Timeout]';

export class TimeoutCommand implements Command {
    public names = [Lang.getRef('chatCommands.timeout', Language.Default)];
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

        try {
            await target.timeout(
                parsed.ms,
                `SufBot | ${moderator.user.tag}: ${reason}`
            );
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to timeout user ${targetUser.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.timeoutFailed', data.lang, {
                    TARGET: targetUser.tag,
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: 'TIMEOUT',
            reason,
            durationMs: parsed.ms,
            active: true,
        });

        const untilUnix = Math.floor((Date.now() + parsed.ms) / 1000);

        Logger.info(
            `${LOG_PREFIX} Timed out user ${targetUser.id} (${targetUser.tag}) for ${DurationUtils.humanize(
                parsed.ms
            )} in guild ${intr.guild.id}. Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: describeMember(target),
            moderatorTag: moderator.user.tag,
            color: 'warning',
            extraFields: [
                {
                    name: 'Until',
                    value: `<t:${untilUnix}:F> (<t:${untilUnix}:R>)`,
                    inline: false,
                },
            ],
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.timeoutSuccess', data.lang, {
                TARGET: targetUser.toString(),
                DURATION: DurationUtils.humanize(parsed.ms),
                UNTIL: untilUnix.toString(),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
