"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const documentFormattingProvider_1 = require("./documentFormattingProvider");
// Test comma addition with map example
const testContent = `prometheus.scrape "test" {
  targets = [
    {
      url = "http://localhost:9090"
      timeout = "30s"
    }
  ]
  forward_to = [otelcol.receiver.prometheus.default.receiver]
}`;
console.log('=== ORIGINAL ===');
console.log(testContent);
const formatted = (0, documentFormattingProvider_1.addCommasToMapElements)(testContent);
console.log('\n=== FORMATTED ===');
console.log(formatted);
