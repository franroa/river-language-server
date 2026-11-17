const { TextDocument } = require('vscode-languageserver-textdocument');

// Recreate the findCurrentBlockContext function with debugging
function findCurrentBlockContextDebug(document, lineIndex) {
  const text = document.getText();
  const lines = text.split('\n');

  let blockStack = [];
  let braceCount = 0;

  console.log(`\n=== Analyzing up to line ${lineIndex} ===`);

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];
    console.log(`Line ${i}: "${line}"`);
    
    // Skip comment lines
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
      console.log(`  -> Skipping comment`);
      continue;
    }
    
    // Look for block openings (e.g., "stage.labels {", "prometheus.scrape \"name\" {")
    const blockMatch = line.match(/^\s*(\w+(?:\.\w+)*)\s*(?:"[^"]*")?\s*\{/);
    if (blockMatch) {
      const blockName = blockMatch[1];
      blockStack.push(blockName);
      braceCount++;
      console.log(`  -> Found block opening: "${blockName}", stack: [${blockStack.join(', ')}], braceCount: ${braceCount}`);
      continue;
    }
    
    // Count braces to track when blocks end
    let inString = false;
    let stringChar = '';
    let lineOpenBraces = 0;
    let lineCloseBraces = 0;
    
    for (const char of line) {
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        if (char === '{') {
          braceCount++;
          lineOpenBraces++;
        } else if (char === '}') {
          braceCount--;
          lineCloseBraces++;
          if (blockStack.length > 0) {
            const popped = blockStack.pop();
            console.log(`  -> Block ended: "${popped}", stack: [${blockStack.join(', ')}], braceCount: ${braceCount}`);
          }
        }
      }
    }
    
    if (lineOpenBraces > 0 || lineCloseBraces > 0) {
      console.log(`  -> Braces: +${lineOpenBraces} -${lineCloseBraces}, total braceCount: ${braceCount}`);
    }
  }

  // Return the current block path excluding the component itself
  const result = blockStack.length > 1 ? blockStack.slice(1).join('.') : null;
  console.log(`\nFinal block context: "${result}"`);
  console.log(`Final block stack: [${blockStack.join(', ')}]`);
  return result;
}

// Test content
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

// Test for both lines
console.log('=== Testing stage.labels line (line 4) ===');
findCurrentBlockContextDebug(doc, 4);

console.log('\n=== Testing stage.structured_metadata line (line 17) ===');
findCurrentBlockContextDebug(doc, 17);