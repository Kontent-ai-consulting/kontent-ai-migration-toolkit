import { ManagementClient, SharedModels, WorkflowModels } from '@kontent-ai/management-sdk';
import {
    Logger,
    runMapiRequestAsync,
    LogSpinnerData,
    MigrationItem,
    workflowHelper as workflowHelperInit,
    MigrationItemVersion
} from '../../core/index.js';

export function workflowImporter(config: {
    readonly logger: Logger;
    readonly managementClient: Readonly<ManagementClient>;
    readonly workflows: readonly Readonly<WorkflowModels.Workflow>[];
}) {
    const workflowHelper = workflowHelperInit(config.workflows);

    const publishLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () =>
                (
                    await config.managementClient
                        .publishLanguageVariant()
                        .byItemCodename(data.migrationItem.system.codename)
                        .byLanguageCodename(data.migrationItem.system.language.codename)
                        .withoutData()
                        .toPromise()
                ).data,
            action: 'publish',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename})`
        });
    };

    const unpublishLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        // unpublish the language variant first if published
        // there is no way to determine if language variant is published via MAPI
        // so we have to always try unpublishing first and catching possible errors
        try {
            await runMapiRequestAsync({
                logger: config.logger,
                func: async () =>
                    (
                        await config.managementClient
                            .unpublishLanguageVariant()
                            .byItemCodename(data.migrationItem.system.codename)
                            .byLanguageCodename(data.migrationItem.system.language.codename)
                            .withoutData()
                            .toPromise()
                    ).data,
                action: 'unpublish',
                type: 'languageVariant',
                logSpinner: data.logSpinner,
                itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename})`
            });
        } catch (error) {
            if (error instanceof SharedModels.ContentManagementBaseKontentError) {
                data.logSpinner({
                    type: 'unpublish',
                    message: `Unpublish failed, but this may be expected behavior as we cannot determine if there is a published version already. Error received: ${error.message}`
                });
            } else {
                throw error;
            }
        }
    };

    const schedulePublishLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
        readonly schedule: {
            readonly publish_time: string;
            readonly publish_display_timezone: string;
        };
    }): Promise<void> => {
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () =>
                (
                    await config.managementClient
                        .publishLanguageVariant()
                        .byItemCodename(data.migrationItem.system.codename)
                        .byLanguageCodename(data.migrationItem.system.language.codename)
                        .withData({
                            scheduled_to: data.schedule.publish_time,
                            display_timezone: data.schedule.publish_display_timezone
                        })
                        .toPromise()
                ).data,
            action: 'schedulePublish',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename})`
        });
    };

    const scheduleUnpublishLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
        readonly schedule: {
            readonly unpublish_time: string;
            readonly unpublish_display_timezone: string;
        };
    }): Promise<void> => {
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () =>
                (
                    await config.managementClient
                        .unpublishLanguageVariant()
                        .byItemCodename(data.migrationItem.system.codename)
                        .byLanguageCodename(data.migrationItem.system.language.codename)
                        .withData({
                            scheduled_to: data.schedule.unpublish_time,
                            display_timezone: data.schedule.unpublish_display_timezone
                        })
                        .toPromise()
                ).data,
            action: 'scheduleUnpublish',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename})`
        });
    };

    const archiveLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly workflowCodename: string;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        const workflow = workflowHelper.getWorkflowByCodename(data.workflowCodename);
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () =>
                (
                    await config.managementClient
                        .changeWorkflowOfLanguageVariant()
                        .byItemCodename(data.migrationItem.system.codename)
                        .byLanguageCodename(data.migrationItem.system.language.codename)
                        .withData({
                            step_identifier: {
                                codename: workflow.archivedStep.codename
                            },
                            workflow_identifier: {
                                codename: workflow.codename
                            }
                        })
                        .toPromise()
                ).data,
            action: 'archive',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename}) -> ${workflow.archivedStep.codename}`
        });
    };

    const changeWorkflowOfLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly workflowCodename: string;
        readonly stepCodename: string;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        const { workflow, step } = workflowHelper.getWorkflowAndStepByCodenames({
            workflowCodename: data.workflowCodename,
            stepCodename: data.stepCodename
        });

        await runMapiRequestAsync({
            logger: config.logger,
            func: async () =>
                (
                    await config.managementClient
                        .changeWorkflowOfLanguageVariant()
                        .byItemCodename(data.migrationItem.system.codename)
                        .byLanguageCodename(data.migrationItem.system.language.codename)
                        .withData({
                            step_identifier: {
                                codename: step.codename
                            },
                            workflow_identifier: {
                                codename: workflow.codename
                            }
                        })
                        .toPromise()
                ).data,
            action: 'changeWorkflowStep',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename}) -> ${step.codename}`
        });
    };

    const createNewVersionOfLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () => {
                await config.managementClient
                    .createNewVersionOfLanguageVariant()
                    .byItemCodename(data.migrationItem.system.codename)
                    .byLanguageCodename(data.migrationItem.system.language.codename)
                    .toPromise();
            },
            action: 'createNewVersion',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename})`
        });
    };

    const cancelScheduledPublishAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () => {
                await config.managementClient
                    .cancelSheduledPublishingOfLanguageVariant()
                    .byItemCodename(data.migrationItem.system.codename)
                    .byLanguageCodename(data.migrationItem.system.language.codename)
                    .toPromise();
            },
            action: 'cancelScheduledPublish',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename}) -> Cancel scheduled publish`
        });
    };

    const cancelScheduledUnpublishAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        await runMapiRequestAsync({
            logger: config.logger,
            func: async () => {
                await config.managementClient
                    .cancelSheduledUnpublishingOfLanguageVariant()
                    .byItemCodename(data.migrationItem.system.codename)
                    .byLanguageCodename(data.migrationItem.system.language.codename)
                    .toPromise();
            },
            action: 'cancelScheduledUnpublish',
            type: 'languageVariant',
            logSpinner: data.logSpinner,
            itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename}) -> Cancel scheduled unpublish`
        });
    };

    const moveToDraftStepAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly migrationItem: MigrationItem;
    }): Promise<void> => {
        const workflow = workflowHelper.getWorkflowByCodename(data.migrationItem.system.workflow.codename);
        const firstWorkflowStep = workflow.steps?.[0];

        if (firstWorkflowStep) {
            await runMapiRequestAsync({
                logger: config.logger,
                func: async () => {
                    await config.managementClient
                        .changeWorkflowOfLanguageVariant()
                        .byItemCodename(data.migrationItem.system.codename)
                        .byLanguageCodename(data.migrationItem.system.language.codename)
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
                logSpinner: data.logSpinner,
                itemName: `${data.migrationItem.system.codename} (${data.migrationItem.system.language.codename}) -> ${firstWorkflowStep.codename}`
            });
        }
    };

    const setWorkflowOfLanguageVariantAsync = async (data: {
        readonly logSpinner: LogSpinnerData;
        readonly workflowCodename: string;
        readonly stepCodename: string;
        readonly migrationItem: MigrationItem;
        readonly migrationItemVersion: MigrationItemVersion;
    }): Promise<void> => {
        if (workflowHelper.isPublishedStepByCodename(data.stepCodename)) {
            await publishLanguageVariantAsync(data);
        } else if (workflowHelper.isArchivedStepByCodename(data.stepCodename)) {
            await archiveLanguageVariantAsync(data);
        } else if (workflowHelper.isScheduledStepByCodename(data.stepCodename)) {
            // do nothing for scheduled step
        } else {
            await changeWorkflowOfLanguageVariantAsync(data);
        }

        // set scheduling if needed
        if (data.migrationItemVersion.schedule.unpublish_time && data.migrationItemVersion.schedule.unpublish_display_timezone) {
            await scheduleUnpublishLanguageVariantAsync({
                logSpinner: data.logSpinner,
                migrationItem: data.migrationItem,
                schedule: {
                    unpublish_time: data.migrationItemVersion.schedule.unpublish_time,
                    unpublish_display_timezone: data.migrationItemVersion.schedule.unpublish_display_timezone
                }
            });
        } else if (data.migrationItemVersion.schedule.publish_time && data.migrationItemVersion.schedule.publish_display_timezone) {
            await schedulePublishLanguageVariantAsync({
                logSpinner: data.logSpinner,
                migrationItem: data.migrationItem,
                schedule: {
                    publish_time: data.migrationItemVersion.schedule.publish_time,
                    publish_display_timezone: data.migrationItemVersion.schedule.publish_display_timezone
                }
            });
        }
    };

    return {
        setWorkflowOfLanguageVariantAsync,
        publishLanguageVariantAsync,
        unpublishLanguageVariantAsync,
        archiveLanguageVariantAsync,
        changeWorkflowOfLanguageVariantAsync,
        moveToDraftStepAsync,
        createNewVersionOfLanguageVariantAsync,
        cancelScheduledPublishAsync,
        cancelScheduledUnpublishAsync
    };
}
