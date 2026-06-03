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
import { InteractionUtils, ModHierarchyUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const LOG_PREFIX = '[Command:Nick]';

export class NickCommand implements Command {
    public names = [Lang.getRef('chatCommands.nick', Language.Default)];
    public cooldown = new RateLimiter(2, 5000);
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = ['ManageNicknames'];

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
        const newNick = intr.options.getString(
            Lang.getRef('arguments.nickname', Language.Default),
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

        if (newNick.length > 32) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.nickTooLong', data.lang, {
                    MAX: '32',
                })
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
            // Self-nick is fine but we still log it; no hierarchy check needed.
        } else if (targetUser.id === intr.guild.ownerId) {
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('validationEmbeds.modOwner', data.lang)
            );
            return;
        } else {
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

        const previousNick = target.nickname ?? target.user.username;
        const trimmed = newNick.trim();
        const finalNick = trimmed.length === 0 ? null : trimmed;

        try {
            await target.setNickname(finalNick, `SufBot | ${moderator.user.tag}: ${reason}`);
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to set nickname for ${targetUser.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.nickFailed', data.lang, {
                    TARGET: targetUser.tag,
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: 'NICK',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Changed nickname for ${targetUser.id} from "${previousNick}" to "${
                finalNick ?? '(cleared)'
            }" in guild ${intr.guild.id}. Case #${caseRecord.caseId}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: describeMember(target),
            moderatorTag: moderator.user.tag,
            color: 'default',
            extraFields: [
                { name: 'Previous', value: previousNick, inline: true },
                { name: 'New', value: finalNick ?? '*(cleared)*', inline: true },
            ],
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.nickSuccess', data.lang, {
                TARGET: targetUser.toString(),
                PREVIOUS: previousNick,
                NEW: finalNick ?? '*(cleared)*',
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
