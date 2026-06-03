import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    ComponentType,
    EmbedBuilder,
    PermissionsString,
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import { DateTime } from 'luxon';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { caseService, humanizeMs, Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const PAGE_SIZE = 5;

export class ModlogCommand implements Command {
    public names = [Lang.getRef('chatCommands.modlog', Language.Default)];
    public cooldown = new RateLimiter(1, 5000);
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

        const targetUser = intr.options.getUser(
            Lang.getRef('arguments.user', Language.Default),
            true
        );
        const requestedPage = intr.options.getInteger(
            Lang.getRef('arguments.page', Language.Default)
        );

        const total = caseService.countCasesForUser(intr.guild.id, targetUser.id);
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        let page = Math.min(Math.max(requestedPage ?? 1, 1), totalPages);

        const buildEmbed = (currentPage: number): EmbedBuilder => {
            const offset = (currentPage - 1) * PAGE_SIZE;
            const cases = caseService.getCasesForUser(
                intr.guild.id,
                targetUser.id,
                PAGE_SIZE,
                offset
            );

            return new EmbedBuilder()
                .setColor(0x0099ff)
                .setAuthor({ name: `Moderation history · ${targetUser.tag}` })
                .setDescription(
                    total === 0
                        ? 'No moderation actions on record for this user.'
                        : cases
                              .map(
                                  (c, i) =>
                                      `**${offset + i + 1}.** case #${c.caseId} · \`${c.action}\` ` +
                                      `— <t:${Math.floor(c.createdAt / 1000)}:R>` +
                                      (c.active ? ' 🟢' : ' ⚪') +
                                      `\n   by <@${c.moderatorId}> · ${c.reason}` +
                                      (c.durationMs
                                            ? ` · duration: ${humanizeMs(c.durationMs)}`
                                            : '')
                              )
                              .join('\n\n')
                )
                .addFields(
                    {
                        name: 'Total Cases',
                        value: total.toLocaleString(data.lang),
                        inline: true,
                    },
                    {
                        name: 'Page',
                        value: `${currentPage.toLocaleString(data.lang)} / ${totalPages.toLocaleString(
                            data.lang
                        )}`,
                        inline: true,
                    }
                )
                .setFooter({ text: `SufBot moderation · user ${targetUser.id}` })
                .setTimestamp(DateTime.now().toJSDate());
        };

        const buildRow = (currentPage: number) =>
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`modlog:first:${targetUser.id}`)
                    .setEmoji('⏪')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId(`modlog:prev:${targetUser.id}`)
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId(`modlog:next:${targetUser.id}`)
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages),
                new ButtonBuilder()
                    .setCustomId(`modlog:last:${targetUser.id}`)
                    .setEmoji('⏩')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages)
            );

        const message = await InteractionUtils.send(intr, {
            embeds: [buildEmbed(page)],
            components: total > PAGE_SIZE ? [buildRow(page)] : [],
        });

        if (!message || total <= PAGE_SIZE) {
            return;
        }

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 5 * 60 * 1000,
            filter: i => i.user.id === intr.user.id,
        });

        collector.on('collect', async i => {
            if (!i.customId.startsWith('modlog:')) return;
            const [, action] = i.customId.split(':');
            switch (action) {
                case 'first':
                    page = 1;
                    break;
                case 'prev':
                    page = Math.max(1, page - 1);
                    break;
                case 'next':
                    page = Math.min(totalPages, page + 1);
                    break;
                case 'last':
                    page = totalPages;
                    break;
            }
            await i.update({
                embeds: [buildEmbed(page)],
                components: [buildRow(page)],
            });
        });

        collector.on('end', async () => {
            try {
                await message.edit({ components: [] });
            } catch {
                // ignore
            }
        });
    }
}
