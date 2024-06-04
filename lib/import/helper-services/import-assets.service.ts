import { AssetModels, ManagementClient } from '@kontent-ai/management-sdk';
import { IMigrationAsset, Log, is404Error, logSpinner, processInChunksAsync } from '../../core/index.js';
import mime from 'mime';
import chalk from 'chalk';
import { IImportContext } from '../import.models.js';

export function getImportAssetsService(log: Log, managementClient: ManagementClient): ImportAssetsService {
    return new ImportAssetsService(log, managementClient);
}

export class ImportAssetsService {
    private readonly importAssetsChunkSize: number = 1;
    private readonly fetchAssetsChunkSize: number = 1;

    constructor(private readonly log: Log, private readonly managementClient: ManagementClient) {}

    async importAssetsAsync(data: { assets: IMigrationAsset[]; importContext: IImportContext }): Promise<void> {
        this.log.logger({
            type: 'info',
            message: `Categorizing '${chalk.yellow(data.assets.length.toString())}' assets`
        });
        const filteredAssets = await this.getAssetsToUploadAsync({
            assets: data.assets,
            managementClient: this.managementClient
        });

        if (filteredAssets.existingAssets.length) {
            this.log.logger({
                type: 'skip',
                message: `Skipping upload for '${chalk.yellow(
                    filteredAssets.existingAssets.length.toString()
                )}' assets as they already exist`
            });
        }

        this.log.logger({
            type: 'upload',
            message: `Uploading '${chalk.yellow(filteredAssets.assetsToUpload.length.toString())}' assets`
        });

        await processInChunksAsync<IMigrationAsset, void>({
            log: this.log,
            type: 'asset',
            chunkSize: this.importAssetsChunkSize,
            items: filteredAssets.assetsToUpload,
            itemInfo: (input) => {
                return {
                    itemType: 'asset',
                    title: input.title
                };
            },
            processFunc: async (asset) => {
                // only import asset if it didn't exist
                logSpinner({
                    type: 'upload',
                    message: asset.title
                }, this.log);

                const uploadedBinaryFile = await this.managementClient
                    .uploadBinaryFile()
                    .withData({
                        binaryData: asset.binaryData,
                        contentType: mime.getType(asset.filename) ?? '',
                        filename: asset.filename
                    })
                    .toPromise();

                logSpinner({
                    type: 'create',
                    message: asset.title
                }, this.log);

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
                    .toPromise()
                    .then((m) => m.data);
            }
        });
    }

    private async getAssetsToUploadAsync(data: {
        assets: IMigrationAsset[];
        managementClient: ManagementClient;
    }): Promise<{
        assetsToUpload: IMigrationAsset[];
        existingAssets: {
            original: IMigrationAsset;
            imported: AssetModels.Asset;
        }[];
    }> {
        const assetsToUpload: IMigrationAsset[] = [];
        const existingAssets: {
            original: IMigrationAsset;
            imported: AssetModels.Asset;
        }[] = [];

        await processInChunksAsync<IMigrationAsset, void>({
            log: this.log,
            type: 'asset',
            chunkSize: this.fetchAssetsChunkSize,
            items: data.assets,
            itemInfo: (input) => {
                return {
                    itemType: 'asset',
                    title: input.title
                };
            },
            processFunc: async (asset) => {
                // check if asset with given codename already exists
                let existingAsset: AssetModels.Asset | undefined;

                try {
                    existingAsset = await data.managementClient
                        .viewAsset()
                        .byAssetCodename(asset.codename)
                        .toPromise()
                        .then((m) => m.data);
                } catch (error) {
                    if (!is404Error(error)) {
                        throw error;
                    }
                }

                if (asset.externalId) {
                    try {
                        // check if asset with given external id was already created
                        existingAsset = await data.managementClient
                            .viewAsset()
                            .byAssetExternalId(asset.externalId)
                            .toPromise()
                            .then((m) => m.data);
                    } catch (error) {
                        if (!is404Error(error)) {
                            throw error;
                        }
                    }
                }

                if (!existingAsset) {
                    // only import asset if it didn't exist
                    assetsToUpload.push(asset);
                } else {
                    existingAssets.push({
                        imported: existingAsset,
                        original: asset
                    });
                }
            }
        });

        return {
            assetsToUpload: assetsToUpload,
            existingAssets: existingAssets
        };
    }
}
