/**
 * Enhanced Testing Framework for Unified Managers
 * Comprehensive testing utilities for DRY refactored codebase
 */

import { TextDocument } from "vscode-languageserver-textdocument";
import { Position, Range, Location, TextDocuments } from "vscode-languageserver/node";
import * as utils from "./utils";

/**
 * Test Suite Builder for Provider Testing
 */
export class TestSuiteBuilder {
  private tests: TestCase[] = [];
  private setup: (() => Promise<void>) | null = null;
  private teardown: (() => Promise<void>) | null = null;

  /**
   * Add setup function
   */
  setUp(setupFn: () => Promise<void>): TestSuiteBuilder {
    this.setup = setupFn;
    return this;
  }

  /**
   * Add teardown function
   */
  tearDown(teardownFn: () => Promise<void>): TestSuiteBuilder {
    this.teardown = teardownFn;
    return this;
  }

  /**
   * Add test case
   */
  addTest(name: string, testFn: () => Promise<void>): TestSuiteBuilder {
    this.tests.push({ name, testFn });
    return this;
  }

  /**
   * Execute all tests
   */
  async run(suiteName: string): Promise<TestResults> {
    console.log(`\n🧪 Running Test Suite: ${suiteName}`);
    console.log("=".repeat(50));

    const results: TestResults = {
      suiteName,
      totalTests: this.tests.length,
      passed: 0,
      failed: 0,
      errors: []
    };

    // Setup
    if (this.setup) {
      try {
        await this.setup();
      } catch (error) {
        console.error(`❌ Setup failed: ${error}`);
        return results;
      }
    }

    // Run tests
    for (const test of this.tests) {
      try {
        await test.testFn();
        console.log(`✅ ${test.name}`);
        results.passed++;
      } catch (error) {
        console.error(`❌ ${test.name}: ${error}`);
        results.failed++;
        results.errors.push({ testName: test.name, error: String(error) });
      }
    }

    // Teardown
    if (this.teardown) {
      try {
        await this.teardown();
      } catch (error) {
        console.error(`⚠️  Teardown warning: ${error}`);
      }
    }

    // Results summary
    console.log("\n📊 Test Results:");
    console.log(`Total: ${results.totalTests}, Passed: ${results.passed}, Failed: ${results.failed}`);
    
    if (results.failed === 0) {
      console.log("🎉 All tests passed!");
    } else {
      console.log("❌ Some tests failed");
    }

    return results;
  }
}

/**
 * Mock Document Factory for Testing
 */
export class MockDocumentFactory {
  /**
   * Create a mock TextDocument
   */
  static createDocument(uri: string, content: string): TextDocument {
    return TextDocument.create(uri, 'alloy', 1, content);
  }

  /**
   * Create mock documents collection
   */
  static createDocuments(documentSpecs: Array<{ uri: string; content: string }>): TextDocuments<TextDocument> {
    const docs = documentSpecs.map(spec => this.createDocument(spec.uri, spec.content));
    
    return {
      all: () => docs,
      get: (uri: string) => docs.find(doc => doc.uri === uri) || null,
      onDidChangeContent: () => ({ dispose: () => {} }),
      onDidClose: () => ({ dispose: () => {} }),
      onDidOpen: () => ({ dispose: () => {} }),
      onDidSave: () => ({ dispose: () => {} }),
      onWillSave: () => ({ dispose: () => {} }),
      listen: () => {},
      keys: () => docs.map(doc => doc.uri),
      version: 1
    } as any;
  }

  /**
   * Create test scenario for workspace references
   */
  static createWorkspaceReferenceScenario(): {
    documents: TextDocuments<TextDocument>;
    workspaceFolders: string[];
  } {
    const documents = this.createDocuments([
      {
        uri: "file:///test1.alloy",
        content: `otelcol.processor.attributes "default" {
  output {
    traces = [otelcol.processor.transform.defaultaa.input]
  }
}`
      },
      {
        uri: "file:///test2.alloy", 
        content: `otelcol.receiver.otlp "default" {
  output {
    traces = [otelcol.processor.attributes.default.input]
  }
}`
      }
    ]);

    return {
      documents,
      workspaceFolders: ["/test"]
    };
  }
}

/**
 * Assertion Utilities for Testing
 */
export class TestAssertions {
  /**
   * Assert that a value is not null or undefined
   */
  static assertNotNull<T>(value: T | null | undefined, message?: string): asserts value is T {
    if (value === null || value === undefined) {
      throw new Error(message || "Expected value to not be null or undefined");
    }
  }

  /**
   * Assert that a value equals expected
   */
  static assertEqual<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  /**
   * Assert that an array has expected length
   */
  static assertLength<T>(array: T[], expectedLength: number, message?: string): void {
    if (array.length !== expectedLength) {
      throw new Error(message || `Expected array length ${expectedLength}, got ${array.length}`);
    }
  }

  /**
   * Assert that a value is truthy
   */
  static assertTrue(value: any, message?: string): void {
    if (!value) {
      throw new Error(message || "Expected value to be truthy");
    }
  }

