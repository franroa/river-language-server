// Test script to verify nested block completion
const { findNestedBlockContext } = require('./utils.ts');

const testText = `prometheus.remote_write "label" {
	endpoint {
		// Cursor should be here
	}
}`;

const offset = testText.indexOf('// Cursor should be here');
console.log('Test text:', testText);
console.log('Offset:', offset);

const context = findNestedBlockContext(testText, offset);
console.log('Nested block context:', context);