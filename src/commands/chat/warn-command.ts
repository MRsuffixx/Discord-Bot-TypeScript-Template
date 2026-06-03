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
    warningService,
} from '../../services/index.js';
import { InteractionUtils, ModHierarchyUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const LOG_PREFIX = '[Command:Warn]';

export class WarnCommand implements Command {
    public names = [Lang.getRef('chatCommands.warn', Language.Default)];
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
        const reason = intr.options.getString(
            Lang.getRef('arguments.reason', Language.Default),
            true
        );

        const moderator = intr.member as GuildMember | null;
        if (!moderator) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.guildOnly', data.lang)
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
        if (targetUser.id === intr.client.user?.id) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.modBot', data.lang)
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

        let target: GuildMember | undefined;
        try {
            target = await intr.guild.members.fetch(targetUser.id);
        } catch {
            target = undefined;
        }

        if (target) {
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
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: 'WARN',
            reason,
            durationMs: null,
            active: true,
        });

        warningService.addWarning(
            intr.guild.id,
            targetUser.id,
            moderator.id,
            reason,
            caseRecord.caseId
        );

        const total = warningService.countWarningsForUser(
            intr.guild.id,
            targetUser.id
        );

        Logger.warn(
            `${LOG_PREFIX} Warned user ${targetUser.id} (${targetUser.tag}) in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}. Total warnings: ${total}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: target ? describeMember(target) : `${targetUser.tag} (not in server)`,
            moderatorTag: moderator.user.tag,
            color: 'warning',
            extraFields: [
                {
                    name: 'Total Warnings',
                    value: total.toLocaleString(data.lang),
                    inline: true,
                },
            ],
        });
        await sendModLog(intr.guild, embed);

        try {
            await targetUser.send({
                embeds: [
                    Lang.getEmbed('displayEmbeds.warnDm', data.lang, {
                        GUILD: intr.guild.name,
                        REASON: reason,
                        CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
                    }),
                ],
            });
        } catch {
            // DMs are best-effort
        }

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.warnSuccess', data.lang, {
                TARGET: targetUser.toString(),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
                TOTAL: total.toLocaleString(data.lang),
            })
        );
    }
}
