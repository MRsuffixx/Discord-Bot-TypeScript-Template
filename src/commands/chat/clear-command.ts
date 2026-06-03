import {
    ChatInputCommandInteraction,
    GuildMember,
    NewsChannel,
    PermissionsString,
    TextChannel,
    User,
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { buildModLogEmbed, caseService, Lang, Logger, sendModLog } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const MAX_BULK_DELETE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const LOG_PREFIX = '[Command:Clear]';

export class ClearCommand implements Command {
    public names = [Lang.getRef('chatCommands.clear', Language.Default)];
    public cooldown = new RateLimiter(1, 10_000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['ManageMessages', 'ReadMessageHistory'];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        if (!intr.guild || !(intr.channel instanceof TextChannel || intr.channel instanceof NewsChannel)) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        const amount = intr.options.getInteger(
            Lang.getRef('arguments.amount', Language.Default),
            true
        );
        const targetUser = intr.options.getUser(Lang.getRef('arguments.user', Language.Default));

        const moderator = intr.member as GuildMember | null;
        if (!moderator) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        const me = intr.guild.members.me;
        if (
            me &&
            !intr.channel.permissionsFor(me).has(['ManageMessages', 'ReadMessageHistory'] as never)
        ) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.missingClientPerms', data.lang, {
                    PERMISSIONS: 'Manage Messages, Read Message History',
                })
            );
            return;
        }

        const channel = intr.channel;
        const collection = await channel.messages.fetch({ limit: 100 });
        let candidates = [...collection.values()];

        if (targetUser) {
            candidates = candidates.filter(m => m.author.id === targetUser.id);
        }

        const twoWeeksAgo = Date.now() - MAX_BULK_DELETE_AGE_MS;
        const bulkCandidates = candidates
            .filter(m => m.createdTimestamp >= twoWeeksAgo)
            .slice(0, amount);
        const oldCandidates = candidates
            .filter(m => m.createdTimestamp < twoWeeksAgo)
            .slice(0, Math.max(0, amount - bulkCandidates.length));

        let deleted = 0;
        if (bulkCandidates.length > 0) {
            try {
                const deletedMessages = await channel.bulkDelete(bulkCandidates, true);
                deleted += deletedMessages.size;
            } catch (error) {
                Logger.error(
                    `${LOG_PREFIX} bulkDelete failed in channel ${channel.id} of guild ${intr.guild.id}.`,
                    error
                );
            }
        }

        for (const message of oldCandidates) {
            try {
                await message.delete();
                deleted += 1;
            } catch (error) {
                Logger.error(
                    `${LOG_PREFIX} single delete failed for message ${message.id} in channel ${channel.id}.`,
                    error
                );
            }
        }

        const targetDescription: User | null = targetUser;
        const targetText = targetDescription ? targetDescription.toString() : '*any user*';
        const reason = `Clear ${deleted} message(s) in #${channel.name}${
            targetDescription ? ` from ${targetDescription.tag}` : ''
        }`;

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetDescription?.id ?? '0',
            moderatorId: moderator.id,
            action: 'PURGE',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Cleared ${deleted} message(s) in channel ${channel.id} of guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: targetDescription?.tag ?? 'Bulk clear',
            moderatorTag: moderator.user.tag,
            color: 'default',
            extraFields: [
                { name: 'Channel', value: `${channel.toString()}`, inline: true },
                { name: 'Requested', value: amount.toLocaleString(data.lang), inline: true },
                { name: 'Deleted', value: deleted.toLocaleString(data.lang), inline: true },
            ],
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.clearSuccess', data.lang, {
                COUNT: deleted.toLocaleString(data.lang),
                TARGET: targetText,
            })
        );
    }
}
