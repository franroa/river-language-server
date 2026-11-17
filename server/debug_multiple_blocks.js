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

console.log('Lines:');
lines.forEach((l, i) => console.log(`${i}: ${l}`));
console.log('');

// Find both values lines
const labelsValuesLine = lines.findIndex(l => l.includes('values = {') && lines[l-1] && lines[l-1].includes('stage.labels'));
const structuredValuesLine = lines.findIndex((l, i) => l.includes('values = {') && lines[i-1] && lines[i-1].includes('stage.structured_metadata'));

console.log(`Labels values line: ${labelsValuesLine} ("${lines[labelsValuesLine]}")`);
console.log(`Structured metadata values line: ${structuredValuesLine} ("${lines[structuredValuesLine]}")`);
console.log('');

// Test type inference for both
console.log('=== Testing stage.labels.values ===');
const labelsType = TypeInference.getExpectedParameterType(doc, labelsValuesLine, 'values');
console.log(`Type result: ${labelsType}`);

console.log('\n=== Testing stage.structured_metadata.values ===');
const structuredType = TypeInference.getExpectedParameterType(doc, structuredValuesLine, 'values');
console.log(`Type result: ${structuredType}`);

// Let's also check what component info says about these
console.log('\n=== Component parameter definitions ===');
const componentInfo = TypeInference.loadComponentInfo('loki.process');
if (componentInfo) {
  const relevantParams = componentInfo.parameters.filter(p => 
    p.name.includes('stage.labels.values') || 
    p.name.includes('stage.structured_metadata.values')
  );
  relevantParams.forEach(p => {
    console.log(`${p.name}: ${p.type}`);
  });
}