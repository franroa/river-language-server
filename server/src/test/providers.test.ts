import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, Position, Range } from "vscode-languageserver/node";
import { provideSelectionRanges } from "../selectionRangeProvider";
import { prepareCallHierarchy } from "../callHierarchyProvider";
import { renameComponentAcrossWorkspace } from "../workspaceEditProvider";

// Test framework types
interface JestMatchers<R> {
  toBe(expected: any): R;
  toBeGreaterThan(expected: number): R;
  toBeDefined(): R;
  toBeNull(): R;
  toContain(expected: any): R;
  toThrow(expected?: any): R;
  not: JestMatchers<R>;
}

declare const expect: (actual: any) => JestMatchers<any>;
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const beforeEach: (fn: () => void) => void;

// Mock document helper
function createMockDocument(uri: string, content: string): TextDocument {
  return TextDocument.create(uri, "alloy", 1, content);
}

// Mock documents collection
class MockTextDocuments extends TextDocuments<TextDocument> {
  private docs: Map<string, TextDocument> = new Map();

  constructor() {
    super(TextDocument);
  }

  get(uri: string): TextDocument | undefined {
    return this.docs.get(uri);
  }

  all(): TextDocument[] {
    return Array.from(this.docs.values());
  }

  addDocument(doc: TextDocument): void {
    this.docs.set(doc.uri, doc);
  }
}

describe("LSP Providers", () => {
  let documents: MockTextDocuments;

  beforeEach(() => {
    documents = new MockTextDocuments();
  });

  describe("Selection Range Provider", () => {
    it("should provide selection ranges for simple positions", () => {
      const doc = createMockDocument("file:///test.alloy", `
        prometheus.scrape "app" {
          targets = [{ __address__ = "localhost:8080" }]
        }
      `);
      documents.addDocument(doc);

      const result = provideSelectionRanges({
        textDocument: { uri: doc.uri },
        positions: [Position.create(1, 10)]
      }, documents);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle invalid positions gracefully", () => {
      const doc = createMockDocument("file:///test.alloy", "simple content");
      documents.addDocument(doc);

      const result = provideSelectionRanges({
        textDocument: { uri: doc.uri },
        positions: [Position.create(100, 100)] // Invalid position
      }, documents);

      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });

  describe("Call Hierarchy Provider", () => {
    it("should prepare call hierarchy for component at position", () => {
      const doc = createMockDocument("file:///test.alloy", `
        prometheus.scrape "app" {
          forward_to = [prometheus.remote_write.default.receiver]
        }
        
        prometheus.remote_write "default" {
          endpoint { url = "http://localhost:9009/api/prom/push" }
        }
      `);
      documents.addDocument(doc);

      const result = prepareCallHierarchy({
        textDocument: { uri: doc.uri },
        position: Position.create(1, 20) // Inside prometheus.scrape
      }, documents);

      expect(result).toBeDefined();
      if (result && result.length > 0) {
        expect(result[0].name).toContain("prometheus.scrape");
      }
    });

    it("should return null for positions without components", () => {
      const doc = createMockDocument("file:///test.alloy", "// Just a comment");
      documents.addDocument(doc);

      const result = prepareCallHierarchy({
        textDocument: { uri: doc.uri },
        position: Position.create(0, 5)
      }, documents);

      expect(result).toBeNull();
    });
  });

  describe("Workspace Edit Provider", () => {
    it("should rename component across workspace", async () => {
      const doc1 = createMockDocument("file:///test1.alloy", `
        prometheus.scrape "old_name" {
          targets = []
        }
      `);
      
      const doc2 = createMockDocument("file:///test2.alloy", `
        prometheus.remote_write "writer" {
          forward_to = [prometheus.scrape.old_name.receiver]
        }
      `);

      documents.addDocument(doc1);
      documents.addDocument(doc2);

      const result = await renameComponentAcrossWorkspace(
        "prometheus.scrape",
        "old_name",
        "new_name",
        documents
      );

      expect(result).toBeDefined();
      expect(result.changes).toBeDefined();
      
      // Should have changes for both files
      const changeCount = Object.keys(result.changes || {}).length;
      expect(changeCount).toBeGreaterThan(0);
    });

    it("should handle empty workspace gracefully", async () => {
      const result = await renameComponentAcrossWorkspace(
        "prometheus.scrape",
        "old_name", 
        "new_name",
        documents
      );

      expect(result).toBeDefined();
      expect(result.changes).toBeDefined();
      expect(Object.keys(result.changes || {}).length).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed documents gracefully", () => {
      const doc = createMockDocument("file:///malformed.alloy", `
        prometheus.scrape "test" {
          targets = [unclosed bracket
        // Missing closing brace
      `);
      documents.addDocument(doc);

      // All providers should handle malformed content without throwing
      expect(() => {
        provideSelectionRanges({
          textDocument: { uri: doc.uri },
          positions: [Position.create(1, 5)]
        }, documents);
      }).not.toThrow();

      expect(() => {
        prepareCallHierarchy({
          textDocument: { uri: doc.uri },
          position: Position.create(1, 5)
        }, documents);
      }).not.toThrow();
    });
  });
});

// Test configuration for Jest
export {};