import { addCommasToMapElements } from "./documentFormattingProvider";

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

console.log("=== ORIGINAL ===");
console.log(testContent);

const formatted = addCommasToMapElements(testContent);

console.log("\n=== FORMATTED ===");
console.log(formatted);

