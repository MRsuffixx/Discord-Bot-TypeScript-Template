import {
    ChatInputCommandInteraction,
    GuildMember,
    PermissionsString,
} from 'discord.js';
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

const LOG_PREFIX = '[Command:Ban]';

export class BanCommand implements Command {
    public names = [Lang.getRef('chatCommands.ban', Language.Default)];
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

        const targetUser = intr.options.getUser(
            Lang.getRef('arguments.user', Language.Default),
            true
        );
        const reason =
            intr.options.getString(Lang.getRef('arguments.reason', Language.Default)) ??
            'No reason provided.';
        const deleteDays = intr.options.getInteger(
            Lang.getRef('arguments.deleteDays', Language.Default)
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

        let target: GuildMember;
        try {
            target = await intr.guild.members.fetch(targetUser.id);
        } catch {
            target = undefined as unknown as GuildMember;
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

        try {
            await intr.guild.members.ban(targetUser.id, {
                reason: `SufBot | ${moderator.user.tag}: ${reason}`,
                deleteMessageSeconds: deleteDays ? deleteDays * 24 * 60 * 60 : undefined,
            });
        } catch (error) {
            Logger.error(
                `${LOG_PREFIX} Failed to ban user ${targetUser.id} in guild ${intr.guild.id}.`,
                error
            );
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.banFailed', data.lang, {
                    TARGET: targetUser.tag,
                })
            );
            return;
        }

        const caseRecord = caseService.createCase({
            guildId: intr.guild.id,
            targetId: targetUser.id,
            moderatorId: moderator.id,
            action: 'BAN',
            reason,
            durationMs: null,
            active: true,
        });

        Logger.info(
            `${LOG_PREFIX} Banned user ${targetUser.id} (${targetUser.tag}) in guild ${intr.guild.id}. ` +
                `Case #${caseRecord.caseId}. Reason: ${reason}.`
        );

        const embed = buildModLogEmbed({
            caseRecord,
            targetTag: describeMember(target ?? ({ user: targetUser, guild: intr.guild } as GuildMember)),
            moderatorTag: moderator.user.tag,
            color: 'error',
            extraFields: deleteDays
                ? [
                      {
                          name: 'Message Purge',
                          value: `${deleteDays} day(s) of history deleted.`,
                          inline: true,
                      },
                  ]
                : [],
        });
        await sendModLog(intr.guild, embed);

        await InteractionUtils.send(
            intr,
            Lang.getEmbed('displayEmbeds.banSuccess', data.lang, {
                TARGET: targetUser.toString(),
                REASON: reason,
                CASE_ID: caseRecord.caseId.toLocaleString(data.lang),
            })
        );
    }
}
