import { TextDocuments, Connection } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileSystemUtils, ErrorHandler } from "./commonUtils";
import * as fs from "fs";
import * as path from "path";

/**
 * Workspace scanning utilities
 * Centralizes the workspace file scanning logic used by multiple providers
 */
export class WorkspaceScanner {
  private documents: TextDocuments<TextDocument>;
  private connection?: Connection;

  constructor(documents: TextDocuments<TextDocument>, connection?: Connection) {
    this.documents = documents;
    this.connection = connection;
  }

  /**
   * Get all workspace Alloy files (opened + workspace files)
   * Replaces the duplicated workspace scanning in definitionProvider, referencesProvider, etc.
   */
  async getWorkspaceAlloyFiles(workspaceFolders: string[]): Promise<TextDocument[]> {
    return ErrorHandler.safeExecuteAsync(async () => {
      const result: TextDocument[] = [];
      const openedDocs = this.documents.all();
      
      // Add opened documents (prioritize these as they have current unsaved changes)
      for (const doc of openedDocs) {
        if (this.isAlloyFile(doc.uri)) {
          result.push(doc);
        }
      }

      // Get workspace folders to scan
      let foldersToScan = workspaceFolders;

      // If no workspace folders configured, infer from opened documents
      if (foldersToScan.length === 0 && openedDocs.length > 0) {
        const firstDocUri = openedDocs[0].uri;
        if (firstDocUri.startsWith('file://')) {
          const filePath = firstDocUri.substring(7);
          foldersToScan = [path.dirname(filePath)];
        }
      }

      // Scan workspace folders for Alloy files
      const allWorkspaceFiles = new Set<string>();
      for (const folder of foldersToScan) {
        const files = FileSystemUtils.getFilesInDirectory(folder, /\.alloy$/);
        files.forEach(file => allWorkspaceFiles.add(file));
      }

      // Convert workspace files to TextDocuments, excluding already opened ones
      const openedUris = new Set(openedDocs.map(doc => doc.uri));
      for (const filePath of allWorkspaceFiles) {
        const uri = `file://${filePath}`;
        if (!openedUris.has(uri)) {
          const doc = FileSystemUtils.readFileAsTextDocument(filePath);
          if (doc) {
            result.push(doc);
          }
        }
      }

      return result;
    }, 'getWorkspaceAlloyFiles', []);
  }

  /**
   * Get all workspace documents (similar to workspaceComponentService but simplified)
   * Prioritizes opened documents to include unsaved changes
   */
  async getAllWorkspaceDocuments(workspaceFolders: string[]): Promise<TextDocument[]> {
    return this.getWorkspaceAlloyFiles(workspaceFolders);
  }

  /**
   * Read file as TextDocument with error handling
   * Centralizes the file reading logic used across providers
   */
  readFileAsTextDocument(filePath: string): TextDocument | null {
    return FileSystemUtils.readFileAsTextDocument(filePath);
  }

  /**
   * Check if URI is an Alloy file
   */
  private isAlloyFile(uri: string): boolean {
    return uri.endsWith('.alloy') || uri.includes('.alloy');
  }

  /**
   * Get workspace folder paths from connection
   */
  async getWorkspaceFolders(): Promise<string[]> {
    return ErrorHandler.safeExecuteAsync(async () => {
      if (!this.connection) {
        return [];
      }

      const folders = await this.connection.workspace.getWorkspaceFolders();
      if (!folders) {
        return [];
      }

      return folders
        .map(folder => folder.uri.startsWith('file://') ? folder.uri.substring(7) : folder.uri)
        .filter(path => fs.existsSync(path));
    }, 'getWorkspaceFolders', []);
  }

  /**
   * Find files matching pattern in workspace
   */
  async findFilesInWorkspace(pattern: string | RegExp, workspaceFolders?: string[]): Promise<string[]> {
    return ErrorHandler.safeExecuteAsync(async () => {
      const folders = workspaceFolders || await this.getWorkspaceFolders();
      const results: string[] = [];
      
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

      for (const folder of folders) {
        const files = FileSystemUtils.getFilesInDirectory(folder, regex);
        results.push(...files);
      }

      return results;
    }, 'findFilesInWorkspace', []);
  }

  /**
   * Check if file exists in workspace
   */
  async fileExistsInWorkspace(relativePath: string, workspaceFolders?: string[]): Promise<string | null> {
    return ErrorHandler.safeExecuteAsync(async () => {
      const folders = workspaceFolders || await this.getWorkspaceFolders();
      
      for (const folder of folders) {
        const fullPath = path.join(folder, relativePath);
        if (FileSystemUtils.isReadableFile(fullPath)) {
          return fullPath;
        }
      }
      
      return null;
    }, 'fileExistsInWorkspace', null);
  }

  /**
   * Get relative path of document within workspace
   */
  getRelativePath(documentUri: string, workspaceFolders?: string[]): string | null {
    return ErrorHandler.safeExecute(() => {
      if (!documentUri.startsWith('file://')) {
        return null;
      }

      const filePath = documentUri.substring(7);
      const folders = workspaceFolders || [];

      for (const folder of folders) {
        if (filePath.startsWith(folder)) {
          return path.relative(folder, filePath);
        }
      }

      // Fallback: try to infer from document path
      return path.basename(filePath);
    }, 'getRelativePath', null);
  }

  /**
   * Batch read multiple files as TextDocuments
   */
  async batchReadFiles(filePaths: string[]): Promise<TextDocument[]> {
    return ErrorHandler.safeExecuteAsync(async () => {
      const results: TextDocument[] = [];
      
      for (const filePath of filePaths) {
        const doc = this.readFileAsTextDocument(filePath);
        if (doc) {
          results.push(doc);
        }
      }

      return results;
    }, 'batchReadFiles', []);
  }
}