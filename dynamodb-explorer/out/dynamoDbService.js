"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDbService = void 0;
// This service abstracts all the AWS SDK calls to DynamoDB using v3.
// You'll need to run `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb` to get these dependencies.
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const vscode = __importStar(require("vscode"));
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const node_http_handler_1 = require("@aws-sdk/node-http-handler");
class DynamoDbService {
    client;
    docClient;
    constructor() {
        // Read endpoint from VS Code settings
        const config = vscode.workspace.getConfiguration();
        const endpoint = config.get('dynamodbExplorer.endpoint', 'http://localstack:4566');
        const clientOptions = {
            region: 'us-east-1',
            credentials: {
                accessKeyId: 'dummy',
                secretAccessKey: 'dummy',
            },
            requestHandler: new node_http_handler_1.NodeHttpHandler({
                connectionTimeout: 3000,
                requestTimeout: 3000
            })
        };
        if (endpoint && endpoint.trim() !== '') {
            clientOptions.endpoint = endpoint;
        }
        this.client = new client_dynamodb_1.DynamoDBClient(clientOptions);
        this.docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(this.client);
    }
    /**
     * Lists all tables in the local DynamoDB instance.
     * @returns A promise that resolves to an array of table names.
     */
    async listTables() {
        try {
            const command = new client_dynamodb_1.ListTablesCommand({});
            const data = await this.client.send(command);
            return data.TableNames || [];
        }
        catch (error) {
            console.error('Error listing tables:', error);
            throw error;
        }
    }
    /**
     * Creates a new table. This is a very basic example.
     * @param tableName The name of the table to create.
     * @param keySchema The key schema for the table.
     */
    async createTable(tableName, keySchema) {
        try {
            const params = {
                TableName: tableName,
                KeySchema: keySchema,
                AttributeDefinitions: [
                    { AttributeName: keySchema[0].AttributeName, AttributeType: 'S' }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5,
                }
            };
            const command = new client_dynamodb_1.CreateTableCommand(params);
            await this.client.send(command);
            console.log(`Table '${tableName}' created successfully.`);
        }
        catch (error) {
            console.error(`Error creating table '${tableName}':`, error);
            throw error;
        }
    }
    /**
     * Deletes a table by name.
     * @param tableName The name of the table to delete.
     */
    async deleteTable(tableName) {
        try {
            const command = new client_dynamodb_1.DeleteTableCommand({ TableName: tableName });
            await this.client.send(command);
            console.log(`Table '${tableName}' deleted successfully.`);
        }
        catch (error) {
            console.error(`Error deleting table '${tableName}':`, error);
            throw error;
        }
    }
    /**
     * Deletes an item from a table by its key.
     * @param tableName The name of the table.
     * @param itemKey The key of the item to delete (e.g., { id: '123' }).
     */
    async deleteItem(tableName, itemKey) {
        try {
            const params = {
                TableName: tableName,
                Key: itemKey
            };
            // Use the DocumentClient's DeleteCommand for easier key handling.
            const command = new lib_dynamodb_1.DeleteCommand(params);
            await this.docClient.send(command);
            console.log(`Item deleted from table '${tableName}' successfully.`);
        }
        catch (error) {
            console.error(`Error deleting item from table '${tableName}':`, error);
            throw error;
        }
    }
    /**
     * Scans a table to get all items.
     * @param tableName The name of the table to scan.
     * @returns A promise that resolves to the items in the table.
     */
    async scanTable(tableName) {
        try {
            const params = {
                TableName: tableName,
            };
            const command = new lib_dynamodb_1.ScanCommand(params);
            const data = await this.docClient.send(command);
            return data.Items;
        }
        catch (error) {
            console.error(`Error scanning table '${tableName}':`, error);
            throw error;
        }
    }
    /**
     * Adds a new item to a table.
     * @param tableName The name of the table to add the item to.
     * @param item The JSON object representing the item.
     */
    async putItem(tableName, item) {
        try {
            const params = {
                TableName: tableName,
                Item: item
            };
            const command = new lib_dynamodb_1.PutCommand(params);
            await this.docClient.send(command);
            console.log(`Item added to table '${tableName}' successfully.`);
        }
        catch (error) {
            console.error(`Error adding item to table '${tableName}':`, error);
            throw error;
        }
    }
}
exports.DynamoDbService = DynamoDbService;
//# sourceMappingURL=dynamoDbService.js.map