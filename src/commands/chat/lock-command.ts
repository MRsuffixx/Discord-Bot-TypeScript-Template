import {
    ChatInputCommandInteraction,
    GuildMember,
    NewsChannel,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsString,
    TextChannel,
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { LockAction } from '../../enums/index.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import {
    buildModLogEmbed,
    caseService,
    channelLockService,
    describeMember,
    Lang,
    Logger,
    sendModLog,
} from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const LOG_PREFIX = '[Command:Lock]';

const LOCKABLE_PERMS: (keyof typeof PermissionFlagsBits)[] = [
    'SendMessages',
    'SendMessagesInThreads',
    'CreatePublicThreads',
    'CreatePrivateThreads',
    'AddReactions',
];

export class LockCommand implements Command {
    public names = [Lang.getRef('chatCommands.lock', Language.Default)];
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

        const action = intr.options.getString(
            Lang.getRef('arguments.action', Language.Default),
            true
        ) as LockAction;
        const channelOption = intr.options.getChannel(Lang.getRef('arguments.channel', Language.Default));
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

        if (action === LockAction.LOCK) {
            await this.handleLock(intr, moderator, targetChannel, reason, data);
        } else {
            await this.handleUnlock(intr, moderator, targetChannel, reason, data);
        }
    }

    private async handleLock(
        intr: ChatInputCommandInteraction,
        moderator: GuildMember,
        channel: TextChannel | NewsChannel,
        reason: string,
        data: EventData
    ): Promise<void> {
        const existing = channelLockService.peekLock(channel.id);
        if (existing) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.alreadyLocked', data.lang, {
                    CHANNEL: channel.toString(),
                })
            );
            return;
        }

        const everyoneOverwrite = channel.permissionOverwrites.resolve(
            channel.guild.roles.everyone.id
        );
        const snapshot = JSON.stringify({
            allow: everyoneOverwrite ? [...everyoneOverwrite.allow.keys()] : [],
            deny: everyoneOverwrite ? [...everyoneOverwrite.deny.keys()] : [],
            type: OverwriteType.Role,
        });

        try {
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
                SendMessages: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                AddReactions: false,
            });
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to lock channel ${channel.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.lockFailed', data.lang, {
                    CHANNEL: channel.toString(),
                })
            );
            return;
        }

        channelLockService.recordLock(channel.id, intr.guild.id, snapshot);

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: channel.id,
            moderatorId: moderator.id,
            action: 'LOCK',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.warn(
            `${LOG_PREFIX} Locked channel ${channel.id} (#${channel.name}) in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: `#${channel.name}`,
            moderatorTag: moderator.user.tag,
            color: 'warning',
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.lockSuccess', data.lang, {
                CHANNEL: channel.toString(),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
        void LOCKABLE_PERMS; // reserved for future use
    }

    private async handleUnlock(
        intr: ChatInputCommandInteraction,
        moderator: GuildMember,
        channel: TextChannel | NewsChannel,
        reason: string,
        data: EventData
    ): Promise<void> {
        const lock = channelLockService.consumeLock(channel.id);
        if (!lock) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.notLocked', data.lang, {
                    CHANNEL: channel.toString(),
                })
            );
            return;
        }

        try {
            const parsed = JSON.parse(lock.payload) as {
                allow: string[];
                deny: string[];
            };
            const allowPerms = parsed.allow
                .filter(p => p in PermissionFlagsBits)
                .reduce(
                    (acc, p) => ({ ...acc, [p]: true }),
                    {} as Record<string, true>
                );
            const denyPerms = parsed.deny
                .filter(p => p in PermissionFlagsBits)
                .reduce(
                    (acc, p) => ({ ...acc, [p]: true }),
                    {} as Record<string, true>
                );

            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
                ...allowPerms,
                ...denyPerms,
            });
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to restore overrides on channel ${channel.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.unlockFailed', data.lang, {
                    CHANNEL: channel.toString(),
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: channel.id,
            moderatorId: moderator.id,
            action: 'UNLOCK',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Unlocked channel ${channel.id} (#${channel.name}) in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: `#${channel.name}`,
            moderatorTag: describeMember(moderator),
            color: 'success',
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.unlockSuccess', data.lang, {
                CHANNEL: channel.toString(),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
