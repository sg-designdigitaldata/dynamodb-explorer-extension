// This file manages the TreeView in the sidebar. It's responsible for displaying the list of tables.
import * as vscode from 'vscode';
import { DynamoDbService } from './dynamoDbService';

export class TableItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly tableName: string,
    ) {
        super(label, collapsibleState);
        this.contextValue = 'tableItem'; // This context value is used in package.json for context menus.
    }
}

export class DynamoDbTreeProvider implements vscode.TreeDataProvider<TableItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TableItem | undefined | null | void> = new vscode.EventEmitter<TableItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TableItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private readonly dynamoDbService: DynamoDbService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TableItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TableItem): Promise<TableItem[]> {
        if (element) {
            // For this simple example, we don't have children for tables.
            return Promise.resolve([]);
        }

        try {
            const tableNames = await this.dynamoDbService.listTables();
            return tableNames.map(tableName => new TableItem(tableName, vscode.TreeItemCollapsibleState.None, tableName));
        } catch (error) {
            vscode.window.showErrorMessage('Failed to connect to DynamoDB or list tables. Is the Docker container running?');
            return [];
        }
    }
}