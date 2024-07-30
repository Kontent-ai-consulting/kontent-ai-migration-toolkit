import { AssetModels, ContentItemModels, LanguageVariantModels } from '@kontent-ai/management-sdk';
import {
    AssetStateInTargetEnvironmentByCodename,
    ItemStateInTargetEnvironmentByCodename,
    LanguageVariantSchedulesStateValues,
    LanguageVariantStateData,
    LanguageVariantStateInTargetEnvironmentByCodename,
    LanguageVariantWorkflowState,
    LanguageVariantWorkflowStateValues,
    LogSpinnerData,
    MigrationItem,
    WorkflowStep,
    findRequired,
    is404Error,
    isNotUndefined,
    managementClientUtils,
    processItemsAsync,
    runMapiRequestAsync,
    workflowHelper
} from '../../core/index.js';
import { GetFlattenedElementByCodenames, ImportContext, ImportContextConfig, ImportContextEnvironmentData } from '../import.models.js';
import { ExtractItemByCodename, itemsExtractionProcessor } from '../../translation/index.js';
import chalk from 'chalk';

interface LanguageVariantWrapper {
    readonly draftLanguageVariant: Readonly<LanguageVariantModels.ContentItemLanguageVariant> | undefined;
    readonly publishedLanguageVariant: Readonly<LanguageVariantModels.ContentItemLanguageVariant> | undefined;
    readonly migrationItem: MigrationItem;
}

