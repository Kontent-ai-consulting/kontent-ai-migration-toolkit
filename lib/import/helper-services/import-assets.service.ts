import { AssetModels, ManagementClient } from '@kontent-ai/management-sdk';
import { IMigrationAsset, Log, logSpinner, processInChunksAsync } from '../../core/index.js';
import mime from 'mime';
import chalk from 'chalk';
import { IImportContext } from '../import.models.js';

export function getImportAssetsService(log: Log, managementClient: ManagementClient): ImportAssetsService {
    return new ImportAssetsService(log, managementClient);
}

export class ImportAssetsService {
    private readonly importAssetsChunkSize: number = 1;

    constructor(private readonly log: Log, private readonly managementClient: ManagementClient) {}

    async importAssetsAsync(data: { assets: IMigrationAsset[]; importContext: IImportContext }): Promise<void> {
        this.log.logger({
            type: 'info',
            message: `Categorizing '${chalk.yellow(data.assets.length.toString())}' assets`
        });
        const assetsToUpload = this.getAssetsToUpload({
            assets: data.assets,
            managementClient: this.managementClient,
            importContext: data.importContext
        });

        const skippedAssetsCount = data.assets.length - assetsToUpload.length;

        if (skippedAssetsCount) {
            this.log.logger({
                type: 'skip',
                message: `Skipping upload for '${chalk.yellow(
                    skippedAssetsCount.toString()
                )}' assets as they already exist`
            });
        }

        this.log.logger({
            type: 'upload',
            message: `Uploading '${chalk.yellow(assetsToUpload.length.toString())}' assets`
        });

        await processInChunksAsync<IMigrationAsset, void>({
            log: this.log,
            type: 'asset',
            chunkSize: this.importAssetsChunkSize,
            items: assetsToUpload,
            itemInfo: (input) => {
                return {
                    itemType: 'asset',
                    title: input.title
                };
            },
            processFunc: async (asset) => {
                // only import asset if it didn't exist
                logSpinner(
                    {
                        type: 'upload',
                        message: asset.title
                    },
                    this.log
                );
                const uploadedBinaryFile = await this.managementClient
                    .uploadBinaryFile()
                    .withData({
                        binaryData: asset.binaryData,
                        contentType: mime.getType(asset.filename) ?? '',
                        filename: asset.filename
                    })
                    .toPromise();

                logSpinner(
                    {
                        type: 'create',
                        message: asset.title
                    },
                    this.log
                );

                await this.managementClient
                    .addAsset()
                    .withData((builder) => {
                        const data: AssetModels.IAddAssetRequestData = {
                            file_reference: {
                                id: uploadedBinaryFile.data.id,
                                type: 'internal'
                            },
                            codename: asset.codename,
                            title: asset.title,
                            external_id: asset.externalId,
                            collection: asset.collection
                                ? {
                                      reference: {
                                          codename: asset.collection.codename
                                      }
                                  }
                                : undefined,
                            descriptions: asset.descriptions
                                ? asset.descriptions.map((m) => {
                                      const assetDescription: AssetModels.IAssetFileDescription = {
                                          description: m.description ?? '',
                                          language: {
                                              codename: m.language.codename
                                          }
                                      };

                                      return assetDescription;
                                  })
                                : []
                        };
                        return data;
                    })
                    .toPromise();
            }
        });
    }

    private getAssetsToUpload(data: {
        assets: IMigrationAsset[];
        managementClient: ManagementClient;
        importContext: IImportContext;
    }): IMigrationAsset[] {
        return data.assets.filter((asset) => {
            return data.importContext.getAssetStateInTargetEnvironment(asset.codename).state === 'doesNotExists';
        });
    }
}
