/**
 * Simple integration test runner for the Alloy Language Server
 * Tests real-world scenarios without external dependencies
 */

import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver/node";
import { getDocumentDiagnostics, getWorkspaceDiagnostics } from "../diagnostics";
import { provideWorkspaceSymbols } from "../symbolProvider";
import { performanceManager } from "../performance";
import { configManager } from "../configuration";
import { relationshipAnalyzer } from "../componentRelationships";

export class IntegrationTestRunner {
    private testResults: { name: string; passed: boolean; error?: string; duration?: number }[] = [];

    async runAllTests(): Promise<void> {
        console.log("🚀 Starting Alloy LSP Integration Tests");
        console.log("=====================================");

        await this.testGrafanaAlloyConfig();
        await this.testMultiFileWorkspace();
        await this.testPerformanceWithLargeWorkspace();
        await this.testFuzzySymbolSearch();
        await this.testComponentRelationships();

        this.printResults();
    }

    private async testGrafanaAlloyConfig(): Promise<void> {
        const testName = "Grafana Alloy Configuration Validation";
        const startTime = Date.now();

        try {
            const grafanaConfig = this.getGrafanaAlloyConfig();
            const document = TextDocument.create(
                "file:///test/grafana.alloy",
                "alloy",
                1,
                grafanaConfig
            );

            const diagnostics = await getDocumentDiagnostics(document);
            const errors = diagnostics.filter(d => d.severity === 1);

            // Test passes if there are minimal errors (≤ 2 for complex config)
            const passed = errors.length <= 2;
            
            this.testResults.push({
                name: testName,
                passed,
                duration: Date.now() - startTime,
                error: passed ? undefined : `Too many errors: ${errors.length}`
            });

            console.log(`✓ ${testName}: ${errors.length} errors found`);
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`✗ ${testName}: ${error}`);
        }
    }

    private async testMultiFileWorkspace(): Promise<void> {
        const testName = "Multi-file Workspace Validation";
        const startTime = Date.now();

        try {
            const mainDoc = TextDocument.create(
                "file:///test/main.alloy",
                "alloy",
                1,
                this.getMainConfig()
            );

            const componentsDoc = TextDocument.create(
                "file:///test/components.alloy",
                "alloy",
                1,
                this.getComponentsConfig()
            );

            const mockDocuments = this.createMockDocuments([mainDoc, componentsDoc]);
            const workspaceDiagnostics = await getWorkspaceDiagnostics(mockDocuments);

            const totalDiagnostics = workspaceDiagnostics.reduce((sum, d) => sum + d.items.length, 0);
            const passed = totalDiagnostics <= 10; // Allow some diagnostics for complex setup

            this.testResults.push({
                name: testName,
                passed,
                duration: Date.now() - startTime,
                error: passed ? undefined : `Too many diagnostics: ${totalDiagnostics}`
            });

            console.log(`✓ ${testName}: ${totalDiagnostics} total diagnostics`);
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`✗ ${testName}: ${error}`);
        }
    }

    private async testPerformanceWithLargeWorkspace(): Promise<void> {
        const testName = "Large Workspace Performance";
        const startTime = Date.now();

        try {
            // Generate 30 mock files
            const documents: TextDocument[] = [];
            for (let i = 0; i < 30; i++) {
                const config = `
prometheus.scrape "app_${i}" {
    targets = [{__address__ = "localhost:${8000 + i}"}]
    forward_to = [prometheus.remote_write.default.receiver]
}

loki.source.file "logs_${i}" {
    targets = [{__path__ = "/app${i}/logs/*.log"}]
    forward_to = [loki.write.default.receiver]
}`;
                documents.push(TextDocument.create(
                    `file:///test/config${i}.alloy`,
                    "alloy",
                    1,
                    config
                ));
            }

            const mockDocuments = this.createMockDocuments(documents);
            const perfStartTime = Date.now();
            const workspaceDiagnostics = await performanceManager.getOptimizedWorkspaceDiagnostics(mockDocuments, []);
            const perfDuration = Date.now() - perfStartTime;

            // Should complete within 3 seconds for 30 files
            const passed = perfDuration < 3000;

            this.testResults.push({
                name: testName,
                passed,
                duration: Date.now() - startTime,
                error: passed ? undefined : `Too slow: ${perfDuration}ms`
            });

            const metrics = performanceManager.getMetrics();
            console.log(`✓ ${testName}: ${perfDuration}ms, cache hit ratio: ${(metrics.cacheHitRatio * 100).toFixed(1)}%`);
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`✗ ${testName}: ${error}`);
        }
    }

    private async testFuzzySymbolSearch(): Promise<void> {
        const testName = "Fuzzy Symbol Search";
        const startTime = Date.now();

        try {
            const document = TextDocument.create(
                "file:///test/symbols.alloy",
                "alloy",
                1,
                this.getGrafanaAlloyConfig()
            );

            const mockDocuments = this.createMockDocuments([document]);

            // Test fuzzy search
            const prometheusSymbols = await provideWorkspaceSymbols({ query: "prom" }, mockDocuments);
            const otelSymbols = await provideWorkspaceSymbols({ query: "otel" }, mockDocuments);

            const passed = prometheusSymbols.length > 0 && otelSymbols.length > 0;

            this.testResults.push({
                name: testName,
                passed,
                duration: Date.now() - startTime,
                error: passed ? undefined : "Fuzzy search returned no results"
            });

            console.log(`✓ ${testName}: Found ${prometheusSymbols.length} prometheus, ${otelSymbols.length} otel symbols`);
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`✗ ${testName}: ${error}`);
        }
    }

    private async testComponentRelationships(): Promise<void> {
        const testName = "Component Relationships";
        const startTime = Date.now();

        try {
            const document = TextDocument.create(
                "file:///test/relationships.alloy",
                "alloy",
                1,
                this.getGrafanaAlloyConfig()
            );

            const mockDocuments = this.createMockDocuments([document]);
            const hierarchy = await relationshipAnalyzer.analyzeWorkspace(mockDocuments);

            const passed = hierarchy.nodes.size > 5 && hierarchy.relationships.length > 0;

            this.testResults.push({
                name: testName,
                passed,
                duration: Date.now() - startTime,
                error: passed ? undefined : `Too few components/relationships: ${hierarchy.nodes.size}/${hierarchy.relationships.length}`
            });

            console.log(`✓ ${testName}: ${hierarchy.nodes.size} components, ${hierarchy.relationships.length} relationships`);
        } catch (error) {
            this.testResults.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`✗ ${testName}: ${error}`);
        }
    }

    private printResults(): void {
        console.log("\n📊 Test Results Summary");
        console.log("======================");

        const passed = this.testResults.filter(r => r.passed).length;
        const failed = this.testResults.filter(r => !r.passed).length;
        const totalTime = this.testResults.reduce((sum, r) => sum + (r.duration || 0), 0);

        for (const result of this.testResults) {
            const status = result.passed ? "✅ PASS" : "❌ FAIL";
            const duration = result.duration ? `(${result.duration}ms)` : "";
            console.log(`${status} ${result.name} ${duration}`);
            if (!result.passed && result.error) {
                console.log(`   Error: ${result.error}`);
            }
        }

        console.log(`\nSummary: ${passed} passed, ${failed} failed (${totalTime}ms total)`);

        if (failed > 0) {
            process.exit(1);
        }
    }

    private createMockDocuments(documents: TextDocument[]): TextDocuments<TextDocument> {
        return {
            all: () => documents,
            get: (uri: string) => documents.find(doc => doc.uri === uri),
            listen: () => {},
            onDidOpen: () => {},
            onDidClose: () => {},
            onDidChangeContent: () => {},
            onDidSave: () => {}
        } as unknown as TextDocuments<TextDocument>;
    }

    private getGrafanaAlloyConfig(): string {
        return `
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
}`;
    }

    private getMainConfig(): string {
        return `
import.file "components.alloy"

prometheus.scrape "main" {
    targets = prometheus.exporter.unix.system.targets
    forward_to = [prometheus.remote_write.default.receiver]
}

prometheus.remote_write "default" {
    endpoint {
        url = "http://prometheus:9090/api/v1/write"
    }
}`;
    }

    private getComponentsConfig(): string {
        return `
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
}`;
    }
}

// Entry point for running tests
if (require.main === module) {
    const runner = new IntegrationTestRunner();
    runner.runAllTests().catch(console.error);
}

export default IntegrationTestRunner;