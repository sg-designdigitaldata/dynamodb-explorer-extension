"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrimaryKeyCache = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
/**
 * A singleton cache for table primary key schema.
 */
class PrimaryKeyCache {
    static instance;
    cache = new Map();
    constructor() { }
    static getInstance() {
        if (!PrimaryKeyCache.instance) {
            PrimaryKeyCache.instance = new PrimaryKeyCache();
        }
        return PrimaryKeyCache.instance;
    }
    get(tableName) {
        return this.cache.get(tableName);
    }
    set(tableName, keySchema) {
        this.cache.set(tableName, keySchema);
    }
    async populate(client, tableNames) {
        for (const tableName of tableNames) {
            try {
                const desc = await client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName }));
                const keySchema = desc.Table?.KeySchema;
                if (keySchema && keySchema.length > 0) {
                    const partitionKey = keySchema.find(k => k.KeyType === 'HASH')?.AttributeName;
                    const sortKey = keySchema.find(k => k.KeyType === 'RANGE')?.AttributeName;
                    if (partitionKey) {
                        this.cache.set(tableName, { partitionKey, sortKey });
                    }
                }
            }
            catch (e) {
                // Optionally log or ignore
            }
        }
    }
}
exports.PrimaryKeyCache = PrimaryKeyCache;
//# sourceMappingURL=primaryKeyCache.js.map