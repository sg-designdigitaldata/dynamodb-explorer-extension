"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrimaryKeyCache = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
/**
 * A singleton cache for table primary key names.
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
    set(tableName, keyName) {
        this.cache.set(tableName, keyName);
    }
    async populate(client, tableNames) {
        for (const tableName of tableNames) {
            try {
                const desc = await client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName }));
                const keySchema = desc.Table?.KeySchema;
                if (keySchema && keySchema.length > 0) {
                    this.cache.set(tableName, keySchema[0].AttributeName);
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