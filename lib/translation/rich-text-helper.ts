import { Log } from '../core/log-helper.js';

export function getRichTextHelper(log: Log): RichTextHelper {
    return new RichTextHelper(log);
}

export class RichTextHelper {
    public readonly linkCodenameAttributeName: string = 'data-manager-link-codename' as const;
    public readonly dataNewWindowAttributeName: string = 'data-new-window' as const;
    public readonly rteRegexes = {
        objectRegex: new RegExp(`<object(.+?)</object>`, 'g'),
        dataCodenameRegex: new RegExp(`data-codename=\\"(.+?)\\"`),

        linkRegex: new RegExp(`<a(.+?)</a>`, 'g'),
        csvmLinkCodenameRegex: new RegExp(`${this.linkCodenameAttributeName}=\\"(.+?)\\"`)
    } as const;

    constructor(log: Log) {}

    extractAllIdsFromManagementRte(richTextHtml: string | undefined): string[] {
        if (!richTextHtml) {
            return [];
        }

        const codenames: string[] = [];

        return codenames;
    }

    extractAllCodenamesFromDeliveryRte(richTextHtml: string | undefined): string[] {
        if (!richTextHtml) {
            return [];
        }

        const codenames: string[] = [];

        richTextHtml.replaceAll(this.rteRegexes.objectRegex, (objectTag) => {
            if (objectTag.includes('type="application/kenticocloud"') && objectTag.includes('data-type="item"')) {
                const codenameMatch = objectTag.match(this.rteRegexes.dataCodenameRegex);
                if (codenameMatch && (codenameMatch?.length ?? 0) >= 2) {
                    const codename = codenameMatch[1];

                    if (objectTag.includes('data-rel="component"')) {
                        // skip component items
                    } else {
                        if (!codenames.find((m) => m === codename)) {
                            codenames.push(codename);
                        }
                    }
                }
            }

            return objectTag;
        });

        richTextHtml.replaceAll(this.rteRegexes.linkRegex, (linkTag) => {
            const codenameMatch = linkTag.match(this.rteRegexes.csvmLinkCodenameRegex);
            if (codenameMatch && (codenameMatch?.length ?? 0) >= 2) {
                const codename = codenameMatch[1];

                if (!codenames.find((m) => m === codename)) {
                    codenames.push(codename);
                }
            }

            return linkTag;
        });

        return codenames;
    }
}