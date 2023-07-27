import { green, yellow, cyan, Color, red, magenta } from 'colors';
import { ActionType } from './core.models';

export type DebugType = 'error' | 'warning' | 'info' | ActionType;

export function logDebug(action: DebugType, message: string, info1?: string, info2?: string, info3?: string): void {
    let typeColor: Color = green;

    if (action === 'error') {
        typeColor = red;
    } else if (action === 'warning') {
        typeColor = red;
    }
    console.log(
        `[${typeColor(action)}]${info1 ? `[${yellow(info1)}]` : ''}${info2 ? `[${cyan(info2)}]` : ''}${
            info3 ? `[${magenta(info3)}]` : ''
        }: ${message}`
    );
}