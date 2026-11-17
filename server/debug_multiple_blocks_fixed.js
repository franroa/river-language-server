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

// Find both values lines more carefully
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
  
  // Also test what component is found
  const component = TypeInference.findComponentForLine(doc, labelsValuesLine);
  console.log(`Component found: ${component}`);
}

if (structuredValuesLine >= 0) {
  console.log('\n=== Testing stage.structured_metadata.values ===');
  const structuredType = TypeInference.getExpectedParameterType(doc, structuredValuesLine, 'values');
  console.log(`Type result: ${structuredType}`);
  
  // Also test what component is found
  const component = TypeInference.findComponentForLine(doc, structuredValuesLine);
  console.log(`Component found: ${component}`);
}

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