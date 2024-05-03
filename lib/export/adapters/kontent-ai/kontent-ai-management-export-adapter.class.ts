import { HttpService } from '@kontent-ai/core-sdk';
import {
    IExportAdapter,
    IExportAdapterResult,
    IKontentAiManagementExportAdapterConfig,
    IKontentAiPreparedExportItem,
    throwErrorForItemRequest
} from '../../export.models.js';
import colors from 'colors';
import { AssetModels, ManagementClient, SharedModels } from '@kontent-ai/management-sdk';
import {
    defaultRetryStrategy,
    IMigrationAsset,
    IMigrationElement,
    IMigrationItem,
    defaultHttpService,
    IExportContext,
    IFlattenedContentTypeElement,
    extractErrorData,
    processInChunksAsync
} from '../../../core/index.js';
import { ExportContextHelper, getExportContextHelper } from './helpers/export-context-helper.js';
import { exportTransforms } from 'lib/translation/index.js';

export class KontentAiManagementExportAdapter implements IExportAdapter {
    private readonly httpService: HttpService = new HttpService();
    public readonly name: string = 'kontentAi';
    private readonly managementClient: ManagementClient;
    private readonly exportContextHelper: ExportContextHelper;

    constructor(private config: IKontentAiManagementExportAdapterConfig) {
        this.managementClient = this.getManagementClient(config);
        this.exportContextHelper = getExportContextHelper(this.config.log, this.managementClient);
    }

    async exportAsync(): Promise<IExportAdapterResult> {
        const sourceEnvironment = (
            await new ManagementClient({
                apiKey: this.config.managementApiKey,
                environmentId: this.config.environmentId
            })
                .environmentInformation()
                .toPromise()
        ).data.project;

        this.config.log.console({
            type: 'info',
            message: `Preparing export from environment ${colors.yellow(
                sourceEnvironment.environment
            )} in project ${colors.cyan(sourceEnvironment.name)}`
        });

        const exportContext = await this.exportContextHelper.getExportContextAsync({
            exportItems: this.config.exportItems
        });

        return {
            items: await this.mapPreparedItemToMigrationItemsAsync(exportContext),
            assets: await this.exportAssetsAsync(exportContext)
        };
    }

    private async mapPreparedItemToMigrationItemsAsync(context: IExportContext): Promise<IMigrationItem[]> {
        const migrationItems: IMigrationItem[] = [];

        for (const preparedItem of context.preparedExportItems) {
            migrationItems.push({
                system: {
                    codename: preparedItem.contentItem.codename,
                    collection: preparedItem.collection.codename,
                    language: preparedItem.language.codename,
                    name: preparedItem.contentItem.name,
                    type: preparedItem.contentType.contentTypeCodename,
                    workflow: preparedItem.workflow.codename,
                    workflow_step: preparedItem.workflowStepCodename
                },
                elements: this.getMigrationElements(preparedItem, context)
            });
        }

        return migrationItems;
    }

    private getMigrationElements(
        exportItem: IKontentAiPreparedExportItem,
        context: IExportContext
    ): IMigrationElement[] {
        const migrationElements: IMigrationElement[] = [];

        for (const typeElement of exportItem.contentType.elements) {
            const languageElement = exportItem.languageVariant.elements.find((m) => m.element.id === typeElement.id);

            if (!languageElement) {
                throwErrorForItemRequest(
                    exportItem.requestItem,
                    `Could not find element '${typeElement.codename}' in language variant'`
                );
            }

            migrationElements.push({
                codename: typeElement.codename,
                type: typeElement.type,
                value: this.getValueToStoreFromElement({
                    context: context,
                    exportItem: exportItem,
                    value: languageElement.value,
                    typeElement: typeElement
                })
            });
        }

        return migrationElements;
    }

    private getValueToStoreFromElement(data: {
        exportItem: IKontentAiPreparedExportItem;
        typeElement: IFlattenedContentTypeElement;
        value: string | number | SharedModels.ReferenceObject[] | undefined;
        context: IExportContext;
    }): string | undefined | string[] {
        try {
            return exportTransforms[data.typeElement.type](data);
        } catch (error) {
            const errorData = extractErrorData(error);
            let jsonValue = 'n/a';

            try {
                jsonValue = JSON.stringify(data.value);
            } catch (jsonError) {
                console.error(`Failed to convert json value`, jsonError);
            }

            throwErrorForItemRequest(
                data.exportItem.requestItem,
                `Failed to map value of element '${colors.yellow(data.typeElement.codename)}' of type '${colors.cyan(
                    data.typeElement.type
                )}'. Value: ${colors.bgMagenta(jsonValue)}. Message: ${errorData.message}`
            );
        }
    }

    private async exportAssetsAsync(context: IExportContext): Promise<IMigrationAsset[]> {
        const assets: AssetModels.Asset[] = [];

        for (const assetId of context.referencedData.assetIds) {
            const assetState = context.getAssetStateInSourceEnvironment(assetId);

            if (assetState.asset) {
                assets.push(assetState.asset);
            }
        }

        return await this.getMigrationAssetsWithBinaryDataAsync(assets);
    }

    private getManagementClient(config: IKontentAiManagementExportAdapterConfig): ManagementClient {
        const retryStrategy = config.retryStrategy ?? defaultRetryStrategy;

        return new ManagementClient({
            environmentId: config.environmentId,
            retryStrategy: retryStrategy,
            httpService: defaultHttpService,
            apiKey: config.managementApiKey
        });
    }

    private async getMigrationAssetsWithBinaryDataAsync(assets: AssetModels.Asset[]): Promise<IMigrationAsset[]> {
        this.config.log.console({
            type: 'info',
            message: `Preparing to download '${colors.yellow(assets.length.toString())}' assets`
        });

        const exportedAssets: IMigrationAsset[] = await processInChunksAsync<AssetModels.Asset, IMigrationAsset>({
            log: this.config.log,
            type: 'asset',
            chunkSize: 5,
            itemInfo: (input) => {
                return {
                    title: input.codename,
                    itemType: 'asset'
                };
            },
            items: assets,
            processFunc: async (asset) => {
                const migrationAsset: IMigrationAsset = {
                    _zipFilename: asset.codename,
                    filename: asset.fileName,
                    title: asset.title ?? '',
                    assetExternalId: asset.externalId,
                    codename: asset.codename,
                    binaryData: (await this.getBinaryDataFromUrlAsync(asset.url)).data
                };

                return migrationAsset;
            }
        });

        return exportedAssets;
    }

    private async getBinaryDataFromUrlAsync(url: string): Promise<{ data: any; contentLength: number }> {
        // temp fix for Kontent.ai Repository not validating url
        url = url.replace('#', '%23');

        const response = await this.httpService.getAsync(
            {
                url
            },
            {
                responseType: 'arraybuffer',
                retryStrategy: defaultRetryStrategy
            }
        );

        const contentLengthHeader = response.headers.find((m) => m.header.toLowerCase() === 'content-length');
        const contentLength = contentLengthHeader ? +contentLengthHeader.value : 0;

        return { data: response.data, contentLength: contentLength };
    }
}