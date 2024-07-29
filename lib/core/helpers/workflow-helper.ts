import { WorkflowModels } from '@kontent-ai/management-sdk';
import chalk from 'chalk';
import { findRequired } from '../utils/array.utils.js';

export type WorkflowStep = {
    readonly codename: string;
    readonly id: string;
};

type WorkflowMatcher = {
    readonly match: (workflow: Readonly<WorkflowModels.Workflow>, index: number) => boolean;
    readonly errorMessage: string;
};
type StepMatcher = {
    readonly match: (step: WorkflowStep, index: number) => boolean;
    readonly errorMessage: string;
};

export function workflowHelper(workflows: readonly Readonly<WorkflowModels.Workflow>[]) {
    const getWorkflowStep = (workflow: Readonly<WorkflowModels.Workflow>, stepMatcher: StepMatcher): WorkflowStep => {
        return findRequired(
            [...workflow.steps, workflow.archivedStep, workflow.publishedStep, workflow.scheduledStep],
            stepMatcher.match,
            stepMatcher.errorMessage
        );
    };

    const getWorkflow = (workflowMatcher: WorkflowMatcher): Readonly<WorkflowModels.Workflow> => {
        return findRequired(workflows, workflowMatcher.match, workflowMatcher.errorMessage);
    };

    const getWorkflowByCodename = (workflowCodename: string): Readonly<WorkflowModels.Workflow> => {
        return getWorkflow({
            errorMessage: [
                `Workflow with codename '${chalk.red(workflowCodename)}' does not exist in target project`,
                `Available workflows are (${workflows.length}): ${workflows.map((m) => chalk.cyan(m.codename)).join(', ')}`
            ].join(', '),
            match: (workflow) => workflow.codename.toLowerCase() === workflowCodename.toLowerCase()
        });
    };

    const getWorkflowStepByCodename = (workflow: Readonly<WorkflowModels.Workflow>, stepCodename: string): WorkflowStep => {
        return getWorkflowStep(workflow, {
            errorMessage: [
                `Workflow step with codename '${chalk.red(stepCodename)}' does not exist in target project`,
                `Step in workflow '${chalk.yellow(workflow.codename)}' are (${workflows.length}): ${workflows
                    .map((m) => chalk.cyan(m.codename))
                    .join(', ')}`
            ].join(', '),
            match: (step) => step.codename.toLowerCase() === stepCodename.toLowerCase()
        });
    };

    const getWorkflowAndStep = (data: {
        readonly workflowMatcher: WorkflowMatcher;
        readonly stepMatcher: StepMatcher;
    }): { step: WorkflowStep; workflow: Readonly<WorkflowModels.Workflow> } => {
        const workflow = getWorkflow(data.workflowMatcher);
        return {
            workflow,
            step: getWorkflowStep(workflow, data.stepMatcher)
        };
    };

    const getWorkflowAndStepByCodenames = (data: {
        readonly workflowCodename: string;
        readonly stepCodename: string;
    }): { step: WorkflowStep; workflow: Readonly<WorkflowModels.Workflow> } => {
        const workflow = getWorkflowByCodename(data.workflowCodename);
        return {
            workflow,
            step: getWorkflowStepByCodename(workflow, data.stepCodename)
        };
    };

    const isPublishedStepByCodename = (stepCodename: string): boolean => {
        return workflows.find((workflow) => workflow.publishedStep.codename === stepCodename) ? true : false;
    };

    const isArchivedStepByCodename = (stepCodename: string): boolean => {
        return workflows.find((workflow) => workflow.archivedStep.codename === stepCodename) ? true : false;
    };

    const isScheduledStepByCodename = (stepCodename: string): boolean => {
        return workflows.find((workflow) => workflow.scheduledStep.codename === stepCodename) ? true : false;
    };

    return {
        getWorkflowByCodename,
        getWorkflowStepByCodename,
        getWorkflowAndStepByCodenames,
        getWorkflowStep,
        getWorkflowAndStep,
        getWorkflow,
        isPublishedStepByCodename,
        isArchivedStepByCodename,
        isScheduledStepByCodename
    };
}
