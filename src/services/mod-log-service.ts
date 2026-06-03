import { EmbedBuilder, Guild, TextBasedChannel } from 'discord.js';
import { DateTime } from 'luxon';
import { createRequire } from 'node:module';

import { Logger } from './logger.js';
import { ModCase } from './case-service.js';

const require = createRequire(import.meta.url);
let Config = require('../../config/config.json');

export interface ModLogEmbedOptions {
    caseRecord: ModCase;
    targetTag: string;
    moderatorTag: string;
    color?: 'success' | 'warning' | 'error' | 'default';
    extraFields?: Array<{ name: string; value: string; inline?: boolean }>;
    note?: string;
}

const COLORS: Record<NonNullable<ModLogEmbedOptions['color']>, number> = {
    success: 0x00ff83,
    warning: 0xffcc66,
    error: 0xff4a4a,
    default: 0x0099ff,
};

export function buildModLogEmbed(options: ModLogEmbedOptions): EmbedBuilder {
    const {
        caseRecord,
        targetTag,
        moderatorTag,
        color = 'default',
        extraFields = [],
        note,
    } = options;

    const embed = new EmbedBuilder()
        .setColor(COLORS[color])
        .setAuthor({ name: `Case #${caseRecord.caseId} · ${caseRecord.action}` })
        .setDescription(
            [
                `**Target:** ${targetTag} (<@${caseRecord.targetId}>)`,
                `**Moderator:** ${moderatorTag} (<@${caseRecord.moderatorId}>)`,
                `**Reason:** ${caseRecord.reason}`,
            ].join('\n')
        )
        .addFields(
            {
                name: 'Guild',
                value: caseRecord.guildId,
                inline: true,
            },
            {
                name: 'Active',
                value: caseRecord.active ? '✅ Yes' : '❌ No',
                inline: true,
            },
            {
                name: 'When',
                value: `<t:${Math.floor(caseRecord.createdAt / 1000)}:F>`,
                inline: false,
            },
            ...extraFields
        )
        .setTimestamp(DateTime.fromMillis(caseRecord.createdAt).toJSDate())
        .setFooter({ text: `SufBot moderation · case ${caseRecord.caseId}` });

    if (caseRecord.durationMs) {
        embed.addFields({
            name: 'Duration',
            value: humanizeMs(caseRecord.durationMs),
            inline: true,
        });
    }

    if (note) {
        embed.addFields({ name: 'Note', value: note });
    }

    return embed;
}

export function humanizeMs(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`.trim();
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`.trim();
}

export function getModLogChannelId(): string | undefined {
    const mod = (Config as { moderation?: { logChannelId?: string } }).moderation;
    return mod?.logChannelId;
}

export async function sendModLog(
    guild: Guild,
    embed: EmbedBuilder
): Promise<TextBasedChannel | null> {
    const channelId = getModLogChannelId();
    if (!channelId) {
        Logger.warn(
            `No mod log channel configured for guild '${guild.name}' (${guild.id}); skipping mod log.`
        );
        return null;
    }
    try {
        const channel = await guild.channels.fetch(channelId);
        if (!channel || !('send' in channel)) {
            Logger.warn(
                `Configured mod log channel ${channelId} is missing or not text-based in guild ${guild.id}.`
            );
            return null;
        }
        const textChannel = channel as TextBasedChannel;
        await textChannel.send({ embeds: [embed] });
        return textChannel;
    } catch (error) {
        Logger.error(
            `Failed to send mod log to channel ${channelId} in guild ${guild.id}.`,
            error
        );
        return null;
    }
}
