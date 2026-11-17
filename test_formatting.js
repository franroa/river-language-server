const { provideDocumentFormatting } = require('./server/out/documentFormattingProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');

// Mock the TextDocuments class
class MockTextDocuments {
  constructor() {
    this.documents = new Map();
  }
  
  get(uri) {
    return this.documents.get(uri);
  }
  
  set(uri, document) {
    this.documents.set(uri, document);
  }
}

async function testFormatting() {
  try {
    // Create test content that needs formatting
    const testContent = `prometheus.scrape "test" {
targets = [
{ __address__ = "localhost:8080" },
]
forward_to = [prometheus.remote_write.test.receiver]
}

prometheus.remote_write "test" {
endpoint {
url = "http://localhost:9090/api/v1/write"
}
}`;

    // Create a mock text document
    const document = TextDocument.create(
      'file:///test.alloy',
      'alloy',
      1,
      testContent
    );

    // Create mock documents container
    const documents = new MockTextDocuments();
    documents.set('file:///test.alloy', document);

    // Create formatting parameters
    const params = {
      textDocument: { uri: 'file:///test.alloy' },
      options: {
        tabSize: 2,
        insertSpaces: false
      }
    };

    console.log('Testing document formatting...');
    console.log('Original content:');
    console.log(testContent);
    console.log('\n--- Running alloy fmt ---\n');

    // Call the formatting provider
    const edits = await provideDocumentFormatting(params, documents);

    if (edits && edits.length > 0) {
      console.log('Formatting successful! Number of edits:', edits.length);
      console.log('Formatted content:');
      console.log(edits[0].newText);
    } else {
      console.log('No formatting changes needed or formatting failed.');
    }

  } catch (error) {
    console.error('Error testing formatting:', error);
  }
}

testFormatting();