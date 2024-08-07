import * as dotenv from 'dotenv';
import { confirmImportAsync, extractAsync, importAsync, getDefaultLogger, handleError } from '../../lib/index.js';
import { getEnvironmentRequiredValue } from './utils/test.utils.js';

const run = async () => {
    dotenv.config({
        path: '../../.env.local'
    });

    const environmentId = getEnvironmentRequiredValue('targetEnvironmentId');
    const apiKey = getEnvironmentRequiredValue('targetApiKey');
    const log = getDefaultLogger();

    await confirmImportAsync({
        force: false,
        apiKey: apiKey,
        environmentId: environmentId,
        logger: log
    });

    const data = await extractAsync({
        filename: 'data.zip'
    });

    await importAsync({
        logger: log,
        data: data,
        environmentId: environmentId,
        apiKey: apiKey
    });
};

run().catch((error) => {
    handleError(error);
});
