import { APIApplicationCommandBasicOption, ApplicationCommandOptionType } from 'discord.js';

import { DevCommandName, HelpOption, InfoOption, LockAction, RoleAction } from '../enums/index.js';
import { Language } from '../models/enum-helpers/index.js';
import { Lang } from '../services/index.js';

export class Args {
    public static readonly DEV_COMMAND: APIApplicationCommandBasicOption = {
        name: Lang.getRef('arguments.command', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('arguments.command'),
        description: Lang.getRef('argDescs.devCommand', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('argDescs.devCommand'),
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: Lang.getRef('devCommandNames.info', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('devCommandNames.info'),
                value: DevCommandName.INFO,
            },
        ],
    };
    public static readonly HELP_OPTION: APIApplicationCommandBasicOption = {
        name: Lang.getRef('arguments.option', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('arguments.option'),
        description: Lang.getRef('argDescs.helpOption', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('argDescs.helpOption'),
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: Lang.getRef('helpOptionDescs.contactSupport', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('helpOptionDescs.contactSupport'),
                value: HelpOption.CONTACT_SUPPORT,
            },
            {
                name: Lang.getRef('helpOptionDescs.commands', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('helpOptionDescs.commands'),
                value: HelpOption.COMMANDS,
            },
        ],
    };
    public static readonly INFO_OPTION: APIApplicationCommandBasicOption = {
        name: Lang.getRef('arguments.option', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('arguments.option'),
        description: Lang.getRef('argDescs.infoOption', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('argDescs.infoOption'),
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: Lang.getRef('infoOptions.about', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('infoOptions.about'),
                value: InfoOption.ABOUT,
            },
            {
                name: Lang.getRef('infoOptions.translate', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('infoOptions.translate'),
                value: InfoOption.TRANSLATE,
            },
        ],
    };

    public static readonly LOCK_ACTION: APIApplicationCommandBasicOption = {
        name: Lang.getRef('arguments.action', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('arguments.action'),
        description: Lang.getRef('argDescs.lockAction', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('argDescs.lockAction'),
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: Lang.getRef('lockActions.lock', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('lockActions.lock'),
                value: LockAction.LOCK,
            },
            {
                name: Lang.getRef('lockActions.unlock', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('lockActions.unlock'),
                value: LockAction.UNLOCK,
            },
        ],
    };

    public static readonly ROLE_ACTION: APIApplicationCommandBasicOption = {
        name: Lang.getRef('arguments.action', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('arguments.action'),
        description: Lang.getRef('argDescs.roleAction', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('argDescs.roleAction'),
        type: ApplicationCommandOptionType.String,
        choices: [
            {
                name: Lang.getRef('roleActions.add', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('roleActions.add'),
                value: RoleAction.ADD,
            },
            {
                name: Lang.getRef('roleActions.remove', Language.Default),
                name_localizations: Lang.getRefLocalizationMap('roleActions.remove'),
                value: RoleAction.REMOVE,
            },
        ],
    };
}
