import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { DateTime } from 'luxon';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { caseService, humanizeMs, Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class CaseCommand implements Command {
    public names = [Lang.getRef('chatCommands.case', Language.Default)];
    public cooldown = new RateLimiter(2, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        if (!intr.guild) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        const caseId = intr.options.getInteger(
            Lang.getRef('arguments.caseId', Language.Default),
            true
        );

        const caseRecord = caseService.getCase(intr.guild.id, caseId);
        if (!caseRecord) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.caseNotFound', data.lang, {
                    CASE_ID: caseId.toLocaleString(data.lang),
                })
            );
            return;
        }

        const lines = [
            `**Case ID:** #${caseRecord.caseId.toLocaleString(data.lang)}`,
            `**Action:** \`${caseRecord.action}\``,
            `**Target:** <@${caseRecord.targetId}>`,
            `**Moderator:** <@${caseRecord.moderatorId}>`,
            `**Reason:** ${caseRecord.reason}`,
            `**Active:** ${caseRecord.active ? '✅ Yes' : '❌ No'}`,
            `**When:** <t:${Math.floor(caseRecord.createdAt / 1000)}:F> (<t:${Math.floor(
                caseRecord.createdAt / 1000
            )}:R>)`,
        ];
        if (caseRecord.durationMs) {
            lines.push(`**Duration:** ${humanizeMs(caseRecord.durationMs)}`);
        }

        await InteractionUtils.send(
            intr,
            new (await import('discord.js')).EmbedBuilder()
                .setColor(caseRecord.active ? 0xffcc66 : 0x808080)
                .setAuthor({ name: `Case #${caseRecord.caseId} · ${caseRecord.action}` })
                .setDescription(lines.join('\n'))
                .setFooter({ text: `SufBot moderation · guild ${intr.guild.id}` })
                .setTimestamp(DateTime.now().toJSDate())
        );
    }
}
