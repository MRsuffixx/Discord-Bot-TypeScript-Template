import {
    ChatInputCommandInteraction,
    GuildMember,
    PermissionsString,
    User,
} from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import {
    buildModLogEmbed,
    caseService,
    caseService as _cs,
    Lang,
    Logger,
    sendModLog,
} from '../../services/index.js';
import { InteractionUtils, RegexUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const LOG_PREFIX = '[Command:Unban]';

export class UnbanCommand implements Command {
    public names = [Lang.getRef('chatCommands.unban', Language.Default)];
    public cooldown = new RateLimiter(2, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['BanMembers'];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        if (!intr.guild) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
            );
            return;
        }

        const rawId = intr.options.getString(
            Lang.getRef('arguments.userId', Language.Default),
            true
        );
        const reason =
            intr.options.getString(Lang.getRef('arguments.reason', Language.Default)) ??
            'No reason provided.';

        const cleanId = RegexUtils.discordId(rawId.trim());
        if (!cleanId) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.invalidUserId', data.lang, {
                    INPUT: rawId,
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

        let alreadyUnbanned = false;
        try {
            const ban = await intr.guild.bans.fetch(cleanId).catch(() => null);
            if (!ban) {
                alreadyUnbanned = true;
            }
        } catch {
            alreadyUnbanned = true;
        }

        if (alreadyUnbanned) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.userNotBanned', data.lang, {
                    USER_ID: cleanId,
                })
            );
            return;
        }

        let user: User | null = null;
        try {
            user = await intr.client.users.fetch(cleanId);
        } catch {
            user = null;
        }

        try {
            await intr.guild.members.unban(cleanId, `SufBot | ${moderator.user.tag}: ${reason}`);
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to unban user ${cleanId} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.unbanFailed', data.lang, {
                    USER_ID: cleanId,
                })
            );
            return;
        }

        const latestBan = caseService.getLatestActiveCaseForUser(intr.guild.id, cleanId, 'BAN');
        if (latestBan) {
            caseService.setCaseActive(intr.guild.id, latestBan.caseId, false);
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: cleanId,
            moderatorId: moderator.id,
            action: 'UNBAN',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Unbanned user ${cleanId} in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}. Reason: ${reason}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: user?.tag ?? `Unknown (${cleanId})`,
            moderatorTag: moderator.user.tag,
            color: 'success',
            extraFields: latestBan
                ? [
                      {
                          name: 'Reversed Case',
                          value: `#${latestBan.caseId} (BAN) marked inactive.`,
                          inline: true,
                      },
                  ]
                : [],
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.unbanSuccess', data.lang, {
                TARGET: user ? user.toString() : `<@${cleanId}>`,
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
