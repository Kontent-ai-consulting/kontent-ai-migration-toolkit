import { IMigrationAsset } from '../../core/index.js';
import { AssetsParseData, AssetsTransformData, FileBinaryData } from '../file-processor.models.js';
import { BaseAssetProcessorService } from '../base-asset-processor.service.js';

type AssetRecord = Omit<IMigrationAsset, 'binaryData'>;

export class AssetJsonProcessorService extends BaseAssetProcessorService {
    public readonly name: string = 'json';
    private readonly assetsFilename: string = 'assets.json';

    async transformAssetsAsync(data: AssetsTransformData): Promise<FileBinaryData> {
        const assetRecords: AssetRecord[] = [];

        for (const exportAsset of data.assets) {
            assetRecords.push({
                assetId: exportAsset.assetId,
                assetExternalId: exportAsset.assetExternalId,
                _zipFilename: exportAsset._zipFilename,
                filename: exportAsset.filename,
                title: exportAsset.title,
                codename: exportAsset.codename
            });

            await data.zip.addFile(exportAsset.filename, exportAsset.binaryData);
        }

        data.zip.addFile(this.assetsFilename, JSON.stringify(assetRecords));

        return await data.zip.generateZipAsync();
    }
    async parseAssetsAsync(data: AssetsParseData): Promise<IMigrationAsset[]> {
        const text = await data.zip.getFileContentAsync(this.assetsFilename);

        if (!text) {
            return [];
        }

        const assetRecords: AssetRecord[] = JSON.parse(text);
        const parsedAssets: IMigrationAsset[] = [];

        for (const assetRecord of assetRecords) {
            parsedAssets.push({
                ...assetRecord,
                binaryData: await data.zip.getBinaryDataAsync(assetRecord.filename)
            });
        }

        return parsedAssets;
    }
}
