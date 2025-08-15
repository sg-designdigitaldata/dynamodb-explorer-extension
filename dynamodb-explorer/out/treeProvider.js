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
exports.DynamoDbTreeProvider = exports.TableItem = void 0;
// This file manages the TreeView in the sidebar. It's responsible for displaying the list of tables.
const vscode = __importStar(require("vscode"));
class TableItem extends vscode.TreeItem {
    label;
    collapsibleState;
    tableName;
    constructor(label, collapsibleState, tableName) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.tableName = tableName;
        this.contextValue = 'tableItem'; // This context value is used in package.json for context menus.
    }
}
exports.TableItem = TableItem;
class DynamoDbTreeProvider {
    dynamoDbService;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(dynamoDbService) {
        this.dynamoDbService = dynamoDbService;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (element) {
            // For this simple example, we don't have children for tables.
            return Promise.resolve([]);
        }
        try {
            const tableNames = await this.dynamoDbService.listTables();
            return tableNames.map(tableName => new TableItem(tableName, vscode.TreeItemCollapsibleState.None, tableName));
        }
        catch (error) {
            vscode.window.showErrorMessage('Failed to connect to DynamoDB or list tables. Is the Docker container running?');
            return [];
        }
    }
}
exports.DynamoDbTreeProvider = DynamoDbTreeProvider;
//# sourceMappingURL=treeProvider.js.map