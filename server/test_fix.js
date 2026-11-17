const { TextDocument } = require('vscode-languageserver-textdocument');
const TypeInference = require('./src/compiled/typeInference.js');

// Test with the exact content the user provided showing both blocks
const testContent = `loki.process "test" {
  forward_to = []
  
  stage.labels {
    values = {
      level  = "level",
      method = "method",
      request_route_formated = "request_route_formated",
      status                 = "status",
      msg                    = "msg",
      app                    = "app",
      environment            = "environment",
      customer               = "customer",
    }
  }

  stage.structured_metadata {
    values = {
      msg_content = "msg",
      event_time  = "timestamp",
    }
  }
}`;

const doc = TextDocument.create('test://test.alloy', 'alloy', 1, testContent);
const lines = testContent.split('\n');

// Find both values lines
let labelsValuesLine = -1;
let structuredValuesLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('values = {')) {
    // Look backwards to find the stage block opening
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].includes('stage.labels {')) {
        labelsValuesLine = i;
        break;
      }
      if (lines[j].includes('stage.structured_metadata {')) {
        structuredValuesLine = i;
        break;
      }
      // Stop if we hit another block or the component start
      if (lines[j].includes('{') && !lines[j].includes('=')) {
        break;
      }
    }
  }
}

console.log(`Labels values line: ${labelsValuesLine} ("${lines[labelsValuesLine] || 'not found'}")`);
console.log(`Structured metadata values line: ${structuredValuesLine} ("${lines[structuredValuesLine] || 'not found'}")`);
console.log('');

// Test type inference for both
if (labelsValuesLine >= 0) {
  console.log('=== Testing stage.labels.values ===');
  const labelsType = TypeInference.getExpectedParameterType(doc, labelsValuesLine, 'values');
  console.log(`Type result: ${labelsType}`);
}

if (structuredValuesLine >= 0) {
  console.log('\n=== Testing stage.structured_metadata.values ===');
  const structuredType = TypeInference.getExpectedParameterType(doc, structuredValuesLine, 'values');
  console.log(`Type result: ${structuredType}`);
}

// Expected results
console.log('\n=== Expected results ===');
console.log('stage.labels.values should be: map(string)');
console.log('stage.structured_metadata.values should be: map(string)');