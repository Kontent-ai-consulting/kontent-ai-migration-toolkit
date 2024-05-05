import { ExportTransformFunc, IExportContext, MigrationElementType } from '../../core/index.js';
import { ContentTypeElements, TaxonomyModels } from '@kontent-ai/management-sdk';
import { RichTextService, getRichTextService } from '../rich-text.service.js';

const richTextService: RichTextService = getRichTextService();

/**
 * Elements transform used by Kontent.ai export adapter
 */
export const exportTransforms: Readonly<Record<MigrationElementType, ExportTransformFunc>> = {
    text: (data) => data.value?.toString(),
    number: (data) => data.value?.toString(),
    date_time: (data) => data.value?.toString(),
    rich_text: (data) => transformRichTextValue(data.value?.toString(), data.context),
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
        if (!data.value) {
            return [];
        }

        if (!Array.isArray(data.value)) {
            throw Error(`Expected value to be an array`);
        }

        const taxonomyElement = data.typeElement.element as ContentTypeElements.ITaxonomyElement;
        const taxonomyGroupId = taxonomyElement.taxonomy_group.id ?? 'n/a';

        // get taxonomy group
        const taxonomy = data.context.environmentData.taxonomies.find((m) => m.id === taxonomyGroupId);

        if (!taxonomy) {
            throw Error(`Could not find taxonomy group with id '${taxonomyGroupId}'`);
        }

        // translate item id to codename
        const codenames: string[] = [];
        for (const arrayVal of data.value) {
            if (!arrayVal.id) {
                continue;
            }

            const taxonomyTerm = findTaxonomy(arrayVal.id, taxonomy);

            if (taxonomyTerm) {
                // reference taxonomy term by codename
                codenames.push(taxonomyTerm.codename);
            } else {
                throw Error(`Missing taxonomy term with id '${arrayVal.id}'`);
            }
        }

        return codenames;
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

function findTaxonomy(termId: string, taxonomy: TaxonomyModels.Taxonomy): TaxonomyModels.Taxonomy | undefined {
    if (taxonomy.id === termId) {
        return taxonomy;
    }

    if (taxonomy.terms) {
        for (const taxonomyTerm of taxonomy.terms) {
            const foundTerm = findTaxonomy(termId, taxonomyTerm);
            if (foundTerm) {
                return foundTerm;
            }
        }
    }

    return undefined;
}

function transformRichTextValue(richTextHtml: string | undefined, context: IExportContext): string | undefined {
    if (!richTextHtml) {
        return richTextHtml;
    }

    // replace item ids with codenames
    richTextHtml = richTextService.processDataIds(richTextHtml, (id) => {
        const itemInEnv = context.getItemStateInSourceEnvironment(id).item;

        if (!itemInEnv) {
            throw Error(`Failed to get item with id '${id}'`);
        }

        return {
            codename: itemInEnv.codename
        };
    }).html;

    // replace link item ids with codenames
    richTextHtml = richTextService.processLinkItemIds(richTextHtml, (id) => {
        const itemInEnv = context.getItemStateInSourceEnvironment(id).item;

        if (!itemInEnv) {
            throw Error(`Failed to get item with id '${id}'`);
        }

        return {
            codename: itemInEnv.codename
        };
    }).html;

    // replace asset ids with codenames
    richTextHtml = richTextService.processAssetIds(richTextHtml, (id) => {
        const assetInEnv = context.getAssetStateInSourceEnvironment(id).asset;

        if (!assetInEnv) {
            throw Error(`Failed to get asset with id '${id}'`);
        }

        return {
            codename: assetInEnv.codename
        };
    }).html;

    return richTextHtml;
}
