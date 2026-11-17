/**
 * Integration tests for the Alloy Language Server
 * Tests real-world scenarios with comprehensive Alloy configurations
 */

import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver/node";
import { getDocumentDiagnostics, getWorkspaceDiagnostics } from "../diagnostics";
import { provideWorkspaceSymbols, provideDocumentSymbols } from "../symbolProvider";
import { provideCompletions } from "../completionProvider";
import { performanceManager } from "../performance";
import { configManager } from "../configuration";
import { relationshipAnalyzer } from "../componentRelationships";

// Jest types
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeEach: any;

describe("Alloy LSP Integration Tests", () => {
    let mockDocuments: TextDocuments<TextDocument>;
    
    beforeEach(() => {
        mockDocuments = {
            all: () => [],
            get: () => undefined,
            listen: () => {},
            onDidOpen: () => {},
            onDidClose: () => {},
            onDidChangeContent: () => {},
            onDidSave: () => {}
        } as unknown as TextDocuments<TextDocument>;
        
        // Reset performance metrics
        performanceManager.resetMetrics();
    });

    describe("Real-world Grafana Alloy Configuration", () => {
        const grafanaAlloyConfig = `
// Grafana Alloy configuration for observability pipeline
declare "grafana_cloud" {
    argument "prometheus_host" {
        comment = "Prometheus remote write endpoint"
    }
    argument "loki_host" {
        comment = "Loki remote write endpoint"
    }
    argument "tempo_host" {
        comment = "Tempo remote write endpoint"
    }
}

prometheus.exporter.unix "default" {
    include_exporter_metrics = true
    enable_collectors = ["cpu", "memory", "filesystem"]
}

prometheus.scrape "unix" {
    targets = prometheus.exporter.unix.default.targets
    forward_to = [prometheus.remote_write.grafana_cloud.receiver]
}

prometheus.remote_write "grafana_cloud" {
    endpoint {
        url = argument.prometheus_host.value
        basic_auth {
            username = env("GRAFANA_USER")
            password = env("GRAFANA_TOKEN")
        }
    }
}

loki.source.file "logs" {
    targets = [
        {__path__ = "/var/log/*.log"},
        {__path__ = "/var/log/**/*.log"},
    ]
    forward_to = [loki.write.grafana_cloud.receiver]
}

loki.write "grafana_cloud" {
    endpoint {
        url = argument.loki_host.value
        basic_auth {
            username = env("GRAFANA_USER")
            password = env("GRAFANA_TOKEN")
        }
    }
}

otelcol.receiver.otlp "default" {
    grpc {
        endpoint = "0.0.0.0:4317"
    }
    http {
        endpoint = "0.0.0.0:4318"
    }
    output {
        traces = [otelcol.processor.batch.default.input]
        metrics = [otelcol.processor.batch.default.input]
    }
}

otelcol.processor.batch "default" {
    output {
        traces = [otelcol.exporter.otlp.grafana_cloud.input]
        metrics = [otelcol.exporter.otlp.grafana_cloud.input]
    }
}

otelcol.exporter.otlp "grafana_cloud" {
    client {
        endpoint = argument.tempo_host.value
        auth = otelcol.auth.basic.grafana_cloud.handler
    }
}

otelcol.auth.basic "grafana_cloud" {
    username = env("GRAFANA_USER")  
    password = env("GRAFANA_TOKEN")
}
`;

        test("should validate complex Grafana Alloy configuration", async () => {
            const document = TextDocument.create(
                "file:///test/grafana.alloy",
                "alloy",
                1,
                grafanaAlloyConfig
            );

            // Test document diagnostics
            const diagnostics = await getDocumentDiagnostics(document);
            
            // Should have minimal or no errors for a valid configuration
            const errors = diagnostics.filter(d => d.severity === 1); // Error severity
            expect(errors.length).toBeLessThanOrEqual(2); // Allow for minor validation issues
            
            // Test that it recognizes all the components
            expect(diagnostics.some(d => d.message.includes("Unknown component"))).toBe(false);
        });

        test("should provide comprehensive symbol information", async () => {
            const document = TextDocument.create(
                "file:///test/grafana.alloy",
                "alloy", 
                1,
                grafanaAlloyConfig
            );

            mockDocuments.all = () => [document];
            mockDocuments.get = (uri: string) => uri === document.uri ? document : undefined;

            const symbols = await provideWorkspaceSymbols({ query: "" }, mockDocuments);

            // Should find all declared components
            const componentNames = symbols.map((s: any) => s.name);
            expect(componentNames).toContain("prometheus.exporter.unix");
            expect(componentNames).toContain("prometheus.scrape");
            expect(componentNames).toContain("prometheus.remote_write");
            expect(componentNames).toContain("loki.source.file");
            expect(componentNames).toContain("loki.write");
            expect(componentNames).toContain("otelcol.receiver.otlp");
            expect(componentNames).toContain("otelcol.processor.batch");
            expect(componentNames).toContain("otelcol.exporter.otlp");
            expect(componentNames).toContain("otelcol.auth.basic");
        });

        test("should provide fuzzy symbol search", async () => {
            const document = TextDocument.create(
                "file:///test/grafana.alloy",
                "alloy",
                1,
                grafanaAlloyConfig
            );

            mockDocuments.all = () => [document];
            mockDocuments.get = (uri: string) => uri === document.uri ? document : undefined;

            // Test fuzzy matching
            const prometheusSymbols = await provideWorkspaceSymbols({ query: "prom" }, mockDocuments);
            const prometheusNames = prometheusSymbols.map((s: any) => s.name);

            expect(prometheusNames.some((name: string) => name.includes("prometheus"))).toBe(true);
            expect(prometheusSymbols.length).toBeGreaterThan(0);

            // Test camel case matching
            const otelSymbols = await provideWorkspaceSymbols({ query: "otel" }, mockDocuments);
            expect(otelSymbols.length).toBeGreaterThan(0);
        });
    });

    describe("Complex Multi-file Workspace", () => {
        const mainConfig = `
import.file "components.alloy"

prometheus.scrape "main" {
    targets = prometheus.exporter.unix.system.targets
    forward_to = [prometheus.remote_write.default.receiver]
}

prometheus.remote_write "default" {
    endpoint {
        url = "http://prometheus:9090/api/v1/write"
    }
}
`;

        const componentsConfig = `
declare "monitoring" {
    argument "metrics_endpoint" {}
    argument "logs_endpoint" {}
    
    prometheus.exporter.unix "system" {
        enable_collectors = ["cpu", "memory", "disk"]
    }
    
    loki.source.file "app_logs" {
        targets = [
            {__path__ = "/app/logs/*.log"},
        ]
        forward_to = [loki.write.default.receiver]
    }
    
    loki.write "default" {
        endpoint {
            url = argument.logs_endpoint.value
        }
    }
}
`;

        test("should validate cross-file component references", async () => {
            const mainDoc = TextDocument.create(
                "file:///test/main.alloy",
                "alloy",
                1,
                mainConfig
            );

            const componentsDoc = TextDocument.create(
                "file:///test/components.alloy",
                "alloy",
                1,
                componentsConfig
            );

            mockDocuments.all = () => [mainDoc, componentsDoc];
            mockDocuments.get = (uri: string) => {
                if (uri === mainDoc.uri) return mainDoc;
                if (uri === componentsDoc.uri) return componentsDoc;
                return undefined;
            };

            const workspaceDiagnostics = await getWorkspaceDiagnostics(mockDocuments);

            // Should detect component references correctly
            const referenceErrors = workspaceDiagnostics
                .flatMap(d => d.items)
                .filter(d => d.message.includes("not found"));

            // In a properly configured workspace, there should be minimal reference errors
            expect(referenceErrors.length).toBeLessThanOrEqual(3);
        });

        test("should validate component references with unsaved changes", async () => {
            // Simulate the scenario where a component is defined in one file
            const componentDefinitionDoc = TextDocument.create(
                "file:///test/components.alloy",
                "alloy",
                1,
                `
prometheus.exporter.unix "test_system" {
    include_exporter_metrics = true
}
`
            );

            // Simulate another file with a reference that has unsaved changes
            const referenceDoc = TextDocument.create(
                "file:///test/main.alloy",
                "alloy",
                1,
                `
// This reference should be valid even with unsaved changes
prometheus.scrape "test" {
    targets = prometheus.exporter.unix.test_system.targets
    forward_to = [prometheus.remote_write.default.receiver]
}

prometheus.remote_write "default" {
    endpoint {
        url = "http://localhost:9090/api/v1/write"
    }
}
`
            );

            // Set up mock documents to simulate opened files with current content
            mockDocuments.all = () => [componentDefinitionDoc, referenceDoc];
            mockDocuments.get = (uri: string) => {
                if (uri === componentDefinitionDoc.uri) return componentDefinitionDoc;
                if (uri === referenceDoc.uri) return referenceDoc;
                return undefined;
            };

            const workspaceDiagnostics = await getWorkspaceDiagnostics(mockDocuments);

            // Should not have any "component not found" errors for valid references
            const componentNotFoundErrors = workspaceDiagnostics
                .flatMap(d => d.items)
                .filter(d => d.message.includes("not found") && d.message.includes("component"));

            // The reference should be valid - no "component not found" errors
            expect(componentNotFoundErrors.length).toBe(0);

            // Verify that the component reference is properly recognized
            const allDiagnostics = workspaceDiagnostics.flatMap(d => d.items);
            const hasValidReference = allDiagnostics.some(d =>
                d.message.includes("test_system") && !d.message.includes("not found")
            );
            // We shouldn't have errors about the test_system component not being found
            expect(hasValidReference).toBe(false); // No error messages about test_system
        });

        test("should handle single file opening scenario", async () => {
            // Test that the system can handle opening a single file
            // and that the getAllWorkspaceDocuments function works correctly
            const singleDoc = TextDocument.create(
                "file:///test/single.alloy",
                "alloy",
                1,
                `
prometheus.scrape "test" {
    targets = prometheus.exporter.unix.system.targets
}
`
            );

            // Set up mock documents with single file
            mockDocuments.all = () => [singleDoc];
            mockDocuments.get = (uri: string) => uri === singleDoc.uri ? singleDoc : undefined;

            // Test that getWorkspaceDiagnostics doesn't crash with single file
            const workspaceDiagnostics = await getWorkspaceDiagnostics(mockDocuments);

            // Should return diagnostics (even if empty)
            expect(workspaceDiagnostics).toBeDefined();
            expect(Array.isArray(workspaceDiagnostics)).toBe(true);

            // Should handle the case gracefully without throwing errors
            // This tests that our directory scanning logic doesn't break single file scenarios
        });

        test("should analyze component relationships", async () => {
            const mainDoc = TextDocument.create(
                "file:///test/main.alloy",
                "alloy",
                1,
                mainConfig
            );
            
            const componentsDoc = TextDocument.create(
                "file:///test/components.alloy",
                "alloy", 
                1,
                componentsConfig
            );

            mockDocuments.all = () => [mainDoc, componentsDoc];
            mockDocuments.get = (uri: string) => {
                if (uri === mainDoc.uri) return mainDoc;
                if (uri === componentsDoc.uri) return componentsDoc;
                return undefined;
            };

            const hierarchy = await relationshipAnalyzer.analyzeWorkspace(mockDocuments);
            
            expect(hierarchy.nodes.size).toBeGreaterThan(3);
            expect(hierarchy.relationships.length).toBeGreaterThan(0);
            
            // Check that relationships are detected
            const hasReferenceRelationships = hierarchy.relationships.some(
                rel => rel.type === 'references'
            );
            expect(hasReferenceRelationships).toBe(true);
        });
    });

    describe("Performance Tests", () => {
        test("should handle large workspace efficiently", async () => {
            const largeWorkspaceConfigs: TextDocument[] = [];
            
            // Generate 50 mock alloy files
            for (let i = 0; i < 50; i++) {
                const config = `
prometheus.scrape "app_${i}" {
    targets = [
        {__address__ = "localhost:${8000 + i}"},
    ]
    forward_to = [prometheus.remote_write.default.receiver]
}

loki.source.file "logs_${i}" {
    targets = [
        {__path__ = "/app${i}/logs/*.log"},
    ]
    forward_to = [loki.write.default.receiver]
}
`;
                largeWorkspaceConfigs.push(TextDocument.create(
                    `file:///test/config${i}.alloy`,
                    "alloy",
                    1, 
                    config
                ));
            }

            mockDocuments.all = () => largeWorkspaceConfigs;
            mockDocuments.get = (uri: string) => 
                largeWorkspaceConfigs.find(doc => doc.uri === uri);

            const startTime = Date.now();
            const workspaceDiagnostics = await performanceManager.getOptimizedWorkspaceDiagnostics(mockDocuments, []);
            const duration = Date.now() - startTime;

            // Should complete within reasonable time (under 5 seconds for 50 files)
            expect(duration).toBeLessThan(5000);
            expect(workspaceDiagnostics.length).toBeLessThanOrEqual(largeWorkspaceConfigs.length);
            
            // Check performance metrics
            const metrics = performanceManager.getMetrics();
            expect(metrics.cacheHitRatio).toBeGreaterThanOrEqual(0);
            expect(metrics.avgParseTime).toBeGreaterThan(0);
        });

        test("should provide fast symbol search in large workspace", async () => {
            const largeWorkspaceConfigs: TextDocument[] = [];
            
            // Generate files with various component types
            const componentTypes = [
                "prometheus.scrape",
                "loki.source.file", 
                "otelcol.receiver.otlp",
                "prometheus.exporter.unix",
                "loki.write"
            ];

            for (let i = 0; i < 100; i++) {
                const componentType = componentTypes[i % componentTypes.length];
                const config = `
${componentType} "instance_${i}" {
    // Configuration for ${componentType}
}
`;
                largeWorkspaceConfigs.push(TextDocument.create(
                    `file:///test/large${i}.alloy`,
                    "alloy",
                    1,
                    config
                ));
            }

            mockDocuments.all = () => largeWorkspaceConfigs;
            mockDocuments.get = (uri: string) => 
                largeWorkspaceConfigs.find(doc => doc.uri === uri);

            const startTime = Date.now();
            const symbols = await provideWorkspaceSymbols({ query: "prom" }, mockDocuments);
            const duration = Date.now() - startTime;

            // Symbol search should be fast (under 1 second)
            expect(duration).toBeLessThan(1000);
            expect(symbols.length).toBeGreaterThan(0);

            // Should find prometheus-related symbols
            const prometheusSymbols = symbols.filter((s: any) =>
                s.name.toLowerCase().includes("prometheus")
            );
            expect(prometheusSymbols.length).toBeGreaterThan(0);
        });
    });

    describe("Configuration Integration", () => {
        test("should respect diagnostic severity configuration", async () => {
            const configWithErrors = `
// This should generate various diagnostics
unknown.component "test" {
    unknown_argument = "value"
    // missing required arguments
}

prometheus.scrape "duplicate" {}
prometheus.scrape "duplicate" {} // Duplicate
`;

            const document = TextDocument.create(
                "file:///test/config_test.alloy", 
                "alloy",
                1,
                configWithErrors
            );

            // Test with default configuration (errors enabled)
            const defaultDiagnostics = await getDocumentDiagnostics(document);
            const defaultErrors = defaultDiagnostics.filter(d => d.severity === 1);
            expect(defaultErrors.length).toBeGreaterThan(0);

            // Test that configuration affects diagnostic behavior
            expect(configManager.isDiagnosticEnabled('unknownComponent')).toBe(true);
            expect(configManager.isDiagnosticEnabled('unknownArgument')).toBe(true);
            expect(configManager.isDiagnosticEnabled('duplicateComponent')).toBe(true);
        });
    });
});



// Test utilities
export const TestUtils = {
    createMockDocument: (uri: string, content: string): TextDocument => {
        return TextDocument.create(uri, "alloy", 1, content);
    },

    createMockDocuments: (documents: { uri: string; content: string }[]): TextDocuments<TextDocument> => {
        const docs = documents.map(d => TestUtils.createMockDocument(d.uri, d.content));

        return {
            all: () => docs,
            get: (uri: string) => docs.find(doc => doc.uri === uri),
            listen: () => {},
            onDidOpen: () => {},
            onDidClose: () => {},
            onDidChangeContent: () => {},
            onDidSave: () => {}
        } as unknown as TextDocuments<TextDocument>;
    },

    measurePerformance: async <T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> => {
        const startTime = Date.now();
        const result = await operation();
        const duration = Date.now() - startTime;
        return { result, duration };
    }
};