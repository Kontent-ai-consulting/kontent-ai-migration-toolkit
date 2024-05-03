import {
    SharedContracts,
    LanguageVariantElementsBuilder
} from '@kontent-ai/management-sdk';
import {
    ImportTransformFunc,
    parseArrayValue,
    logErrorAndExit,
    MigrationElementType,
    IImportContext
} from '../../core/index.js';
import colors from 'colors';

const elementsBuilder = new LanguageVariantElementsBuilder();

/**
 * General import transforms used to prepare parsed element values for Management API
 */
export const importTransforms: Readonly<Record<MigrationElementType, ImportTransformFunc>> = {
    guidelines: async (data) => {
        logErrorAndExit({
            message: `Guidelines import transform not supported`
        });
    },
    snippet: async (data) => {
        logErrorAndExit({
            message: `Content type snippet import transform not supported`
        });
    },
    subpages: async (data) => {
        return elementsBuilder.linkedItemsElement({
            element: {
                codename: data.elementCodename
            },
            value: parseArrayValue(data.value).map((m) => {
                return {
                    codename: m
                };
            })
        });
    },
    asset: async (data) => {
        const assetReferences: SharedContracts.IReferenceObjectContract[] = [];

        for (const assetCodename of parseArrayValue(data.value)) {
            // find imported asset
            const importedAsset = data.importContext.importedAssets.find(
                (s) => s.original.codename?.toLowerCase() === assetCodename.toLowerCase()
            );

            if (!importedAsset) {
                throw Error(`Could not find imported asset with codename '${colors.red(assetCodename)}'`);
            }

            assetReferences.push({
                id: importedAsset.imported.id
            });
        }

        return elementsBuilder.assetElement({
            element: {
                codename: data.elementCodename
            },
            value: assetReferences
        });
    },
    custom: async (data) => {
        return elementsBuilder.customElement({
            element: {
                codename: data.elementCodename
            },
            value: data.value?.toString() ?? ''
        });
    },
    date_time: async (data) => {
        return elementsBuilder.dateTimeElement({
            element: {
                codename: data.elementCodename
            },
            value: data.value?.toString() ?? null
        });
    },
    modular_content: async (data) => {
        const value: SharedContracts.IReferenceObjectContract[] = [];
        const linkedItemCodenames: string[] = parseArrayValue(data.value);

        for (const linkedItemCodename of linkedItemCodenames) {
            const itemState = data.importContext.categorizedItems.getItemStateInTargetEnvironment(linkedItemCodename);

            if (itemState.item) {
                // linked item already exists in target environment
                value.push({
                    codename: itemState.codename
                });
            } else {
                // linked item is new, reference it with external id
                value.push({
                    external_id: itemState.externalIdToUse
                });
            }
        }

        return elementsBuilder.linkedItemsElement({
            element: {
                codename: data.elementCodename
            },
            value: value
        });
    },
    multiple_choice: async (data) => {
        return elementsBuilder.multipleChoiceElement({
            element: {
                codename: data.elementCodename
            },
            value: parseArrayValue(data.value).map((m) => {
                return {
                    codename: m
                };
            })
        });
    },
    number: async (data) => {
        return elementsBuilder.numberElement({
            element: {
                codename: data.elementCodename
            },
            value: data.value ? +data.value : null
        });
    },
    rich_text: async (data) => {
        const rteHtml = data.value?.toString() ?? '';
        const processedRte = await processImportRichTextHtmlValueAsync(rteHtml, data.importContext);

        return elementsBuilder.richTextElement({
            element: {
                codename: data.elementCodename
            },
            value: processedRte.processedHtml
        });
    },
    taxonomy: async (data) => {
        return elementsBuilder.taxonomyElement({
            element: {
                codename: data.elementCodename
            },
            value: parseArrayValue(data.value).map((m) => {
                return {
                    codename: m
                };
            })
        });
    },
    text: async (data) => {
        return elementsBuilder.textElement({
            element: {
                codename: data.elementCodename
            },
            value: data.value?.toString() ?? null
        });
    },
    url_slug: async (data) => {
        return elementsBuilder.urlSlugElement({
            element: {
                codename: data.elementCodename
            },
            value: data.value?.toString() ?? '',
            mode: 'custom'
        });
    }
};

async function processImportRichTextHtmlValueAsync(
    richTextHtml: string | undefined,
    importContext: IImportContext
): Promise<{
    processedHtml: string;
    linkedItemCodenames: string[];
    componentCodenames: string[];
}> {
    const componentCodenames: string[] = [];
    const linkedItemCodenames: string[] = [];

    if (!richTextHtml) {
        return {
            linkedItemCodenames: [],
            componentCodenames: [],
            processedHtml: ''
        };
    }

    return {
        linkedItemCodenames: linkedItemCodenames,
        componentCodenames: componentCodenames,
        processedHtml: richTextHtml
    };
}