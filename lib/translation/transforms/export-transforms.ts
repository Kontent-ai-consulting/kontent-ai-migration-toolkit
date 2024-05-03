import {
    ExportTransformFunc,
    MigrationElementType
} from '../../core/index.js';
import { ContentTypeElements } from '@kontent-ai/management-sdk';

/**
 * Elements transform used by Kontent.ai export adapter
 */
export const exportTransforms: Readonly<Record<MigrationElementType, ExportTransformFunc>> = {
    text: (data) => data.value?.toString(),
    number: (data) => data.value?.toString(),
    date_time: (data) => data.value?.toString(),
    rich_text: (data) => data.value?.toString(),
    asset: (data) => {
        if (!data.value) {
            return [];
        }

        if (!Array.isArray(data.value)) {
            throw Error(`Expected value to be an array`);
        }

        // translate asset id to codename
        const assetCodenames: string[] = [];
        for (const arrayVal of data.value) {
            if (!arrayVal.id) {
                continue;
            }

            const assetState = data.context.getAssetStateInSourceEnvironment(arrayVal.id);

            if (assetState.asset) {
                // reference asset by codename
                assetCodenames.push(assetState.asset.codename);
            } else {
                throw Error(`Missing asset with id '${arrayVal.id}'`);
            }
        }

        return assetCodenames;
    },
    taxonomy: (data) => {
        console.log('TODO TAXONOMY');
        return [];
    },
    modular_content: (data) => {
        if (!data.value) {
            return [];
        }

        if (!Array.isArray(data.value)) {
            throw Error(`Expected value to be an array`);
        }

        // translate item id to codename
        const codenames: string[] = [];
        for (const arrayVal of data.value) {
            if (!arrayVal.id) {
                continue;
            }

            const itemState = data.context.getItemStateInSourceEnvironment(arrayVal.id);

            if (itemState.item) {
                // reference item by codename
                codenames.push(itemState.item.codename);
            } else {
                throw Error(`Missing item with id '${arrayVal.id}'`);
            }
        }

        return codenames;
    },
    custom: (data) => data.value?.toString(),
    url_slug: (data) => data.value?.toString(),
    multiple_choice: (data) => {
        if (!data.value) {
            return [];
        }

        if (!Array.isArray(data.value)) {
            throw Error(`Expected value to be an array`);
        }

        // translate multiple choice option id to codename
        const multipleChoiceElement = data.typeElement.element as ContentTypeElements.IMultipleChoiceElement;
        const selectedOptionCodenames: string[] = [];

        for (const arrayVal of data.value) {
            if (!arrayVal.id) {
                continue;
            }

            const option = multipleChoiceElement.options.find((m) => m.id === arrayVal.id);

            if (!option) {
                throw Error(`Could not find multiple choice element with option id '${arrayVal.id}'`);
            }

            selectedOptionCodenames.push(option.codename as string);
        }

        return selectedOptionCodenames;
    },
    guidelines: (data) => {
        throw Error('Not supported');
    },
    snippet: (data) => {
        throw Error('Not supported');
    },
    subpages: (data) => {
        if (!data.value) {
            return [];
        }
        if (!Array.isArray(data.value)) {
            throw Error(`Expected value to be an array`);
        }

        // translate item id to codename
        const codenames: string[] = [];
        for (const arrayVal of data.value) {
            if (!arrayVal.id) {
                continue;
            }

            const itemState = data.context.getItemStateInSourceEnvironment(arrayVal.id);

            if (itemState.item) {
                // reference item by codename
                codenames.push(itemState.item.codename);
            } else {
                throw Error(`Missing item with id '${arrayVal.id}'`);
            }
        }

        return codenames;
    }
};