export async function importContextFetcherAsync(config: ImportContextConfig) {
    const getEnvironmentDataAsync = async (): Promise<ImportContextEnvironmentData> => {
        const mapiUtils = managementClientUtils(config.managementClient, config.logger);

        return await config.logger.logWithSpinnerAsync(async (spinnerData) => {
            spinnerData({ type: 'info', message: `Loading environment data` });

            const environmentData: ImportContextEnvironmentData = {
                collections: await mapiUtils.getAllCollectionsAsync(spinnerData),
                languages: await mapiUtils.getAllLanguagesAsync(spinnerData),
                workflows: await mapiUtils.getAllWorkflowsAsync(spinnerData),
                types: await mapiUtils.getFlattenedContentTypesAsync(spinnerData)
            };

            spinnerData({ type: 'info', message: `Environmental data loaded` });

            return environmentData;
        });
    };

    const environmentData = await getEnvironmentDataAsync();

    const getElement = () => {
        const getFlattenedElement: GetFlattenedElementByCodenames = (contentTypeCodename, elementCodename, sourceType) => {
            const contentType = findRequired(
                environmentData.types,
                (type) => type.contentTypeCodename === contentTypeCodename,
                `Content type with codename '${chalk.red(contentTypeCodename)}' was not found.`
            );

            const element = findRequired(
                contentType.elements,
                (element) => element.codename === elementCodename,
                `Element type with codename '${chalk.red(elementCodename)}' was not found in content type '${chalk.red(
                    contentTypeCodename
                )}'. Available elements are '${contentType.elements.map((element) => chalk.yellow(element.codename)).join(', ')}'`
            );

            if (sourceType !== element.type) {
                throw Error(
                    `Element '${chalk.red(element.codename)}' in content type '${chalk.yellow(
                        contentType.contentTypeCodename
                    )}' is of type '${chalk.red(element.type)}', but source type is '${chalk.yellow(sourceType)}'.`
                );
            }

            return element;
        };

        return getFlattenedElement;
    };

    const getDraftLanguageVariantAsync = async (
        logSpinner: LogSpinnerData,
        migrationItem: MigrationItem
    ): Promise<Readonly<LanguageVariantModels.ContentItemLanguageVariant> | undefined> => {
        try {
            const draftLanguageVariant = await runMapiRequestAsync({
                logger: config.logger,
                func: async () =>
                    (
                        await config.managementClient
                            .viewLanguageVariant()
                            .byItemCodename(migrationItem.system.codename)
                            .byLanguageCodename(migrationItem.system.language.codename)
                            .toPromise()
                    ).data,
                action: 'view',
                type: 'languageVariant',
                logSpinner: logSpinner,
                itemName: `draft -> codename -> ${migrationItem.system.codename} (${migrationItem.system.language.codename})`
            });

            return draftLanguageVariant;
        } catch (error) {
            if (!is404Error(error)) {
                throw error;
            }

            return undefined;
        }
    };

    const getPublishedLanguageVariantAsync = async (
        logSpinner: LogSpinnerData,
        migrationItem: MigrationItem
    ): Promise<Readonly<LanguageVariantModels.ContentItemLanguageVariant> | undefined> => {
        try {
            const draftLanguageVariant = await runMapiRequestAsync({
                logger: config.logger,
                func: async () =>
                    (
                        await config.managementClient
                            .viewLanguageVariant()
                            .byItemCodename(migrationItem.system.codename)
                            .byLanguageCodename(migrationItem.system.language.codename)
                            .published()
                            .toPromise()
                    ).data,
                action: 'view',
                type: 'languageVariant',
                logSpinner: logSpinner,
                itemName: `published -> codename -> ${migrationItem.system.codename} (${migrationItem.system.language.codename})`
            });

            return draftLanguageVariant;
        } catch (error) {
            if (!is404Error(error)) {
                throw error;
            }

            return undefined;
        }
    };

    const getLanguageVariantsAsync = async (migrationItems: readonly MigrationItem[]): Promise<readonly LanguageVariantWrapper[]> => {
        return (
            await processItemsAsync<MigrationItem, LanguageVariantWrapper | undefined>({
                action: 'Fetching language variants',
                logger: config.logger,
                parallelLimit: 1,
                items: migrationItems,
                itemInfo: (item) => {
                    return {
                        itemType: 'languageVariant',
                        title: `${item.system.codename} (${item.system.language.codename})`
                    };
                },
                processAsync: async (item, logSpinner) => {
                    const draftLanguageVariant = await getDraftLanguageVariantAsync(logSpinner, item);

                    return {
                        migrationItem: item,
                        draftLanguageVariant: draftLanguageVariant,
                        publishedLanguageVariant: draftLanguageVariant
                            ? await getPublishedLanguageVariantAsync(logSpinner, item)
                            : undefined
                    };
                }
            })
        ).filter(isNotUndefined);
    };

    const getContentItemsByCodenamesAsync = async (
        itemCodenames: ReadonlySet<string>
    ): Promise<readonly ContentItemModels.ContentItem[]> => {
        return (
            await processItemsAsync<string, Readonly<ContentItemModels.ContentItem> | undefined>({
                action: 'Fetching content items',
                logger: config.logger,
                parallelLimit: 1,
                items: Array.from(itemCodenames),
                itemInfo: (codename) => {
                    return {
                        itemType: 'contentItem',
                        title: codename
                    };
                },
                processAsync: async (codename, logSpinner) => {
                    try {
                        return await runMapiRequestAsync({
                            logger: config.logger,
                            func: async () => (await config.managementClient.viewContentItem().byItemCodename(codename).toPromise()).data,
                            action: 'view',
                            type: 'contentItem',
                            logSpinner: logSpinner,
                            itemName: `codename -> ${codename}`
                        });
                    } catch (error) {
                        if (!is404Error(error)) {
                            throw error;
                        }

                        return undefined;
                    }
                }
            })
        ).filter(isNotUndefined);
    };

    const getAssetsByCodenamesAsync = async (assetCodenames: ReadonlySet<string>): Promise<readonly AssetModels.Asset[]> => {
        return (
            await processItemsAsync<string, Readonly<AssetModels.Asset> | undefined>({
                action: 'Fetching assets',
                logger: config.logger,
                parallelLimit: 1,
                items: Array.from(assetCodenames),
                itemInfo: (codename) => {
                    return {
                        itemType: 'asset',
                        title: codename
                    };
                },
                processAsync: async (codename, logSpinner) => {
                    try {
                        return await runMapiRequestAsync({
                            logger: config.logger,
                            func: async () => (await config.managementClient.viewAsset().byAssetCodename(codename).toPromise()).data,
                            action: 'view',
                            type: 'asset',
                            logSpinner: logSpinner,
                            itemName: `codename -> ${codename}`
                        });
                    } catch (error) {
                        if (!is404Error(error)) {
                            throw error;
                        }

                        return undefined;
                    }
                }
            })
        ).filter(isNotUndefined);
    };

    const getVariantState = (languageVariant: Readonly<LanguageVariantModels.ContentItemLanguageVariant>): LanguageVariantStateData => {
        const variantWorkflowId = languageVariant.workflow.workflowIdentifier.id;
        const variantStepId = languageVariant.workflow.stepIdentifier.id;
        const { workflow, step } = workflowHelper(environmentData.workflows).getWorkflowAndStep({
            workflowMatcher: {
                errorMessage: `Could not workflow with id '${chalk.red(variantWorkflowId)}' in target project`,
                match: (workflow) => workflow.id == variantWorkflowId
            },
            stepMatcher: {
                errorMessage: `Could not workflow step with id '${chalk.red(variantStepId)}' in workflow '${chalk.yellow(
                    variantWorkflowId
                )}'`,
                match: (step) => step.id == variantStepId
            }
        });

        console.log(languageVariant.item.id, languageVariant.schedule, getWorkflowState(step, languageVariant));

        return {
            languageVariant: languageVariant,
            workflow: workflow,
            workflowState: getWorkflowState(step, languageVariant)
        };
    };

    const getVariantStatesAsync = async (
        migrationItems: readonly MigrationItem[]
    ): Promise<readonly LanguageVariantStateInTargetEnvironmentByCodename[]> => {
        const variants = await getLanguageVariantsAsync(migrationItems);

        return migrationItems.map<LanguageVariantStateInTargetEnvironmentByCodename>((migrationItem) => {
            const variant = variants.find(
                (m) =>
                    m.migrationItem.system.codename === migrationItem.system.codename &&
                    m.migrationItem.system.language === migrationItem.system.language
            );

            return {
                itemCodename: migrationItem.system.codename,
                languageCodename: migrationItem.system.language.codename,
                draftLanguageVariant: variant?.draftLanguageVariant ? getVariantState(variant.draftLanguageVariant) : undefined,
                publishedLanguageVariant: variant?.publishedLanguageVariant ? getVariantState(variant.publishedLanguageVariant) : undefined,
                state: variant ? 'exists' : 'doesNotExists'
            };
        });
    };

    const getWorkflowState = (
        step: Readonly<WorkflowStep>,
        variant: Readonly<LanguageVariantModels.ContentItemLanguageVariant> | undefined
    ): LanguageVariantWorkflowState => {
        if (!variant) {
            return undefined;
        }

        const helper = workflowHelper(environmentData.workflows);

        const getScheduledState = (): LanguageVariantSchedulesStateValues => {
            if (variant.schedule.publishTime && variant.schedule.publishDisplayTimezone) {
                return 'scheduledPublish';
            }

            if (variant.schedule.unpublishTime && variant.schedule.unpublishDisplayTimezone) {
                return 'scheduledUnpublish';
            }
            return 'n/a';
        };

        const getWorkflowState = (): LanguageVariantWorkflowStateValues => {
            if (helper.isPublishedStepByCodename(step.codename)) {
                return 'published';
            }
            if (helper.isArchivedStepByCodename(step.codename)) {
                return 'archived';
            }
            return 'draft';
        };

        return {
            workflowState: getWorkflowState(),
            scheduledState: getScheduledState()
        };
    };

    const getItemStatesAsync = async (itemCodenames: ReadonlySet<string>): Promise<readonly ItemStateInTargetEnvironmentByCodename[]> => {
        const items = await getContentItemsByCodenamesAsync(itemCodenames);

        return Array.from(itemCodenames).map<ItemStateInTargetEnvironmentByCodename>((codename) => {
            const item = items.find((m) => m.codename === codename);
            return {
                itemCodename: codename,
                item: item,
                state: item ? 'exists' : 'doesNotExists',
                externalIdToUse: config.externalIdGenerator.contentItemExternalId(codename)
            };
        });
    };

    const getAssetStatesAsync = async (
        assetCodenames: ReadonlySet<string>
    ): Promise<readonly AssetStateInTargetEnvironmentByCodename[]> => {
        const assets = await getAssetsByCodenamesAsync(assetCodenames);

        return Array.from(assetCodenames).map<AssetStateInTargetEnvironmentByCodename>((codename) => {
            const asset = assets.find((m) => m.codename === codename);
            return {
                assetCodename: codename,
                asset: asset,
                state: asset ? 'exists' : 'doesNotExists',
                externalIdToUse: config.externalIdGenerator.assetExternalId(codename)
            };
        });
    };

    const getImportContextAsync = async (): Promise<ImportContext> => {
        const getElementByCodenames: GetFlattenedElementByCodenames = getElement();

        const referencedData = itemsExtractionProcessor().extractReferencedItemsFromMigrationItems(
            config.migrationData.items.reduce<ExtractItemByCodename[]>((items, item) => {
                return [
                    ...items,
                    ...item.versions.map((version) => {
                        const extractionItem: ExtractItemByCodename = {
                            contentTypeCodename: item.system.type.codename,
                            elements: version.elements
                        };
                        return extractionItem;
                    })
                ];
            }, []),
            getElementByCodenames
        );
        // fetch all items, including referenced items in content
        const itemCodenamesToCheckInTargetEnv: ReadonlySet<string> = new Set<string>([
            ...referencedData.itemCodenames,
            ...config.migrationData.items.map((m) => m.system.codename)
        ]);

        // fetch all assets, including referenced assets in content
        const assetCodenamesToCheckInTargetEnv: ReadonlySet<string> = new Set<string>([
            ...referencedData.assetCodenames,
            ...config.migrationData.assets.map((m) => m.codename)
        ]);

        // prepare state of objects in target environment
        const itemStates: readonly ItemStateInTargetEnvironmentByCodename[] = await getItemStatesAsync(itemCodenamesToCheckInTargetEnv);

        const variantStates: readonly LanguageVariantStateInTargetEnvironmentByCodename[] = await getVariantStatesAsync(
            config.migrationData.items
        );

        const assetStates: readonly AssetStateInTargetEnvironmentByCodename[] = await getAssetStatesAsync(assetCodenamesToCheckInTargetEnv);

        return {
            environmentData,
            referencedData,
            categorizedImportData: {
                assets: config.migrationData.assets,
                contentItems: config.migrationData.items
            },
            getItemStateInTargetEnvironment: (itemCodename) => {
                return findRequired(
                    itemStates,
                    (state) => state.itemCodename === itemCodename,
                    `Invalid state for item '${chalk.red(itemCodename)}'. It is expected that all item states will be initialized`
                );
            },
            getLanguageVariantStateInTargetEnvironment: (itemCodename, languageCodename) => {
                return findRequired(
                    variantStates,
                    (state) => state.itemCodename === itemCodename && state.languageCodename === languageCodename,
                    `Invalid state for language variant '${chalk.red(itemCodename)}' in language '${chalk.red(
                        languageCodename
                    )}'. It is expected that all variant states will be initialized`
                );
            },
            getAssetStateInTargetEnvironment: (assetCodename) => {
                return findRequired(
                    assetStates,
                    (state) => state.assetCodename === assetCodename,
                    `Invalid state for asset '${chalk.red(assetCodename)}'. It is expected that all asset states will be initialized`
                );
            },
            getElement: getElementByCodenames
        };
    };

    return {
        getImportContextAsync
    };
}
