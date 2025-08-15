import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";

/**
 * A singleton cache for table primary key names.
 */
export class PrimaryKeyCache {
    private static instance: PrimaryKeyCache;
    private cache: Map<string, string> = new Map();

    private constructor() {}

    public static getInstance(): PrimaryKeyCache {
        if (!PrimaryKeyCache.instance) {
            PrimaryKeyCache.instance = new PrimaryKeyCache();
        }
        return PrimaryKeyCache.instance;
    }

    public get(tableName: string): string | undefined {
        return this.cache.get(tableName);
    }

    public set(tableName: string, keyName: string): void {
        this.cache.set(tableName, keyName);
    }

    public async populate(client: DynamoDBClient, tableNames: string[]): Promise<void> {
        for (const tableName of tableNames) {
            try {
                const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
                const keySchema = desc.Table?.KeySchema;
                if (keySchema && keySchema.length > 0) {
                    this.cache.set(tableName, keySchema[0].AttributeName!);
                }
            } catch (e) {
                // Optionally log or ignore
            }
        }
    }
}
