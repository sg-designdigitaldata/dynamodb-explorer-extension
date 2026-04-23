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

export class GsiItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tableName: string,
        public readonly gsiName: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'gsiItem';
        this.tooltip = `View data in GSI: ${gsiName}`;
    }
}

export class DynamoDbTreeProvider implements vscode.TreeDataProvider<TableItem | GsiItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TableItem | GsiItem | undefined | null | void> = new vscode.EventEmitter<TableItem | GsiItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TableItem | GsiItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private readonly dynamoDbService: DynamoDbService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TableItem | GsiItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TableItem | GsiItem): Promise<(TableItem | GsiItem)[]> {
        if (element) {
            if (element instanceof TableItem) {
                // Return GSIs for this table
                try {
                    const tableDescription = await this.dynamoDbService.describeTable(element.tableName);
                    const gsis = tableDescription.GlobalSecondaryIndexes || [];
                    return gsis.map((gsi: any) => new GsiItem(gsi.IndexName, element.tableName, gsi.IndexName));
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to load GSIs for table '${element.tableName}': ${error}`);
                    return [];
                }
            } else {
                // GsiItem has no children
                return Promise.resolve([]);
            }
        }

        try {
            const tableNames = await this.dynamoDbService.listTables();
            return tableNames.map(tableName => new TableItem(tableName, vscode.TreeItemCollapsibleState.Collapsed, tableName));
        } catch (error) {
            vscode.window.showErrorMessage('Failed to connect to DynamoDB or list tables. Is the Docker container running?');
            return [];
        }
    }
}