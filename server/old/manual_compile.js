#!/usr/bin/env node

// Manual compilation helper to work around corrupted TypeScript dependencies
const fs = require('fs');
const path = require('path');

function compileTypeScriptBasic(tsContent) {
    // Very basic TypeScript to JavaScript conversion
    // Replace import/export statements
    let jsContent = tsContent
        // Convert imports
        .replace(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g, 'const { $1 } = require("$2");')
        .replace(/import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+["']([^"']+)["'];?/g, 'const $1 = require("$2");')
        // Convert exports
        .replace(/export\s+const\s+/g, 'const ')
        .replace(/export\s+\{([^}]+)\};?/g, 'module.exports = { $1 };')
        // Add exports at the end if needed
        + '\n\n// Manual exports (will be added by manual_compile script)\n';
    
    return jsContent;
}

function updateCompiledIndex() {
    console.log('Updating compiled index.js with new exports...');
    
    const indexPath = '../out/aux_component/index.js';
    const sourceIndexPath = './aux_component/index.ts';
    
    if (!fs.existsSync(sourceIndexPath)) {
        console.error('Source index.ts not found:', sourceIndexPath);
        return false;
    }
    
    const sourceContent = fs.readFileSync(sourceIndexPath, 'utf8');
    
    // Extract the new export statements for the missing exports
    const newExportsCode = `
// Add the missing exports that were updated in the source
exports.allBlockCompletions = {
  ...prometheusBlockCompletions || {},
  ...lokiBlockCompletions || {},
  ...discoveryBlockCompletions || {},
  ...localBlockCompletions || {},
  ...beylaBlockCompletions || {},
  ...database_observabilityBlockCompletions || {},
  ...faroBlockCompletions || {},
  ...mimirBlockCompletions || {},
  ...pyroscopeBlockCompletions || {},
  ...remoteBlockCompletions || {},
};

exports.allNestedBlockProperties = {
  ...prometheusNestedBlockProperties || {},
  ...lokiNestedBlockProperties || {},
  ...discoveryNestedBlockProperties || {},
  ...localNestedBlockProperties || {},
  ...beylaNestedBlockProperties || {},
  ...database_observabilityNestedBlockProperties || {},
  ...faroNestedBlockProperties || {},
  ...mimirNestedBlockProperties || {},
  ...pyroscopeNestedBlockProperties || {},
  ...remoteNestedBlockProperties || {},
};

exports.requiredBlocks = {
  ...prometheusRequiredBlocks || {},
  ...lokiRequiredBlocks || {},
  ...discoveryRequiredBlocks || {},
  ...localRequiredBlocks || {},
  ...beylaRequiredBlocks || {},
  ...database_observabilityRequiredBlocks || {},
  ...faroRequiredBlocks || {},
  ...mimirRequiredBlocks || {},
  ...pyroscopeRequiredBlocks || {},
  ...remoteRequiredBlocks || {},
};
`;

    // Read the current compiled index
    let compiledContent = fs.readFileSync(indexPath, 'utf8');
    
    // Add our new exports at the end, but before the source map comment
    compiledContent = compiledContent.replace(
        /\/\/# sourceMappingURL=index\.js\.map/,
        newExportsCode + '\n//# sourceMappingURL=index.js.map'
    );
    
    // Write the updated compiled file
    fs.writeFileSync(indexPath, compiledContent);
    console.log('✅ Updated compiled index.js with new exports');
    
    return true;
}

// Run the update
if (require.main === module) {
    const success = updateCompiledIndex();
    process.exit(success ? 0 : 1);
}

module.exports = { updateCompiledIndex };