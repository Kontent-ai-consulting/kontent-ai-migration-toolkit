import colors from 'colors';
import prompts from 'prompts';
import ora from 'ora';
import { createManagementClient } from '@kontent-ai/management-sdk';
import { ActionType, FetchItemType, ItemType } from '../models/core.models.js';
import { exitProcess } from './global.utils.js';

interface ILogCount {
    index: number;
    total: number;
}

interface ILogData {
    type: DebugType;
    message: string;
    count?: ILogCount;
}

export type Log = {
    spinner?: Spinner;
    console: Console;
};
export type Spinner = {
    start: () => void;
    stop: () => void;
    text: (data: ILogData) => void;
};
export type Console = (data: ILogData) => void;

export type DebugType =
    | 'error'
    | 'completed'
    | 'warning'
    | 'info'
    | 'errorData'
    | 'cancel'
    | 'process'
    | ActionType
    | ItemType;

export function logErrorAndExit(data: { message: string }): never {
    throw Error(data.message);
}

export function logFetchedItems(data: { count: number; itemType: FetchItemType; log: Log }): void {
    data.log.console({
        type: 'info',
        message: `Fetched '${colors.yellow(data.count.toString())}' ${data.itemType}`
    });
}

export function getDefaultLog(): Log {
    const spinner = ora();
    let previousCount: ILogCount | undefined = undefined;

    return {
        console: (data) => console.log(getLogDataMessage(data)),
        spinner: {
            start: () => spinner.start(),
            stop: () => spinner.stop(),
            text: (data) => {
                if (data.count) {
                    previousCount = data.count;
                }

                const message = getLogDataMessage({
                    message: data.message,
                    type: data.type,
                    count: data.count ?? previousCount
                });

                spinner.text = message;
            }
        }
    };
}

export function getLogDataMessage(data: ILogData): string {
    let typeColor = colors.yellow;

    if (data.type === 'info') {
        typeColor = colors.cyan;
    } else if (
        data.type === 'error' ||
        data.type === 'errorData' ||
        data.type === 'warning' ||
        data.type === 'cancel'
    ) {
        typeColor = colors.red;
    } else if (data.type === 'completed') {
        typeColor = colors.green;
    } else if (data.type === 'skip') {
        typeColor = colors.gray;
    }

    if (data.count) {
        return `${typeColor(`${data.count.index}/${data.count.total}`)}: ${data.message} ${colors.cyan(data.type)} `;
    }
    return `${typeColor(data.type)}: ${data.message}`;
}

export async function confirmAsync(data: { action: string; message: string; force: boolean; log: Log }): Promise<void> {
    if (data.force) {
        data.log.console({
            type: 'info',
            message: `Skipping confirmation prompt due to the use of 'force' param`
        });
    } else {
        const confirmed = await prompts({
            type: 'confirm',
            name: 'confirm',
            message: `${colors.cyan(data.action)}: ${data.message}`
        });

        if (!confirmed.confirm) {
            data.log.console({
                type: 'cancel',
                message: `Confirmation refused. Exiting process.`
            });
            exitProcess();
        }
    }
}

export async function confirmExportAsync(data: {
    force: boolean;
    environmentId: string;
    apiKey: string;
    log: Log;
}): Promise<void> {
    const environment = (
        await createManagementClient({
            apiKey: data.apiKey,
            environmentId: data.environmentId
        })
            .environmentInformation()
            .toPromise()
    ).data.project;

    const text: string = `Are you sure to export data from ${colors.yellow(environment.name)} -> ${colors.yellow(
        environment.environment
    )}?`;

    await confirmAsync({
        force: data.force,
        log: data.log,
        action: 'Export',
        message: text
    });
}

export async function confirmMigrateAsync(data: {
    force: boolean;
    sourceEnvironment: {
        environmentId: string;
        apiKey: string;
    };
    targetEnvironment: {
        environmentId: string;
        apiKey: string;
    };
    log: Log;
}): Promise<void> {
    const sourceEnvironment = (
        await createManagementClient({
            apiKey: data.sourceEnvironment.apiKey,
            environmentId: data.sourceEnvironment.environmentId
        })
            .environmentInformation()
            .toPromise()
    ).data.project;
    const targetEnvironment = (
        await createManagementClient({
            apiKey: data.targetEnvironment.apiKey,
            environmentId: data.targetEnvironment.environmentId
        })
            .environmentInformation()
            .toPromise()
    ).data.project;

    const text: string = `Are you sure to migrate data from ${colors.yellow(sourceEnvironment.name)} -> ${colors.yellow(
        sourceEnvironment.environment
    )} to environment ${colors.yellow(targetEnvironment.name)} -> ${colors.yellow(targetEnvironment.environment)}?`;

    await confirmAsync({
        force: data.force,
        log: data.log,
        action: 'Migrate',
        message: text
    });
}

export async function confirmImportAsync(data: {
    force: boolean;
    environmentId: string;
    apiKey: string;
    log: Log;
}): Promise<void> {
    const environment = (
        await createManagementClient({
            apiKey: data.apiKey,
            environmentId: data.environmentId
        })
            .environmentInformation()
            .toPromise()
    ).data.project;

    const text: string = `Are you sure to import data into ${colors.yellow(environment.name)} -> ${colors.yellow(
        environment.environment
    )}?`;

    await confirmAsync({
        force: data.force,
        log: data.log,
        action: 'Import',
        message: text
    });
}
