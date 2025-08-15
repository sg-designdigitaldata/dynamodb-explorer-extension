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
exports.activate = activate;
exports.deactivate = deactivate;
// This is the main entry point for your extension.
const vscode = __importStar(require("vscode"));
const treeProvider_1 = require("./treeProvider");
const dynamoDbService_1 = require("./dynamoDbService");
const primaryKeyCache_1 = require("./primaryKeyCache");
// Global primary key cache
const primaryKeyCache = primaryKeyCache_1.PrimaryKeyCache.getInstance();
// A map to store the webview panels for each table, allowing us to reuse them.
const addItemPanels = new Map();
// A new map to store the content of the add item form for each table.
const formContent = new Map();
function activate(context) {
    // On extension init, populate the primary key cache for all tables
    const dynamoDbService = new dynamoDbService_1.DynamoDbService();
    (async () => {
        const tableNames = await dynamoDbService.listTables();
        await primaryKeyCache.populate(dynamoDbService['client'], tableNames);
    })();
    const dynamoDbTreeProvider = new treeProvider_1.DynamoDbTreeProvider(dynamoDbService);
    console.log('Congratulations, your extension "dynamodb-explorer" is now active!');
    // Register the Tree View for the sidebar.
    vscode.window.registerTreeDataProvider('dynamoDbExplorerTables', dynamoDbTreeProvider);
    // Listen for changes to the endpoint setting and prompt for reload
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('dynamodbExplorer.endpoint')) {
            vscode.window.showInformationMessage('DynamoDB endpoint setting changed. Reload window to apply changes?', 'Reload').then(selection => {
                if (selection === 'Reload') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    }));
    // Register commands for buttons and context menus.
    context.subscriptions.push(
    // Command to refresh the table list.
    vscode.commands.registerCommand('dynamodb-explorer.refreshTables', () => dynamoDbTreeProvider.refresh()), 
    // Command to create a new table.
    vscode.commands.registerCommand('dynamodb-explorer.createTable', async () => {
        const tableName = await vscode.window.showInputBox({ prompt: 'Enter new table name' });
        if (!tableName) {
            return;
        }
        const keyName = await vscode.window.showInputBox({ prompt: 'Enter partition key name (e.g., id)' });
        if (!keyName) {
            return;
        }
        try {
            // A very simple key schema for demonstration. You can expand on this.
            await dynamoDbService.createTable(tableName, [{ AttributeName: keyName, KeyType: 'HASH' }]);
            // Add to primary key cache
            primaryKeyCache.set(tableName, keyName);
            vscode.window.showInformationMessage(`Table '${tableName}' created successfully!`);
            dynamoDbTreeProvider.refresh();
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to create table: ${error}`);
        }
    }), 
    // Command to delete a table from the context menu.
    vscode.commands.registerCommand('dynamodb-explorer.deleteTable', async (tableItem) => {
        const confirmation = await vscode.window.showInformationMessage(`Are you sure you want to delete the table '${tableItem.tableName}'?`, { modal: true }, 'Yes');
        if (confirmation === 'Yes') {
            try {
                await dynamoDbService.deleteTable(tableItem.tableName);
                vscode.window.showInformationMessage(`Table '${tableItem.tableName}' deleted successfully.`);
                dynamoDbTreeProvider.refresh();
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to delete table: ${error}`);
            }
        }
    }), 
    // Command to view table contents in a new editor panel.
    vscode.commands.registerCommand('dynamodb-explorer.viewTableContents', async (tableItem) => {
        const panel = vscode.window.createWebviewPanel('tableContent', `Contents of ${tableItem.tableName}`, vscode.ViewColumn.One, { enableScripts: true } // Enable scripts for the delete button.
        );
        // Handle messages from the webview.
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'deleteItem':
                    // The message should contain the tableName and the item's key.
                    if (message.tableName && message.itemKey) {
                        const confirmation = await vscode.window.showInformationMessage(`Are you sure you want to delete this item?`, { modal: true }, 'Yes');
                        if (confirmation === 'Yes') {
                            try {
                                await dynamoDbService.deleteItem(message.tableName, message.itemKey);
                                vscode.window.showInformationMessage(`Item deleted from table '${message.tableName}' successfully.`);
                                // Refresh the webview to show the updated table.
                                const items = await dynamoDbService.scanTable(message.tableName);
                                panel.webview.html = getWebviewContent(message.tableName, items);
                                dynamoDbTreeProvider.refresh();
                            }
                            catch (error) {
                                vscode.window.showErrorMessage(`Failed to delete item: ${error}`);
                            }
                        }
                        break;
                    }
                case 'refreshTable':
                    try {
                        const items = await dynamoDbService.scanTable(tableItem.tableName);
                        panel.webview.html = getWebviewContent(tableItem.tableName, items);
                    }
                    catch (error) {
                        panel.webview.html = `<h1>Error</h1><p>Failed to reload table contents: ${error}</p>`;
                    }
                    break;
            }
        }, undefined, context.subscriptions);
        try {
            const items = await dynamoDbService.scanTable(tableItem.tableName);
            panel.webview.html = getWebviewContent(tableItem.tableName, items);
        }
        catch (error) {
            panel.webview.html = `<h1>Error</h1><p>Failed to load table contents: ${error}</p>`;
        }
    }), 
    // Command to add an item to a table.
    vscode.commands.registerCommand('dynamodb-explorer.addItem', async (tableItem) => {
        let panel = addItemPanels.get(tableItem.tableName);
        if (panel) {
            // If a panel exists, reveal it.
            panel.reveal(vscode.ViewColumn.One);
        }
        else {
            // If not, create a new one.
            panel = vscode.window.createWebviewPanel('addItemForm', `Add Item to ${tableItem.tableName}`, vscode.ViewColumn.One, { enableScripts: true });
            addItemPanels.set(tableItem.tableName, panel);
            // When the panel is disposed, remove it from our map and clear the saved content.
            panel.onDidDispose(() => {
                addItemPanels.delete(tableItem.tableName);
                formContent.delete(tableItem.tableName);
            }, null, context.subscriptions);
        }
        // Get the saved content for this table, or an empty string if none exists.
        const currentContent = formContent.get(tableItem.tableName) || '';
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
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'saveItem':
                    try {
                        const item = JSON.parse(message.itemJson);
                        await dynamoDbService.putItem(tableItem.tableName, item);
                        vscode.window.showInformationMessage(`Item added to table '${tableItem.tableName}' successfully!`);
                        panel?.dispose();
                        dynamoDbTreeProvider.refresh();
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Failed to add item: ${error}`);
                    }
                    break;
                case 'updateContent':
                    // When the webview sends an update, save the content.
                    formContent.set(tableItem.tableName, message.content);
                    break;
            }
        }, undefined, context.subscriptions);
    }));
}
function getWebviewContent(tableName, items) {
    let tableRows = '';
    let tableHeaders = '';
    if (items && items.length > 0) {
        // Compute the union of all keys across all items
        const allKeys = Array.from(items.reduce((keys, item) => {
            Object.keys(item).forEach(k => keys.add(k));
            return keys;
        }, new Set()));
        const primaryKeyName = primaryKeyCache.get(tableName) || allKeys[0];
        tableHeaders = `
            <thead>
                <tr>
                    ${allKeys.map(key => `<th>${key}</th>`).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
        `;
        tableRows = items.map(item => {
            const primaryKeyValue = item[primaryKeyName];
            // Properly escape the primary key value for use in the onclick attribute
            const escapedKeyValue = typeof primaryKeyValue === 'string' ? primaryKeyValue.replace(/'/g, "\\'") : primaryKeyValue;
            const rowJson = JSON.stringify(item).replace(/'/g, "&#39;"); // Escape single quotes for HTML attribute
            return `
                <tr>
                    ${allKeys.map(key => `<td>${item[key] !== undefined ? JSON.stringify(item[key]) : ''}</td>`).join('')}
                    <td>
                        <button onclick="deleteItem('${tableName}', '${primaryKeyName}', '${escapedKeyValue}')">Delete</button>
                        <button class="copy-json-btn" data-rowjson='${rowJson}'>Copy JSON</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    else {
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

                function deleteItem(tableName, primaryKeyName, primaryKeyValue) {
                    const itemKey = { [primaryKeyName]: primaryKeyValue };
                    vscode.postMessage({
                        command: 'deleteItem',
                        tableName: tableName,
                        itemKey: itemKey
                    });
                }

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
function getAddItemWebviewContent(tableName, initialContent = '') {
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
            <button onclick="saveItem()">Save Item</button>
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
                });

                function saveItem() {
                    const itemJson = document.getElementById('itemJson').value;
                    try {
                        JSON.parse(itemJson);
                        vscode.postMessage({
                            command: 'saveItem',
                            itemJson: itemJson
                        });
                    } catch (e) {
                        alert('Invalid JSON format!');
                    }
                }
            </script>
        </body>
        </html>
    `;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map