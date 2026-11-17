// Simple test to verify requiredBlocks are working
const fs = require('fs');

// Read the compiled JS to see if requiredBlocks export exists
const componentDataPath = '../out/componentData.js';
const diagnosticsPath = '../out/diagnostics.js';

console.log('Testing required blocks export...');

// Check if the exports exist in the source files
const componentIndexPath = './components/index.ts';
if (fs.existsSync(componentIndexPath)) {
    const content = fs.readFileSync(componentIndexPath, 'utf8');
    if (content.includes('export const requiredBlocks')) {
        console.log('✅ requiredBlocks export found in components/index.ts');
        
        // Check prometheus.remote_write specifically
        if (content.includes('prometheusRequiredBlocks')) {
            console.log('✅ prometheusRequiredBlocks import found');
        }
    } else {
        console.log('❌ requiredBlocks export not found');
    }
}

// Check prometheus.ts for the specific entry
const prometheusPath = './components/prometheus.ts';
if (fs.existsSync(prometheusPath)) {
    const content = fs.readFileSync(prometheusPath, 'utf8');
    if (content.includes('"prometheus.remote_write": ["endpoint"]')) {
        console.log('✅ prometheus.remote_write endpoint requirement found');
    } else {
        console.log('❌ prometheus.remote_write endpoint requirement not found');
    }
}

// Check diagnostics.ts for the getMissingBlocks function
const diagnosticsSourcePath = './diagnostics.ts';
if (fs.existsSync(diagnosticsSourcePath)) {
    const content = fs.readFileSync(diagnosticsSourcePath, 'utf8');
    if (content.includes('getMissingBlocks')) {
        console.log('✅ getMissingBlocks function found in diagnostics.ts');
    }
    if (content.includes('requiredBlocks')) {
        console.log('✅ requiredBlocks import found in diagnostics.ts');
    }
}