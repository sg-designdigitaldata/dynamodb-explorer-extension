// This is the main entry point for your extension.
import * as vscode from 'vscode';
import { DynamoDbTreeProvider, TableItem } from './treeProvider';
import { KeySchemaElement } from '@aws-sdk/client-dynamodb';
import { DynamoDbService } from './dynamoDbService';
import { PrimaryKeyCache } from './primaryKeyCache';
// Global primary key cache
const primaryKeyCache = PrimaryKeyCache.getInstance();

// A map to store the webview panels for each table, allowing us to reuse them.
const addItemPanels = new Map<string, vscode.WebviewPanel>();

// A new map to store the content of the add item form for each table.
const formContent = new Map<string, string>();

export function activate(context: vscode.ExtensionContext) {
    // On extension init, populate the primary key cache for all tables
    const dynamoDbService = new DynamoDbService();
    (async () => {
        const tableNames = await dynamoDbService.listTables();
        await primaryKeyCache.populate(dynamoDbService['client'], tableNames);
    })();
    const dynamoDbTreeProvider = new DynamoDbTreeProvider(dynamoDbService);
    console.log('Congratulations, your extension "dynamodb-explorer" is now active!');

    // Register the Tree View for the sidebar.
    vscode.window.registerTreeDataProvider('dynamoDbExplorerTables', dynamoDbTreeProvider);

    // Listen for changes to endpoint or region setting and apply without requiring window reload.
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration('dynamodbExplorer.endpoint') || e.affectsConfiguration('dynamodbExplorer.region')) {
                try {
                    dynamoDbService.refreshClient();
                    // Re-populate primary key cache based on tables in the new client config
                    const tableNames = await dynamoDbService.listTables();
                    await primaryKeyCache.populate(dynamoDbService['client'], tableNames);
                    dynamoDbTreeProvider.refresh();
                    vscode.window.showInformationMessage('DynamoDB endpoint/region settings updated successfully.');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to apply DynamoDB settings: ${error}`);
                }
            }
        })
    );

    // Register commands for buttons and context menus.
    context.subscriptions.push(
        // Command to refresh the table list.
        vscode.commands.registerCommand('dynamodb-explorer.refreshTables', () => dynamoDbTreeProvider.refresh()),

        // Command to create a new table.
        vscode.commands.registerCommand('dynamodb-explorer.createTable', async () => {
            const tableName = await vscode.window.showInputBox({ prompt: 'Enter new table name' });
            if (!tableName) { return; }

            const partitionKey = await vscode.window.showInputBox({ prompt: 'Enter partition key name (e.g., id)' });
            if (!partitionKey) { return; }

            const sortKey = await vscode.window.showInputBox({ prompt: 'Enter sort key name (optional, press Escape/Cancel to skip)' });

            const keySchema: KeySchemaElement[] = [{ AttributeName: partitionKey.trim(), KeyType: 'HASH' } as KeySchemaElement];
            if (sortKey && sortKey.trim() !== '') {
                keySchema.push({ AttributeName: sortKey.trim(), KeyType: 'RANGE' } as KeySchemaElement);
            }

            try {
                await dynamoDbService.createTable(tableName, keySchema);
                // Add to primary key cache
                primaryKeyCache.set(tableName, { partitionKey: partitionKey.trim(), sortKey: sortKey && sortKey.trim() ? sortKey.trim() : undefined });
                vscode.window.showInformationMessage(`Table '${tableName}' created successfully!`);
                dynamoDbTreeProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create table: ${error}`);
            }
        }),

        // Command to delete a table from the context menu.
        vscode.commands.registerCommand('dynamodb-explorer.deleteTable', async (tableItem: TableItem) => {
            const confirmation = await vscode.window.showInformationMessage(
                `Are you sure you want to delete the table '${tableItem.tableName}'?`,
                { modal: true },
                'Yes'
            );
            if (confirmation === 'Yes') {
                try {
                    await dynamoDbService.deleteTable(tableItem.tableName);
                    vscode.window.showInformationMessage(`Table '${tableItem.tableName}' deleted successfully.`);
                    dynamoDbTreeProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to delete table: ${error}`);
                }
            }
        }),

        // Command to view table contents in a new editor panel.
        vscode.commands.registerCommand('dynamodb-explorer.viewTableContents', async (tableItem: TableItem) =>  {
            const panel = vscode.window.createWebviewPanel(
                'tableContent',
                `Contents of ${tableItem.tableName}`,
                vscode.ViewColumn.One,
                { enableScripts: true } // Enable scripts for the delete button.
            );

            // Handle messages from the webview.
            panel.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'deleteItem':
                        // The message should contain the tableName and the item's key.
                        if (message.tableName && message.itemKey) {                            
                            const confirmation = await vscode.window.showInformationMessage(
                                `Are you sure you want to delete this item?`,
                                { modal: true },
                                'Yes'
                            );

                            if (confirmation === 'Yes') {
                                try {
                                    await dynamoDbService.deleteItem(message.tableName, message.itemKey);
                                    vscode.window.showInformationMessage(`Item deleted from table '${message.tableName}' successfully.`);
                                    // Refresh the webview to show the updated table.
                                    const items = await dynamoDbService.scanTable(message.tableName);
                                    panel.webview.html = getWebviewContent(message.tableName, items);
                                    dynamoDbTreeProvider.refresh();
                                } catch (error) {
                                    vscode.window.showErrorMessage(`Failed to delete item: ${error}`);
                                }
                            }             
                        break;
                        }        
                    case 'refreshTable':
                        try {
                            const items = await dynamoDbService.scanTable(tableItem.tableName);
                            panel.webview.html = getWebviewContent(tableItem.tableName, items);
                        } catch (error) {
                            panel.webview.html = `<h1>Error</h1><p>Failed to reload table contents: ${error}</p>`;
                        }
                        break;
                    }
                }, undefined, context.subscriptions);

            try {
                const items = await dynamoDbService.scanTable(tableItem.tableName);
                panel.webview.html = getWebviewContent(tableItem.tableName, items);
            } catch (error) {
                panel.webview.html = `<h1>Error</h1><p>Failed to load table contents: ${error}</p>`;
            }
        }),

        // Command to add an item to a table.
        vscode.commands.registerCommand('dynamodb-explorer.addItem', async (tableItem: TableItem) => {
            let panel = addItemPanels.get(tableItem.tableName);

            if (panel) {
                // If a panel exists, reveal it.
                panel.reveal(vscode.ViewColumn.One);
            } else {
                // If not, create a new one.
                panel = vscode.window.createWebviewPanel(
                    'addItemForm',
                    `Add Item to ${tableItem.tableName}`,
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );
                addItemPanels.set(tableItem.tableName, panel);

                // When the panel is disposed, remove it from our map and clear the saved content.
                panel.onDidDispose(() => {
                    addItemPanels.delete(tableItem.tableName);
                    formContent.delete(tableItem.tableName);
                }, null, context.subscriptions);
            }
            // Get the saved content for this table, or default value with required keys if empty.
            let currentContent = formContent.get(tableItem.tableName) || '';
            if (!currentContent.trim()) {
                currentContent = getDefaultItemContent(tableItem.tableName);
            }
            panel.webview.html = getAddItemWebviewContent(tableItem.tableName, currentContent);

            // Add an event listener to handle state changes (e.g., when the panel becomes active)
            panel.onDidChangeViewState(e => {
                if (e.webviewPanel.active) {
                    // When the webview becomes active, send the latest saved content to it.
                    const latestContent = formContent.get(tableItem.tableName) || '';
                    e.webviewPanel.webview.postMessage({
                        command: 'loadContent',
                        content: latestContent
                    });
                }
            }, null, context.subscriptions);

            // Handle messages from the webview.
            panel.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'saveItem':
                        try {
                            const item = JSON.parse(message.itemJson);
                            await dynamoDbService.putItem(tableItem.tableName, item);
                            vscode.window.showInformationMessage(`Item added to table '${tableItem.tableName}' successfully!`);
                            panel?.dispose();
                            dynamoDbTreeProvider.refresh();
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            vscode.window.showErrorMessage(`Failed to add item: ${errorMsg}`);
                            panel?.webview.postMessage({ command: 'addItemFailed', message: errorMsg });
                        }
                        break;
                    case 'updateContent':
                        // When the webview sends an update, save the content.
                        formContent.set(tableItem.tableName, message.content);
                        break;
                }
            }, undefined, context.subscriptions);
        })
    );
}

function getDefaultItemContent(tableName: string): string {
    const schema = primaryKeyCache.get(tableName);
    const template: any = {};

    if (schema?.partitionKey) {
        template[schema.partitionKey] = '';
    }
    if (schema?.sortKey) {
        template[schema.sortKey] = '';
    }

    // Fallback required field if no schema available.
    if (!schema?.partitionKey) {
        template.id = '';
    }

    return JSON.stringify(template, null, 2);
}

function getWebviewContent(tableName: string, items: any[] | undefined): string {
    let tableRows = '';
    let tableHeaders = '';

    if (items && items.length > 0) {
        // Compute the union of all keys across all items
        const allKeys: string[] = Array.from(
            items.reduce((keys, item) => {
                Object.keys(item).forEach(k => keys.add(k));
                return keys;
            }, new Set<string>())
        );

        const schema = primaryKeyCache.get(tableName);
        const partitionKey = schema?.partitionKey;
        const sortKey = schema?.sortKey;

        let orderedKeys: string[];
        if (partitionKey) {
            const otherKeys = allKeys
                .filter(k => k !== partitionKey && k !== sortKey)
                .sort((a, b) => a.localeCompare(b));
            orderedKeys = [partitionKey];
            if (sortKey) {
                orderedKeys.push(sortKey);
            }
            orderedKeys = orderedKeys.concat(otherKeys);
        } else {
            orderedKeys = [...allKeys].sort((a, b) => a.localeCompare(b));
        }

        tableHeaders = `
            <thead>
                <tr>
                    ${orderedKeys.map(key => `<th>${key}</th>`).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
        `;

        tableRows = items.map(item => {
            const itemKey: any = {};
            if (partitionKey && item[partitionKey] !== undefined) {
                itemKey[partitionKey] = item[partitionKey];
            }
            if (sortKey && item[sortKey] !== undefined) {
                itemKey[sortKey] = item[sortKey];
            }
            if (!partitionKey) {
                itemKey[orderedKeys[0]] = item[orderedKeys[0]];
            }

            const rowJson = JSON.stringify(item).replace(/'/g, "&#39;");
            const rowKeyJson = JSON.stringify(itemKey).replace(/'/g, "&#39;");

            return `
                <tr>
                    ${orderedKeys.map(key => `<td>${item[key] !== undefined ? JSON.stringify(item[key]) : ''}</td>`).join('')}
                    <td>
                        <button class="delete-item" data-key='${rowKeyJson}'>Delete</button>
                        <button class="copy-json-btn" data-rowjson='${rowJson}'>Copy JSON</button>
                    </td>
                </tr>
            `;
        }).join('');
    } else {
        tableHeaders = '<h2>No items found in this table.</h2>';
    }

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DynamoDB Table: ${tableName}</title>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
                th { background-color: #f2f2f2; }
                button { background-color: #f44336; color: white; border: none; padding: 5px 10px; cursor: pointer; }
                button:hover { background-color: #d32f2f; }
                #refresh-btn, .copy-json-btn { background-color: #2196f3; margin-bottom: 10px; }
                #refresh-btn:hover, .copy-json-btn:hover { background-color: #1976d2; }
            </style>
        </head>
        <body>
            <h1>Table: ${tableName}</h1>
            <button id="refresh-btn">Refresh</button>
            <table>
                ${tableHeaders}
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <script>
                const vscode = acquireVsCodeApi();

                function deleteItem(tableName, itemKey) {
                    vscode.postMessage({
                        command: 'deleteItem',
                        tableName: tableName,
                        itemKey: itemKey
                    });
                }

                document.querySelectorAll('.delete-item').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const tableName = '${tableName}';
                        const itemKeyJson = this.getAttribute('data-key').replace(/&#39;/g, "'");
                        try {
                            const itemKey = JSON.parse(itemKeyJson);
                            deleteItem(tableName, itemKey);
                        } catch (e) {
                            console.error('Failed to parse item key for deletion', e);
                        }
                    });
                });

                document.querySelectorAll('.copy-json-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const json = this.getAttribute('data-rowjson').replace(/&#39;/g, "'");
                        if (navigator.clipboard) {
                            navigator.clipboard.writeText(json);
                        } else {
                            const textarea = document.createElement('textarea');
                            textarea.value = json;
                            document.body.appendChild(textarea);
                            textarea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textarea);
                        }
                    });
                });

                document.getElementById('refresh-btn').addEventListener('click', function() {
                    vscode.postMessage({ command: 'refreshTable' });
                });
            </script>
        </body>
        </html>
    `;
}

// New function to generate the webview content for adding an item
function getAddItemWebviewContent(tableName: string, initialContent: string = ''): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Add Item</title>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                textarea { width: 100%; height: 300px; padding: 10px; box-sizing: border-box; }
                button { margin-top: 10px; padding: 10px 20px; }
            </style>
        </head>
        <body>
            <h1>Add Item to ${tableName}</h1>
            <p>Enter the item as a JSON object below.</p>
            <textarea id="itemJson" placeholder='e.g., { "id": "123", "name": "example" }'>${initialContent}</textarea>
            <br />
            <button onclick="saveItem()">Save Item</button>
            <button style="margin-left: 10px;" onclick="formatJson()">Format JSON</button>
            <div id="error-message" style="color: red; margin-top: 10px; display: none;"></div>
            <script>
                const vscode = acquireVsCodeApi();

                // Simple debouncing to avoid sending too many messages.
                let timeout = null;
                document.getElementById('itemJson').addEventListener('input', (event) => {
                    const content = event.target.value;
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        vscode.postMessage({
                            command: 'updateContent',
                            content: content
                        });
                    }, 500); // Send an update every 500ms
                });

                
                // Listen for messages from the extension and update the content.
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'loadContent') {
                        document.getElementById('itemJson').value = message.content;
                    }
                    if (message.command === 'addItemFailed') {
                        const errorDiv = document.getElementById('error-message');
                        if (errorDiv) {
                            errorDiv.textContent = message.message;
                            errorDiv.style.display = 'block';
                        }
                    }
                });

                function formatJson() {
                    const itemJson = document.getElementById('itemJson').value;
                    const errorDiv = document.getElementById('error-message');
                    try {
                        const parsed = JSON.parse(itemJson);
                        document.getElementById('itemJson').value = JSON.stringify(parsed, null, 2);
                        if (errorDiv) {
                            errorDiv.style.display = 'none';
                            errorDiv.textContent = '';
                        }
                    } catch (e) {
                        if (errorDiv) {
                            errorDiv.textContent = 'Cannot format invalid JSON.';
                            errorDiv.style.display = 'block';
                        }
                    }
                }

                function saveItem() {
                    const itemJson = document.getElementById('itemJson').value;
                    const errorDiv = document.getElementById('error-message');
                    if (errorDiv) {
                        errorDiv.style.display = 'none';
                        errorDiv.textContent = '';
                    }

                    try {
                        JSON.parse(itemJson);
                        vscode.postMessage({
                            command: 'saveItem',
                            itemJson: itemJson
                        });
                    } catch (e) {
                        if (errorDiv) {
                            errorDiv.textContent = 'Invalid JSON format.';
                            errorDiv.style.display = 'block';
                        }
                    }
                }
            </script>
        </body>
        </html>
    `;
}

export function deactivate() {}
