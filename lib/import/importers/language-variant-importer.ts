import { ContentItemModels, ElementContracts, LanguageVariantModels, ManagementClient, WorkflowModels } from '@kontent-ai/management-sdk';
import {
    Logger,
    processItemsAsync,
    runMapiRequestAsync,
    MigrationItem,
    LogSpinnerData,
    MigrationElement,
    MigrationItemVersion,
    workflowHelper,
    findRequired
} from '../../core/index.js';
import chalk from 'chalk';
import { ImportContext } from '../import.models.js';
import { importTransforms } from '../../translation/index.js';
import { workflowImporter } from './workflow-importer.js';
import { throwErrorForMigrationItem } from '../utils/import.utils.js';

export function languageVariantImporter(config: {
    readonly logger: Logger;
    readonly preparedContentItems: readonly ContentItemModels.ContentItem[];
    readonly importContext: ImportContext;
    readonly client: Readonly<ManagementClient>;
}) {
    const upsertLanguageVariantAsync = async (data: {
        readonly workflow: Readonly<WorkflowModels.Workflow>;
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
        readonly migrationItemVersion: MigrationItemVersion;
        readonly preparedContentItem: Readonly<ContentItemModels.ContentItem>;
    }): Promise<Readonly<LanguageVariantModels.ContentItemLanguageVariant>> => {
        return await runMapiRequestAsync({
            logger: config.logger,
            func: async () => {
                return (
                    await config.client
                        .upsertLanguageVariant()
                        .byItemCodename(data.preparedContentItem.codename)
                        .byLanguageCodename(data.migrationItem.system.language.codename)
                        .withData(() => {
                            return {
                                elements: Object.entries(data.migrationItemVersion.elements).map(([codename, migrationElement]) => {
                                    return getElementContract(data.migrationItem, migrationElement, codename);
                                }),
                                workflow: {
                                    workflow_identifier: {
                                        codename: data.workflow.codename
                                    },
                                    step_identifier: {
                                        codename: data.workflow.steps[0].codename // use always first step
                                    }
                                }
                            };
                        })
                        .toPromise()
                ).data;
            },
            action: 'upsert',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename})`
        });
    };

    const categorizeVersions = (
        migrationItem: MigrationItem
    ): { publishedVersion: MigrationItemVersion | undefined; draftVersion: MigrationItemVersion | undefined } => {
        const workflow = workflowHelper(config.importContext.environmentData.workflows).getWorkflowByCodename(
            migrationItem.system.workflow.codename
        );

        const publishedVersions = migrationItem.versions.filter((version) =>
            isPublishedWorkflowStep(version.workflow_step.codename, workflow)
        );
        const draftVersions = migrationItem.versions.filter(
            (version) => !isPublishedWorkflowStep(version.workflow_step.codename, workflow)
        );

        if (publishedVersions.length > 1) {
            throwErrorForMigrationItem(
                migrationItem,
                `There can be only 1 published version. There are '${publishedVersions.length}' published versions for the item.`
            );
        }

        if (draftVersions.length > 1) {
            throwErrorForMigrationItem(
                migrationItem,
                `There can be only 1 draft version. There are '${publishedVersions.length}' draft versions for the item.`
            );
        }

        return {
            draftVersion: draftVersions?.[0],
            publishedVersion: publishedVersions?.[0]
        };
    };

    const importVersionAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
        readonly migrationItemVersion: MigrationItemVersion;
        readonly preparedContentItem: Readonly<ContentItemModels.ContentItem>;
        readonly workflowStepCodenameInTargetEnvironment: string | undefined;
    }): Promise<Readonly<LanguageVariantModels.ContentItemLanguageVariant>> => {
        // validate workflow
        const { step, workflow } = workflowHelper(config.importContext.environmentData.workflows).getWorkflowAndStepByCodenames({
            workflowCodename: data.migrationItem.system.workflow.codename,
            stepCodename: data.migrationItemVersion.workflow_step.codename
        });

        // prepare target variant for upsert if it exists in target env
        if (data.workflowStepCodenameInTargetEnvironment) {
            await prepareLanguageVariantForImportAsync({
                logSpinner: data.logSpinner,
                workflowStepCodenameInTargetEnvironment: data.workflowStepCodenameInTargetEnvironment,
                migrationItem: data.migrationItem,
                workflow
            });
        }

        // upsert language variant
        const languageVariant = await upsertLanguageVariantAsync({
            logSpinner: data.logSpinner,
            migrationItem: data.migrationItem,
            preparedContentItem: data.preparedContentItem,
            migrationItemVersion: data.migrationItemVersion,
            workflow
        });

        // set workflow accordingly (publish, move to workflow step, archive ...)
        await workflowImporter({
            logger: config.logger,
            managementClient: config.client,
            workflows: config.importContext.environmentData.workflows
        }).setWorkflowOfLanguageVariantAsync({
            logSpinner: data.logSpinner,
            migrationItem: data.migrationItem,
            workflowCodename: workflow.codename,
            stepCodename: step.codename
        });

        return languageVariant;
    };

    const importLanguageVariantAsync = async (
        logSpinner: LogSpinnerData,
        migrationItem: MigrationItem,
        preparedContentItem: Readonly<ContentItemModels.ContentItem>
    ): Promise<readonly LanguageVariantModels.ContentItemLanguageVariant[]> => {
        const { draftVersion, publishedVersion } = categorizeVersions(migrationItem);

        let publishedLanguageVariant: Readonly<LanguageVariantModels.ContentItemLanguageVariant> | undefined;
        let draftLanguageVariant: Readonly<LanguageVariantModels.ContentItemLanguageVariant> | undefined;
        let lastWorkflowStepCodenameInTargetEnvironment: string | undefined;

        const workflow = workflowHelper(config.importContext.environmentData.workflows).getWorkflowByCodename(
            migrationItem.system.workflow.codename
        );

        // get initial state of language variant from target env
        const languageVariantState = config.importContext.getLanguageVariantStateInTargetEnvironment(
            migrationItem.system.codename,
            migrationItem.system.language.codename
        );

        if (languageVariantState.step) {
            // keep track of last worfklow step
            lastWorkflowStepCodenameInTargetEnvironment = languageVariantState.step.codename;
        }

        // first import published version if it exists
        if (publishedVersion) {
            publishedLanguageVariant = await importVersionAsync({
                logSpinner: logSpinner,
                migrationItem: migrationItem,
                preparedContentItem: preparedContentItem,
                migrationItemVersion: publishedVersion,
                workflowStepCodenameInTargetEnvironment: lastWorkflowStepCodenameInTargetEnvironment
            });

            // set last published workflow step to publish as language variant has just been published in target environment
            lastWorkflowStepCodenameInTargetEnvironment = workflow.publishedStep.codename;
        }

        if (draftVersion) {
            draftLanguageVariant = await importVersionAsync({
                logSpinner: logSpinner,
                migrationItem: migrationItem,
                preparedContentItem: preparedContentItem,
                migrationItemVersion: draftVersion,
                workflowStepCodenameInTargetEnvironment: lastWorkflowStepCodenameInTargetEnvironment
            });
        }

        return [...(publishedLanguageVariant ? [publishedLanguageVariant] : []), ...(draftLanguageVariant ? [draftLanguageVariant] : [])];
    };

    const createNewVersionOfLanguageVariantAsync = async (logSpinner: LogSpinnerData, migrationItem: MigrationItem): Promise<void> => {
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () => {
                await config.client
                    .createNewVersionOfLanguageVariant()
                    .byItemCodename(migrationItem.system.codename)
                    .byLanguageCodename(migrationItem.system.language.codename)
                    .toPromise();
            },
            action: 'createNewVersion',
            type: 'languageVariant',
            logSpinner: logSpinner,
            itemName: `${migrationItem.system.codename} (${migrationItem.system.language.codename})`
        });
    };

    const moveToDraftStepAsync = async (
        logSpinner: LogSpinnerData,
        migrationItem: MigrationItem,
        workflow: Readonly<WorkflowModels.Workflow>
    ): Promise<void> => {
        const firstWorkflowStep = workflow.steps?.[0];

        if (firstWorkflowStep) {
            await runMapiRequestAsync({
                logger: config.logger,
                func: async () => {
                    await config.client
                        .changeWorkflowOfLanguageVariant()
                        .byItemCodename(migrationItem.system.codename)
                        .byLanguageCodename(migrationItem.system.language.codename)
                        .withData({
                            workflow_identifier: {
                                codename: workflow.codename
                            },
                            step_identifier: {
                                codename: firstWorkflowStep.codename
                            }
                        })
                        .toPromise();
                },
                action: 'changeWorkflowStep',
                type: 'languageVariant',
                logSpinner: logSpinner,
                itemName: `${migrationItem.system.codename} (${migrationItem.system.language.codename}) -> ${firstWorkflowStep.codename}`
            });
        }
    };

    const prepareLanguageVariantForImportAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
        readonly workflowStepCodenameInTargetEnvironment: string;
        readonly workflow: Readonly<WorkflowModels.Workflow>;
    }): Promise<void> => {
        // create new version if language variant is published
        if (isPublishedWorkflowStep(data.workflowStepCodenameInTargetEnvironment, data.workflow)) {
            await createNewVersionOfLanguageVariantAsync(data.logSpinner, data.migrationItem);
        }

        // move to draft step if language variant is archived
        if (isArchivedWorkflowStep(data.workflowStepCodenameInTargetEnvironment, data.workflow)) {
            await moveToDraftStepAsync(data.logSpinner, data.migrationItem, data.workflow);
        }
    };

    const isPublishedWorkflowStep = (stepCodename: string, workflow: Readonly<WorkflowModels.Workflow>): boolean => {
        return workflow.publishedStep.codename === stepCodename;
    };

    const isArchivedWorkflowStep = (stepCodename: string, workflow: Readonly<WorkflowModels.Workflow>): boolean => {
        return workflow.archivedStep.codename === stepCodename;
    };

    const getElementContract = (
        migrationItem: MigrationItem,
        element: MigrationElement,
        elementCodename: string
    ): Readonly<ElementContracts.IContentItemElementContract> => {
        const importTransformResult = importTransforms[
            config.importContext.getElement(migrationItem.system.type.codename, elementCodename, element.type).type
        ]({
            elementCodename: elementCodename,
            importContext: config.importContext,
            migrationItems: config.importContext.categorizedImportData.contentItems,
            value: element.value
        });

        return importTransformResult;
    };

    const importAsync = async (): Promise<readonly Readonly<LanguageVariantModels.ContentItemLanguageVariant>[]> => {
        config.logger.log({
            type: 'info',
            message: `Importing '${chalk.yellow(
                config.importContext.categorizedImportData.contentItems.length.toString()
            )}' language variants`
        });

        return (
            await processItemsAsync<MigrationItem, readonly Readonly<LanguageVariantModels.ContentItemLanguageVariant>[]>({
                action: 'Importing language variants',
                logger: config.logger,
                parallelLimit: 1,
                items: config.importContext.categorizedImportData.contentItems,
                itemInfo: (input) => {
                    return {
                        itemType: 'languageVariant',
                        title: input.system.name,
                        partA: input.system.language.codename
                    };
                },
                processAsync: async (migrationItem, logSpinner) => {
                    const contentItem = findRequired(
                        config.preparedContentItems,
                        (item) => item.codename === migrationItem.system.codename,
                        `Missing content item with codename '${chalk.red(
                            migrationItem.system.codename
                        )}'. Content item should have been prepepared.`
                    );

                    return await importLanguageVariantAsync(logSpinner, migrationItem, contentItem);
                }
            })
        ).flatMap((m) => m.map((s) => s));
    };

    return {
        importAsync
    };
}
