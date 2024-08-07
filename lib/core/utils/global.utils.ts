import { format } from 'bytes';
import { ITrackingEventData, getTrackingService } from '@kontent-ai-consulting/tools-analytics';
import { isBrowser, isNode, isWebWorker } from 'browser-or-node';
import { EnvContext } from '../models/core.models.js';

export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const isNotUndefined = <T>(item: T | undefined): item is T => item !== undefined;

export function formatBytes(bytes: number): string {
    return format(bytes);
}

export function sleepAsync(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function exitProgram(data: { readonly message: string }): never {
    throw Error(data.message);
}

export function getCurrentEnvironment(): EnvContext {
    if (isNode) {
        return 'node';
    }
    if (isBrowser || isWebWorker) {
        return 'browser';
    }

    throw Error(`Invalid current environment. This library can be used in node.js or in browsers.`);
}

export const defaultZipFilename: string = 'data.zip';

export async function executeWithTrackingAsync<TResult>(data: {
    func: () => Promise<TResult extends void ? void : Readonly<TResult>>;
    event: Readonly<ITrackingEventData>;
}): Promise<TResult extends void ? void : Readonly<TResult>> {
    const trackingService = getTrackingService();
    const event = await trackingService.trackEventAsync(data.event);

    try {
        const result = await data.func();

        await trackingService.setEventResultAsync({
            eventId: event.eventId,
            result: 'success'
        });

        return result;
    } catch (error) {
        await trackingService.setEventResultAsync({
            eventId: event.eventId,
            result: 'fail'
        });

        throw error;
    }
}
