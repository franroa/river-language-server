// Test the generateBlockSnippet function logic
console.log("=== Block Snippet Generation Test ===");

// Mock block completion that matches what should be in allBlockCompletions
const mockBlockCompletions = {
  "prometheus.remote_write": [
    {
      label: "endpoint",
      insertText: "endpoint {\n\t${1:url} = \"${2:http://localhost:9090/api/v1/write}\"\n}",
      kind: 2, // CompletionItemKind.Snippet
      detail: "Location to send metrics to.",
    }
  ]
};

// Simulate generateBlockSnippet function logic
function generateBlockSnippet(blockName, componentType) {
  const blockCompletions = mockBlockCompletions[componentType];
  
  if (!blockCompletions) {
    return null;
  }
  
  const blockCompletion = blockCompletions.find(
    completion => completion.label === blockName
  );
  
  if (!blockCompletion || !blockCompletion.insertText) {
    return `${blockName} {\n\t\n}`;
  }
  
  let blockText = blockCompletion.insertText;
  
  // Remove ${1:...} and similar snippet placeholders
  blockText = blockText.replace(/\$\{\d+:([^}]*)\}/g, '$1');
  blockText = blockText.replace(/\$\{\d+\}/g, '');
  
  return blockText;
}

// Test the function
const result = generateBlockSnippet("endpoint", "prometheus.remote_write");

console.log("Input:");
console.log("  Block name: endpoint");
console.log("  Component type: prometheus.remote_write");
console.log("\nOutput:");
console.log("  Generated snippet:", JSON.stringify(result));
console.log("\nFormatted output:");
console.log(result);

if (result && result.includes("endpoint") && result.includes("url")) {
  console.log("✅ SUCCESS: Correct endpoint block generated");
} else {
  console.log("❌ FAILURE: Incorrect block generation");
}