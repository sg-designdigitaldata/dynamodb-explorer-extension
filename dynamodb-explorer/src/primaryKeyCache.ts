import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";

export interface TablePrimaryKeySchema {
    partitionKey: string;
    sortKey?: string;
}

/**
 * A singleton cache for table primary key schema.
 */
export class PrimaryKeyCache {
    private static instance: PrimaryKeyCache;
    private cache: Map<string, TablePrimaryKeySchema> = new Map();

    private constructor() {}

    public static getInstance(): PrimaryKeyCache {
        if (!PrimaryKeyCache.instance) {
            PrimaryKeyCache.instance = new PrimaryKeyCache();
        }
        return PrimaryKeyCache.instance;
    }

    public get(tableName: string): TablePrimaryKeySchema | undefined {
        return this.cache.get(tableName);
    }

    public set(tableName: string, keySchema: TablePrimaryKeySchema): void {
        this.cache.set(tableName, keySchema);
    }

    public async populate(client: DynamoDBClient, tableNames: string[]): Promise<void> {
        for (const tableName of tableNames) {
            try {
                const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
                const keySchema = desc.Table?.KeySchema;
                if (keySchema && keySchema.length > 0) {
                    const partitionKey = keySchema.find(k => k.KeyType === 'HASH')?.AttributeName;
                    const sortKey = keySchema.find(k => k.KeyType === 'RANGE')?.AttributeName;
                    if (partitionKey) {
                        this.cache.set(tableName, { partitionKey, sortKey });
                    }
                }
            } catch (e) {
                // Optionally log or ignore
            }
        }
    }
}
