import { ImportToolkit } from '../lib/toolkit/index.js';
import { getDefaultLog } from '../lib/core/index.js';

const run = async () => {
    const importToolkit = new ImportToolkit({
        sourceType: 'file',
        log: getDefaultLog(),
        environmentId: '<id>',
        managementApiKey: '<mapiKey>',
        skipFailedItems: false,
        // be careful when filtering data to import because you might break data consistency.
        // for example, it might not be possible to import language variant without first importing content item and so on.
        canImport: {
            asset: (item) => true, // all assets will be imported
            contentItem: (item) => true // all content items will be imported,
        }
    });

    await importToolkit.importFromFilesAsync({
        items: {
            filename: 'items-export.json',
            formatService: 'json'
        }
    });
};

run();
