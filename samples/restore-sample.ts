import { FileProcessorService, JsonProcessorService } from '../lib/file-processor';
import { ImportService } from '../lib/import';
import { FileService } from '../lib/node';

const run = async () => {
    const zipService = new FileProcessorService();
    const fileService = new FileService();

    const importService = new ImportService({
        // be careful when filtering data to import because you might break data consistency.
        // for example, it might not be possible to import language variant without first importing content item and so on.
        canImport: {
            asset: (item) => {
                if (item.filename.startsWith('_corporate')) {
                    // asset will be imported only if the title starts with "_corporate"
                    return true;
                }
                // otherwise asset will NOT be imported
                return false;
            },

            contentItem: (item) => true // all content items will be imported
        },
        environmentId: 'targetenvironmentId',
        apiKey: 'targetenvironmentId',
        skipFailedItems: false
    });

    // read file
    const file = await fileService.loadFileAsync('fileName');

    // extract file
    const data = await zipService.extractZipAsync(file, await importService.getImportContentTypesAsync(), {
        formatService: new JsonProcessorService() // or 'CsvProcessorService' or custom service
    });

    // restore into target environment
    await importService.importFromSourceAsync(data);
};

run();