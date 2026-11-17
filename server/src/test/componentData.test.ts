import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { getAllComponentData, isKnownComponent } from "../utils";

// Compiled to out/test, JSON data is read from src/components
const componentsDir = path.join(__dirname, "..", "..", "src", "components");
const nonComponentFiles = new Set(["known_types.json"]);

const componentFiles = fs
  .readdirSync(componentsDir)
  .filter((f) => f.endsWith(".json") && !nonComponentFiles.has(f));

describe("scraped component JSON files", () => {
  for (const file of componentFiles) {
    it(`${file} is well formed`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(componentsDir, file), "utf8"));
      assert.equal(typeof data.name, "string");
      assert.equal(data.name.replace(/\./g, "_"), file.replace(/\.json$/, ""));
      assert.ok(
        (data.arguments?.length ?? 0) + (data.blocks?.length ?? 0) > 0,
        "expected at least one argument or block"
      );
    });
  }
});

describe("component registry", () => {
  const registry = getAllComponentData();

  it("loads every component JSON file", () => {
    for (const file of componentFiles) {
      const name = JSON.parse(fs.readFileSync(path.join(componentsDir, file), "utf8")).name;
      assert.ok(registry[name], `${name} missing from registry`);
      assert.ok(isKnownComponent(name), `${name} not reported as known`);
    }
  });

  it("does not report unknown components as known", () => {
    assert.equal(isKnownComponent("foo.bar"), false);
  });

  // Components added after the initial scrape (grafana.com/docs/alloy/latest/reference/components/)
  it("includes recently documented components", () => {
    for (const name of [
      "discovery.aws",
      "otelcol.processor.redaction",
      "otelcol.receiver.nginx",
      "prometheus.echo",
      "prometheus.enrich",
      "pyroscope.enrich",
    ]) {
      assert.ok(isKnownComponent(name), `${name} should be known`);
    }
  });
});

// Opt-in because it needs network access: ALLOY_DOCS_COVERAGE=1 npm test
describe("coverage of the Alloy documentation", { skip: !process.env.ALLOY_DOCS_COVERAGE }, () => {
  it("has a JSON file for every component listed in the docs", async () => {
    const res = await fetch("https://grafana.com/docs/alloy/latest/reference/components/");
    assert.ok(res.ok, `docs fetch failed: ${res.status}`);
    const html = await res.text();

    const documented = new Set<string>();
    for (const m of html.matchAll(/\/docs\/alloy\/latest\/reference\/components\/[a-z0-9_]+\/([a-z0-9_.-]+)\/?/g)) {
      documented.add(m[1].replace(/[.-]/g, "_"));
    }
    assert.ok(documented.size > 100, `only found ${documented.size} documented components`);

    const local = new Set(componentFiles.map((f) => f.replace(/\.json$/, "")));
    const missing = [...documented].filter((n) => !local.has(n)).sort();
    assert.deepEqual(missing, [], `components in the docs but not scraped: ${missing.join(", ")}`);
  });
});