  /**
   * Assert that a promise resolves
   */
  static async assertResolves<T>(promise: Promise<T>, message?: string): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      throw new Error(message || `Expected promise to resolve, but it rejected with: ${error}`);
    }
  }

  /**
   * Assert that locations contain references in specific files
   */
  static assertReferencesInFiles(
    references: Location[],
    expectedFiles: string[],
    message?: string
  ): void {
    const foundFiles = new Set(references.map(ref => ref.uri));
    for (const expectedFile of expectedFiles) {
      if (!Array.from(foundFiles).some(found => found.includes(expectedFile))) {
        throw new Error(message || `Expected references in ${expectedFile}, but not found`);
      }
    }
  }
}

/**
 * Performance Testing Utilities
 */
export class PerformanceTester {
  /**
   * Measure execution time of a function
   */
  static async measureTime<T>(
    operation: () => Promise<T>,
    label: string
  ): Promise<{ result: T; timeMs: number }> {
    const startTime = performance.now();
    const result = await operation();
    const timeMs = performance.now() - startTime;
    
    console.log(`⏱️  ${label}: ${timeMs.toFixed(2)}ms`);
    return { result, timeMs };
  }

  /**
   * Run benchmark comparison
   */
  static async benchmark<T>(
    operations: Array<{ name: string; fn: () => Promise<T> }>,
    iterations: number = 100
  ): Promise<BenchmarkResults> {
    const results: BenchmarkResults = {
      operations: [],
      winner: ""
    };

    console.log(`\n🏁 Running benchmark (${iterations} iterations)...`);

    for (const op of operations) {
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const { timeMs } = await this.measureTime(op.fn, `${op.name} #${i + 1}`);
        times.push(timeMs);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      results.operations.push({
        name: op.name,
        avgTime,
        minTime,
        maxTime,
        times
      });

      console.log(`📊 ${op.name}: Avg ${avgTime.toFixed(2)}ms, Min ${minTime.toFixed(2)}ms, Max ${maxTime.toFixed(2)}ms`);
    }

    // Find winner (lowest average time)
    const winner = results.operations.reduce((best, current) => 
      current.avgTime < best.avgTime ? current : best
    );
    results.winner = winner.name;

    console.log(`🏆 Winner: ${winner.name}`);
    return results;
  }
}

// Type definitions
interface TestCase {
  name: string;
  testFn: () => Promise<void>;
}

interface TestResults {
  suiteName: string;
  totalTests: number;
  passed: number;
  failed: number;
  errors: Array<{ testName: string; error: string }>;
}

interface BenchmarkResults {
  operations: Array<{
    name: string;
    avgTime: number;
    minTime: number;
    maxTime: number;
    times: number[];
  }>;
  winner: string;
}

/**
 * Unified Manager Test Suite
 * Comprehensive tests for all DRY refactored components
 */
export class UnifiedManagerTests {
  /**
   * Run all unified manager tests
   */
  static async runAllTests(): Promise<void> {
    // Test PositionFactory
    await new TestSuiteBuilder()
      .addTest("PositionFactory.position creates valid positions", async () => {
        const pos = utils.PositionFactory?.position(5, 10);
        TestAssertions.assertNotNull(pos);
        TestAssertions.assertEqual(pos?.line, 5);
        TestAssertions.assertEqual(pos?.character, 10);
      })
      .addTest("PositionFactory.range creates valid ranges", async () => {
        const range = utils.PositionFactory?.range(1, 2, 3, 4);
        TestAssertions.assertNotNull(range);
        TestAssertions.assertEqual(range?.start.line, 1);
        TestAssertions.assertEqual(range?.end.line, 3);
      })
      .run("PositionFactory Tests");

    // Test ErrorHandler
    await new TestSuiteBuilder()
      .addTest("ErrorHandler handles provider errors gracefully", async () => {
        const result = utils.ErrorHandler?.handleProviderError("TestProvider", "Test error");
        TestAssertions.assertEqual(result, null);
      })
      .addTest("ErrorHandler.safeExecute catches errors", async () => {
        const result = await utils.ErrorHandler?.safeExecute(
          async () => { throw new Error("Test error"); },
          "TestProvider",
          "fallback"
        );
        TestAssertions.assertEqual(result, "fallback");
      })
      .run("ErrorHandler Tests");

    // Test PerformanceOptimizer
    await new TestSuiteBuilder()
      .addTest("PerformanceOptimizer.memoize caches results", async () => {
        let callCount = 0;
        const memoizedFn = utils.PerformanceOptimizer?.memoize(
          (x: number) => { callCount++; return x * 2; },
          (x: number) => `key_${x}`,
          1000
        );
        
        if (memoizedFn) {
          const result1 = memoizedFn(5);
          const result2 = memoizedFn(5);
          TestAssertions.assertEqual(result1, 10);
          TestAssertions.assertEqual(result2, 10);
          TestAssertions.assertEqual(callCount, 1); // Should only be called once due to memoization
        }
      })
      .run("PerformanceOptimizer Tests");

    // Integration test
    await new TestSuiteBuilder()
      .addTest("Workspace reference detection still works", async () => {
        const scenario = MockDocumentFactory.createWorkspaceReferenceScenario();
        const references = await utils.getReferences(
          scenario.documents,
          "otelcol.processor.attributes",
          "default",
          scenario.workspaceFolders
        );
        
        TestAssertions.assertNotNull(references);
        TestAssertions.assertTrue(references!.length > 0);
        TestAssertions.assertReferencesInFiles(references!, ["test1.alloy", "test2.alloy"]);
      })
      .run("Integration Tests");

    console.log("\n🎯 All Unified Manager Tests Complete!");
  }
}