// Test the missing blocks detection logic
const testContent1 = `
external_labels = {
  "env" = "dev"
}
`;

const testContent2 = `
external_labels = {
  "env" = "dev"
}

endpoint {
  url = "http://localhost:9090/api/v1/write"
}
`;

// Simulate the getMissingBlocks function logic
function testGetMissingBlocks(content, requiredBlocks) {
    const missing = [];
    
    for (const reqBlock of requiredBlocks) {
        // Look for block definitions like "endpoint {" or "endpoint   {"
        const blockRegex = new RegExp(`(^|\\n)\\s*${reqBlock}\\s*\\{`, "m");
        console.log(`Testing regex: ${blockRegex} against content`);
        if (!blockRegex.test(content)) {
            missing.push(reqBlock);
            console.log(`❌ Missing block: ${reqBlock}`);
        } else {
            console.log(`✅ Found block: ${reqBlock}`);
        }
    }
    return missing;
}

console.log("=== Test 1: Content without endpoint ===");
const missing1 = testGetMissingBlocks(testContent1, ["endpoint"]);
console.log(`Missing blocks: [${missing1.join(', ')}]\n`);

console.log("=== Test 2: Content with endpoint ===");
const missing2 = testGetMissingBlocks(testContent2, ["endpoint"]);
console.log(`Missing blocks: [${missing2.join(', ')}]`);