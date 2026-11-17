// Simple test to check if diagnostics work for missing blocks
const fs = require('fs');

// Mock text document
const testContent = `prometheus.remote_write "example" {

}`;

// Check if required blocks are defined
try {
  const componentData = require('./components/prometheus.js');
  console.log("Checking prometheus required blocks...");
  
  if (componentData.prometheusRequiredBlocks) {
    console.log("Required blocks found:", Object.keys(componentData.prometheusRequiredBlocks));
    const remoteWriteBlocks = componentData.prometheusRequiredBlocks["prometheus.remote_write"];
    if (remoteWriteBlocks) {
      console.log("prometheus.remote_write required blocks:", remoteWriteBlocks);
    } else {
      console.log("No prometheus.remote_write required blocks found");
    }
  } else {
    console.log("No prometheusRequiredBlocks export found");
  }
} catch (err) {
  console.log("Error loading prometheus component data:", err.message);
}

console.log("Test completed");