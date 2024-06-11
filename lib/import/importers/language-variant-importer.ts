import {
    ContentItemModels,
    LanguageVariantElements,
    LanguageVariantModels,
    ManagementClient,
    WorkflowModels
} from '@kontent-ai/management-sdk';
import {
    Logger,
    processInChunksAsync,
    runMapiRequestAsync,
    MigrationItem,
    logErrorAndExit,
    extractErrorData,
    LogSpinnerData,
    MigrationElement
} from '../../core/index.js';
import chalk from 'chalk';
import { ImportContext } from '../import.models.js';
import { importTransforms } from '../../translation/index.js';
import { workflowImporter } from './workflow-importer.js';

export function languageVariantImporter(data: {
    readonly logger: Logger;
    readonly workflows: WorkflowModels.Workflow[];
    readonly preparedContentItems: ContentItemModels.ContentItem[];
    readonly importContext: ImportContext;
    readonly client: ManagementClient;
    readonly skipFailedItems: boolean;
}) {
    const importContentItemChunkSize = 1;

    const importLanguageVariantAsync = async (
        logSpinner: LogSpinnerData,
        migrationItem: MigrationItem,
        preparedContentItem: ContentItemModels.ContentItem
    ) => {
        await prepareLanguageVariantForImportAsync(logSpinner, migrationItem);

        const workflowStepCodename = migrationItem.system.workflow_step;
        const workflowCodename = migrationItem.system.workflow;

        if (!workflowCodename) {
            throw Error(`Content item '${chalk.red(migrationItem.system.codename)}' does not have a workflow assigned`);
        }

        if (!workflowStepCodename) {
            throw Error(
                `Content item '${chalk.red(migrationItem.system.codename)}' does not have a workflow step assigned`
            );
        }

        // validate workflow
        const { workflow } = workflowImporter(data.logger).getWorkflowAndStep({
            workflowCodename: workflowCodename,
            workflowStepCodename: workflowStepCodename,
            workflows: data.workflows
        });

        // prepare & map elements
        const mappedElements: LanguageVariantElements.ILanguageVariantElementBase[] = [];

        for (const element of migrationItem.elements) {
            mappedElements.push(await getElementContractAsync(migrationItem, element));
        }

        // upsert language variant
        await runMapiRequestAsync({
            logger: data.logger,
            func: async () =>
                (
                    await data.client
                        .upsertLanguageVariant()
                        .byItemCodename(preparedContentItem.codename)
                        .byLanguageCodename(migrationItem.system.language)
                        .withData((builder) => {
                            return {
                                elements: mappedElements,
                                workflow: {
                                    workflow_identifier: {
                                        codename: workflow.codename
                                    },
                                    step_identifier: {
                                        codename: workflow.steps[0].codename // use always first step
                                    }
                                }
                            };
                        })
                        .toPromise()
                ).data,
            action: 'upsert',
            type: 'languageVariant',
            logSpinner: logSpinner,
            itemName: `${migrationItem.system.codename} (${migrationItem.system.language})`
        });

        // set workflow of language variant
        await workflowImporter(data.logger).setWorkflowOfLanguageVariantAsync(
            logSpinner,
            data.client,
            workflowCodename,
            workflowStepCodename,
            migrationItem,
            data.workflows
        );
    };

    const prepareLanguageVariantForImportAsync = async (logSpinner: LogSpinnerData, migrationItem: MigrationItem) => {
        const languageVariantState = data.importContext.getLanguageVariantStateInTargetEnvironment(
            migrationItem.system.codename,
            migrationItem.system.language
        );

        const workflowCodename = migrationItem.system.workflow;
        const workflowStepCodename = migrationItem.system.workflow_step;
        const languageVariant = languageVariantState.languageVariant;

        if (!languageVariant) {
            // language variant does not exist, no need to process it any further as it will get upserted
            return;
        }

        if (!workflowCodename) {
            throw Error(
                `Item with codename '${migrationItem.system.codename}' does not have workflow property assigned`
            );
        }

        if (!workflowStepCodename) {
            throw Error(`Item with codename '${migrationItem.system.codename}' does not have workflow step assigned`);
        }

        const { workflow } = workflowImporter(data.logger).getWorkflowAndStep({
            workflows: data.workflows,
            workflowCodename: workflowCodename,
            workflowStepCodename: workflowStepCodename
        });

        // check if variant is published or archived
        if (isLanguageVariantPublished(languageVariant, data.workflows)) {
            // create new version
            await runMapiRequestAsync({
                logger: data.logger,
                func: async () =>
                    (
                        await data.client
                            .createNewVersionOfLanguageVariant()
                            .byItemCodename(migrationItem.system.codename)
                            .byLanguageCodename(migrationItem.system.language)
                            .toPromise()
                    ).data,
                action: 'createNewVersion',
                type: 'languageVariant',
                logSpinner: logSpinner,
                itemName: `${migrationItem.system.codename} (${migrationItem.system.language})`
            });
        } else if (isLanguageVariantArchived(languageVariant, data.workflows)) {
            // change workflow step to draft
            const firstWorkflowStep = workflow.steps?.[0];

            if (firstWorkflowStep) {
                await runMapiRequestAsync({
                    logger: data.logger,
                    func: async () =>
                        (
                            await data.client
                                .changeWorkflowStepOfLanguageVariant()
                                .byItemCodename(migrationItem.system.codename)
                                .byLanguageCodename(migrationItem.system.language)
                                .byWorkflowStepCodename(firstWorkflowStep.codename)
                                .toPromise()
                        ).data,
                    action: 'changeWorkflowStep',
                    type: 'languageVariant',
                    logSpinner: logSpinner,
                    itemName: `${migrationItem.system.codename} (${migrationItem.system.language}) -> ${firstWorkflowStep.codename}`
                });
            }
        }
    };

    const isLanguageVariantPublished = (
        languageVariant: LanguageVariantModels.ContentItemLanguageVariant,
        workflows: WorkflowModels.Workflow[]
    ) => {
        for (const workflow of workflows) {
            if (workflow.publishedStep.id === languageVariant.workflow.stepIdentifier.id) {
                return true;
            }
        }

        return false;
    };

    const isLanguageVariantArchived = (
        languageVariant: LanguageVariantModels.ContentItemLanguageVariant,
        workflows: WorkflowModels.Workflow[]
    ) => {
        for (const workflow of workflows) {
            if (workflow.archivedStep.id === languageVariant.workflow.stepIdentifier.id) {
                return true;
            }
        }

        return false;
    };

    const getElementContractAsync = async (migrationItem: MigrationItem, element: MigrationElement) => {
        const flattenedElement = data.importContext.getElement(migrationItem.system.type, element.codename);

        const importContract = await importTransforms[flattenedElement.type]({
            elementCodename: element.codename,
            importContext: data.importContext,
            sourceItems: data.importContext.contentItems,
            value: element.value
        });

        if (!importContract) {
            logErrorAndExit({
                message: `Missing import contract for element '${chalk.red(element.codename)}' `
            });
        }

        return importContract;
    };

    const importAsync = async () => {
        data.logger.log({
            type: 'info',
            message: `Importing '${chalk.yellow(data.importContext.contentItems.length.toString())}' language variants`
        });

        await processInChunksAsync<MigrationItem, void>({
            logger: data.logger,
            chunkSize: importContentItemChunkSize,
            items: data.importContext.contentItems,
            itemInfo: (input) => {
                return {
                    itemType: 'languageVariant',
                    title: input.system.name,
                    partA: input.system.language
                };
            },
            processAsync: async (migrationItem, logSpinner) => {
                try {
                    const preparedContentItem = data.preparedContentItems.find(
                        (m) => m.codename === migrationItem.system.codename
                    );

                    if (!preparedContentItem) {
                        logErrorAndExit({
                            message: `Invalid content item for codename '${chalk.red(migrationItem.system.codename)}'`
                        });
                    }

                    await importLanguageVariantAsync(logSpinner, migrationItem, preparedContentItem);
                } catch (error) {
                    if (data.skipFailedItems) {
                        data.logger.log({
                            type: 'error',
                            message: `Failed to import language variant '${chalk.red(
                                migrationItem.system.name
                            )}' in language '${chalk.red(migrationItem.system.language)}'. Error: ${
                                extractErrorData(error).message
                            }`
                        });
                    } else {
                        throw error;
                    }
                }
            }
        });
    };

    return {
        importAsync
    };
}