import {
    ChatInputCommandInteraction,
    GuildMember,
    NewsChannel,
    PermissionsString,
    TextChannel,
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import {
    buildModLogEmbed,
    caseService,
    Lang,
    Logger,
    sendModLog,
} from '../../services/index.js';
import {
    DurationUtils,
    InteractionUtils,
} from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const LOG_PREFIX = '[Command:Slowmode]';

const MAX_SLOWMODE_SECONDS = 6 * 60 * 60;

export class SlowmodeCommand implements Command {
    public names = [Lang.getRef('chatCommands.slowmode', Language.Default)];
    public cooldown = new RateLimiter(2, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['ManageChannels'];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        if (!intr.guild) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        const channelOption = intr.options.getChannel(Lang.getRef('arguments.channel', Language.Default));
        const durationInput = intr.options.getString(
            Lang.getRef('arguments.duration', Language.Default),
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

        let targetChannel: TextChannel | NewsChannel | null = null;
        if (channelOption && (channelOption instanceof TextChannel || channelOption instanceof NewsChannel)) {
            targetChannel = channelOption;
        } else if (intr.channel instanceof TextChannel || intr.channel instanceof NewsChannel) {
            targetChannel = intr.channel;
        }

        if (!targetChannel) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.invalidChannel', data.lang)
            );
            return;
        }

        const normalized = durationInput.trim().toLowerCase();
        if (normalized === 'off' || normalized === 'disable' || normalized === '0s' || normalized === '0') {
            try {
                await targetChannel.setRateLimitPerUser(0, `SufBot | ${moderator.user.tag}: ${reason}`);
            } catch (error) {
                Logger.error(
                    `${LOG_PREFIX} Failed to disable slowmode on ${targetChannel.id}.`,
                    error
                );
                await InteractionUtils.send(
                    intr,
                    Lang.getEmbed('errorEmbeds.slowmodeFailed', data.lang, {
                        CHANNEL: targetChannel.toString(),
                    })
                );
                return;
            }

            const caseRecord = caseService.createCase({
                guildId: intr.guild.id,
                targetId: targetChannel.id,
                moderatorId: moderator.id,
                action: 'SLOWMODE',
                reason: `${reason} (disabled)`,
                durationMs: 0,
                active: true,
            });

            Logger.info(
                `${LOG_PREFIX} Disabled slowmode on ${targetChannel.id}. Case #${caseRecord.caseId}.`
            );

            const embed = buildModLogEmbed({
                caseRecord,
                targetTag: `#${targetChannel.name}`,
                moderatorTag: moderator.user.tag,
                color: 'success',
            });
            await sendModLog(intr.guild, embed);

            await InteractionUtils.send(
                intr,
                Lang.getEmbed('displayEmbeds.slowmodeOff', data.lang, {
                    CHANNEL: targetChannel.toString(),
                })
            );
            return;
        }

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

        const seconds = Math.ceil(parsed.ms / 1000);
        if (seconds > MAX_SLOWMODE_SECONDS) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.slowmodeTooHigh', data.lang, {
                    MAX: (MAX_SLOWMODE_SECONDS / 60).toLocaleString(data.lang),
                })
            );
            return;
        }

        try {
            await targetChannel.setRateLimitPerUser(
                seconds,
                `SufBot | ${moderator.user.tag}: ${reason}`
            );
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to set slowmode on ${targetChannel.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.slowmodeFailed', data.lang, {
                    CHANNEL: targetChannel.toString(),
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetChannel.id,
            moderatorId: moderator.id,
            action: 'SLOWMODE',
            reason,
            durationMs: parsed.ms,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Set slowmode on ${targetChannel.id} to ${seconds}s. Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: `#${targetChannel.name}`,
            moderatorTag: moderator.user.tag,
            color: 'warning',
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.slowmodeSuccess', data.lang, {
                CHANNEL: targetChannel.toString(),
                DURATION: DurationUtils.humanize(parsed.ms),
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
