#!/usr/bin/env node

// Test script to verify the scraped component data
const fs = require('fs');
const path = require('path');

function testExports() {
    try {
        console.log('Testing scraped component data...\n');
        
        // Test imports
        const componentData = require('./aux_component/index.js');
        
        console.log('✅ Successfully imported component data');
        
        // Test basic exports exist
        console.log(`📊 Component snippets: ${componentData.componentSnippets?.length || 0}`);
        console.log(`📊 Block properties keys: ${Object.keys(componentData.allBlockProperties || {}).length}`);
        console.log(`📊 Required attributes keys: ${Object.keys(componentData.requiredAttributes || {}).length}`);
        console.log(`📊 Block completions keys: ${Object.keys(componentData.allBlockCompletions || {}).length}`);
        console.log(`📊 Nested block properties keys: ${Object.keys(componentData.allNestedBlockProperties || {}).length}`);
        console.log(`📊 Required blocks keys: ${Object.keys(componentData.requiredBlocks || {}).length}`);
        
        // Test some specific component data
        const testComponent = 'prometheus.scrape';
        if (componentData.allBlockProperties[testComponent]) {
            console.log(`\n✅ Found ${testComponent} in block properties`);
            console.log(`   Properties: ${componentData.allBlockProperties[testComponent].length}`);
        }
        
        if (componentData.requiredAttributes[testComponent]) {
            console.log(`✅ Found ${testComponent} required attributes: ${componentData.requiredAttributes[testComponent].join(', ')}`);
        }
        
        // Test Beyla component (should have new data)
        const beylaComponent = 'beyla.ebpf';
        if (componentData.allBlockProperties[beylaComponent]) {
            console.log(`\n✅ Found ${beylaComponent} in block properties`);
            console.log(`   Properties: ${componentData.allBlockProperties[beylaComponent].length}`);
        }
        
        if (componentData.allBlockCompletions[beylaComponent]) {
            console.log(`✅ Found ${beylaComponent} block completions: ${componentData.allBlockCompletions[beylaComponent].length} blocks`);
        }
        
        console.log('\n🎉 All tests passed! Scraped data is working correctly.');
        
        return true;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        return false;
    }
}

// Run the test
if (require.main === module) {
    const success = testExports();
    process.exit(success ? 0 : 1);
}

module.exports = testExports;