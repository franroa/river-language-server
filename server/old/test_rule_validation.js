#!/usr/bin/env node

// Test script to verify that all relabel components have the correct rule properties

const { prometheusNestedBlockProperties } = require('../out/components/prometheus.js');
const { discoveryNestedBlockProperties } = require('../out/components/discovery.js');
const { lokiNestedBlockProperties } = require('../out/components/loki.js');
const { pyroscopeNestedBlockProperties } = require('../out/components/pyroscope.js');

const expectedProperties = [
  'action', 'source_labels', 'separator', 'target_label', 
  'regex', 'modulus', 'replacement', 'value'
];

const components = [
  { name: 'prometheus.relabel', properties: prometheusNestedBlockProperties },
  { name: 'discovery.relabel', properties: discoveryNestedBlockProperties },
  { name: 'loki.relabel', properties: lokiNestedBlockProperties },
  { name: 'pyroscope.relabel', properties: pyroscopeNestedBlockProperties }
];

console.log('Testing relabel rule properties validation...\n');

let allTestsPassed = true;

for (const component of components) {
  console.log(`Testing ${component.name}:`);
  
  const ruleProperties = component.properties[component.name]?.rule;
  
  if (!ruleProperties) {
    console.log(`  ❌ No rule properties found`);
    allTestsPassed = false;
    continue;
  }
  
  if (ruleProperties.length !== expectedProperties.length) {
    console.log(`  ❌ Expected ${expectedProperties.length} properties, got ${ruleProperties.length}`);
    allTestsPassed = false;
    continue;
  }
  
  const actualProperties = ruleProperties.map(prop => prop.label);
  const missingProperties = expectedProperties.filter(prop => !actualProperties.includes(prop));
  
  if (missingProperties.length > 0) {
    console.log(`  ❌ Missing properties: ${missingProperties.join(', ')}`);
    allTestsPassed = false;
    continue;
  }
  
  // Test specific property details
  const actionProperty = ruleProperties.find(prop => prop.label === 'action');
  if (actionProperty && actionProperty.insertText.includes('replace,keep,drop')) {
    console.log('  ✅ Action property has correct choices');
  } else {
    console.log('  ❌ Action property missing choices');
    allTestsPassed = false;
  }
  
  const targetLabelProperty = ruleProperties.find(prop => prop.label === 'target_label');
  if (targetLabelProperty && targetLabelProperty.documentation.includes('Label name to which')) {
    console.log('  ✅ Target label property has correct documentation');
  } else {
    console.log('  ❌ Target label property missing documentation');
    allTestsPassed = false;
  }
  
  console.log(`  ✅ Found all ${ruleProperties.length} expected properties\n`);
}

if (allTestsPassed) {
  console.log('🎉 All tests passed! The LSP will now validate rule properties correctly.');
} else {
  console.log('❌ Some tests failed. Check the output above.');
  process.exit(1);
}