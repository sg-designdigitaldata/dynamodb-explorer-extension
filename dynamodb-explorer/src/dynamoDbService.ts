// This service abstracts all the AWS SDK calls to DynamoDB using v3.
// You'll need to run `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb` to get these dependencies.
import { DynamoDBClient, ListTablesCommand, CreateTableCommand, DeleteTableCommand, CreateTableInput, KeySchemaElement, DeleteItemCommandInput, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import * as vscode from 'vscode';
import { DeleteCommand, DeleteCommandInput, DynamoDBDocumentClient, PutCommand, PutCommandInput, ScanCommand, ScanCommandInput, ScanCommandOutput } from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';


export class DynamoDbService {
    private client: DynamoDBClient;
    private docClient: DynamoDBDocumentClient;

    constructor() {
        // Read endpoint from VS Code settings
        const config = vscode.workspace.getConfiguration();
        const endpoint = config.get<string>('dynamodbExplorer.endpoint', 'http://localhost:8000');
        const clientOptions: any = {
            region: 'us-east-1',
            credentials: {
                accessKeyId: 'dummy',
                secretAccessKey: 'dummy',
            },
            requestHandler: new NodeHttpHandler({
                connectionTimeout: 3000,
                requestTimeout: 3000
            })
        };
        if (endpoint && endpoint.trim() !== '') {
            clientOptions.endpoint = endpoint;
        }
        this.client = new DynamoDBClient(clientOptions);
        this.docClient = DynamoDBDocumentClient.from(this.client);
    }

    /**
     * Lists all tables in the local DynamoDB instance.
     * @returns A promise that resolves to an array of table names.
     */
    async listTables(): Promise<string[]> {
        try {
            const command = new ListTablesCommand({});
            const data = await this.client.send(command);
            return data.TableNames || [];
        } catch (error) {
            console.error('Error listing tables:', error);
            throw error;
        }
    }

    /**
     * Creates a new table. This is a very basic example.
     * @param tableName The name of the table to create.
     * @param keySchema The key schema for the table.
     */
    async createTable(tableName: string, keySchema: KeySchemaElement[]): Promise<void> {
        try {
            const params: CreateTableInput = {
                TableName: tableName,
                KeySchema: keySchema,
                AttributeDefinitions: [
                    { AttributeName: keySchema[0].AttributeName!, AttributeType: 'S' }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5,
                }
            };
            const command = new CreateTableCommand(params);
            await this.client.send(command);
            console.log(`Table '${tableName}' created successfully.`);
        } catch (error) {
            console.error(`Error creating table '${tableName}':`, error);
            throw error;
        }
    }

    /**
     * Deletes a table by name.
     * @param tableName The name of the table to delete.
     */
    async deleteTable(tableName: string): Promise<void> {
        try {
            const command = new DeleteTableCommand({ TableName: tableName });
            await this.client.send(command);
            console.log(`Table '${tableName}' deleted successfully.`);
        } catch (error) {
            console.error(`Error deleting table '${tableName}':`, error);
            throw error;
        }
    }

    /**
     * Deletes an item from a table by its key.
     * @param tableName The name of the table.
     * @param itemKey The key of the item to delete (e.g., { id: '123' }).
     */
    async deleteItem(tableName: string, itemKey: { [key: string]: any }): Promise<void> {
        try {            
            const params: DeleteCommandInput = {
                TableName: tableName,
                Key: itemKey
            };

            // Use the DocumentClient's DeleteCommand for easier key handling.
            const command = new DeleteCommand(params);

            await this.docClient.send(command);
            console.log(`Item deleted from table '${tableName}' successfully.`);
        } catch (error) {
            console.error(`Error deleting item from table '${tableName}':`, error);
            throw error;
        }
    }

    /**
     * Scans a table to get all items.
     * @param tableName The name of the table to scan.
     * @returns A promise that resolves to the items in the table.
     */
    async scanTable(tableName: string): Promise<any[] | undefined> {
        try {
            const params: ScanCommandInput = {
                TableName: tableName,
            };
            const command = new ScanCommand(params);
            const data: ScanCommandOutput = await this.docClient.send(command);
            return data.Items;
        } catch (error) {
            console.error(`Error scanning table '${tableName}':`, error);
            throw error;
        }
    }

    /**
     * Adds a new item to a table.
     * @param tableName The name of the table to add the item to.
     * @param item The JSON object representing the item.
     */
    async putItem(tableName: string, item: any): Promise<void> {
        try {
            const params: PutCommandInput = {
                TableName: tableName,
                Item: item
            };
            const command = new PutCommand(params);
            await this.docClient.send(command);
            console.log(`Item added to table '${tableName}' successfully.`);
        } catch (error) {
            console.error(`Error adding item to table '${tableName}':`, error);
            throw error;
        }
    }
}