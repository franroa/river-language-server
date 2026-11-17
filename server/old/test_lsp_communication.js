// Test LSP communication and document diagnostics
const fs = require('fs');

// Mock LSP connection for testing
class MockConnection {
  constructor() {
    this.notifications = [];
    this.console = {
      log: (msg) => console.log(`[LSP LOG] ${msg}`),
      error: (msg) => console.error(`[LSP ERROR] ${msg}`)
    };
  }

  sendNotification(method, params) {
    this.notifications.push({ method, params });
    console.log(`[LSP NOTIFICATION] ${method}`);
    console.log(`  URI: ${params.uri}`);
    console.log(`  Diagnostics: ${params.diagnostics.length} items`);
    if (params.diagnostics.length > 0) {
      params.diagnostics.forEach((diag, i) => {
        console.log(`    ${i + 1}. Line ${diag.range.start.line + 1}: ${diag.message}`);
      });
    }
    return Promise.resolve();
  }

  onInitialize() {}
  onInitialized() {}
  listen() {}
}

// Import the actual diagnostics function
const { getWorkspaceDiagnostics, getDocumentDiagnostics } = require('../out/diagnostics.js');

// Mock TextDocument class
class MockTextDocument {
  constructor(uri, content) {
    this.uri = uri;
    this.content = content;
  }

  getText() {
    return this.content;
  }

  positionAt(offset) {
    const lines = this.content.substring(0, offset).split('\n');
    return {
      line: lines.length - 1,
      character: lines[lines.length - 1].length
    };
  }
}

// Mock TextDocuments collection
class MockTextDocuments {
  constructor() {
    this.documents = new Map();
  }

  add(uri, content) {
    this.documents.set(uri, new MockTextDocument(uri, content));
  }

  all() {
    return Array.from(this.documents.values());
  }

  get(uri) {
    return this.documents.get(uri);
  }
}

async function testLSPCommunication() {
  console.log("=== Testing LSP Communication and Document Diagnostics ===\n");

  const connection = new MockConnection();
  const documents = new MockTextDocuments();

  try {
    // Add the actual files from the user's workspace
    const logsPath = '/home/froa/Projects/ts/basicservice/observability/alloy/logs.alloy';
    const configPath = '/home/froa/Projects/ts/basicservice/observability/alloy/config.alloy';

    if (fs.existsSync(logsPath) && fs.existsSync(configPath)) {
      const logsContent = fs.readFileSync(logsPath, 'utf8');
      const configContent = fs.readFileSync(configPath, 'utf8');

      documents.add(logsPath, logsContent);
      documents.add(configPath, configContent);

      console.log("📁 Files added to workspace\n");

      // Test 1: Document diagnostics for individual file
      console.log("🔍 Test 1: Document diagnostics for logs.alloy");
      const logsDoc = documents.get(logsPath);
      const logsDocDiagnostics = await getDocumentDiagnostics(logsDoc);
      console.log(`Found ${logsDocDiagnostics.length} document-level diagnostics for logs.alloy\n`);

      // Test 2: Document diagnostics for config file  
      console.log("🔍 Test 2: Document diagnostics for config.alloy");
      const configDoc = documents.get(configPath);
      const configDocDiagnostics = await getDocumentDiagnostics(configDoc);
      console.log(`Found ${configDocDiagnostics.length} document-level diagnostics for config.alloy\n`);

      // Test 3: Workspace diagnostics
      console.log("🔍 Test 3: Workspace diagnostics");
      const workspaceDiagnostics = await getWorkspaceDiagnostics(documents);
      console.log(`Found workspace diagnostics in ${workspaceDiagnostics.length} files\n`);

      // Test 4: Simulate LSP notification sending
      console.log("📤 Test 4: Simulating LSP notifications");
      const allUris = new Set(documents.all().map(doc => doc.uri));
      for (const fileDiagnostics of workspaceDiagnostics) {
        allUris.delete(fileDiagnostics.uri);
        connection.sendNotification('textDocument/publishDiagnostics', {
          uri: fileDiagnostics.uri,
          diagnostics: fileDiagnostics.items
        });
      }

      // Send empty diagnostics for files without workspace issues
      for (const uri of allUris) {
        connection.sendNotification('textDocument/publishDiagnostics', {
          uri: uri,
          diagnostics: []
        });
      }

      console.log(`\n📊 Total notifications sent: ${connection.notifications.length}`);
      console.log("✅ LSP communication test completed successfully");

    } else {
      console.log("❌ Test files not found");
    }
  } catch (error) {
    console.error("❌ Error during LSP communication test:", error);
    console.error("Stack:", error.stack);
  }
}

// Run the test
testLSPCommunication();