/**
 * Component relationship tracking and hierarchy visualization
 */

import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments, DocumentSymbol, SymbolKind, Range, Position, Connection } from "vscode-languageserver/node";
import * as utils from "./utils";

export interface ComponentNode {
    id: string;
    name: string;
    type: string;
    label?: string;
    uri: string;
    range: Range;
    children: ComponentNode[];
    parents: ComponentNode[];
    relationships: ComponentRelationship[];
}

export interface ComponentRelationship {
    type: 'references' | 'exports_to' | 'imports_from' | 'declares' | 'implements';
    target: string; // Component ID
    context?: string; // Additional context about the relationship
    range?: Range; // Location where relationship is defined
}

export interface ComponentHierarchy {
    roots: ComponentNode[]; // Top-level components (no parents)
    nodes: Map<string, ComponentNode>;
    relationships: ComponentRelationship[];
}

/**
 * Component relationship analyzer
 */
export class ComponentRelationshipAnalyzer {
    private hierarchy: ComponentHierarchy;
    private connection?: Connection;

    constructor(connection?: Connection) {
        this.connection = connection;
        this.hierarchy = {
            roots: [],
            nodes: new Map(),
            relationships: []
        };
    }

    /**
     * Analyze all components in workspace and build relationship hierarchy
     */
    async analyzeWorkspace(documents: TextDocuments<TextDocument>): Promise<ComponentHierarchy> {
        this.reset();

        const startTime = Date.now();
        this.connection?.console.log("Analyzing component relationships in workspace...");

        // First pass: Collect all components
        for (const document of documents.all()) {
            await this.collectComponents(document);
        }

        // Second pass: Analyze relationships
        for (const document of documents.all()) {
            await this.analyzeDocumentRelationships(document);
        }

        // Third pass: Build hierarchy
        this.buildHierarchy();

        const duration = Date.now() - startTime;
        this.connection?.console.log(`Component relationship analysis completed in ${duration}ms. Found ${this.hierarchy.nodes.size} components with ${this.hierarchy.relationships.length} relationships`);

        return this.hierarchy;
    }
    
    /**
     * Get hierarchical symbols for document outline with enhanced relationships
     */
    getHierarchicalSymbols(document: TextDocument, documents?: TextDocuments<TextDocument>): DocumentSymbol[] {
        const symbols: DocumentSymbol[] = [];

        try {
            // If we haven't analyzed the workspace yet and have access to documents, analyze it
            if (documents && this.hierarchy.nodes.size === 0) {
                this.connection?.console.log("No workspace analysis found, analyzing for hierarchical symbols...");
                // Note: This is synchronous for now, but ideally should be async
                // For now, we'll analyze just the current document
                this.collectComponents(document);
                this.analyzeDocumentRelationships(document);
                this.buildHierarchy();
            }

            const documentComponents = this.getDocumentComponents(document);
            const configBlocks = utils.parseConfigBlocks(document);

            // Create root level symbols with enhanced hierarchy
            for (const component of documentComponents) {
                const componentSymbol = this.createComponentSymbolWithHierarchy(component);
                symbols.push(componentSymbol);
            }

            // Add config blocks with their relationships
            for (const configBlock of configBlocks) {
                const configSymbol = this.createConfigBlockSymbolWithHierarchy(configBlock, document);
                symbols.push(configSymbol);
            }

            // Sort symbols by hierarchy level and dependencies
            symbols.sort((a, b) => this.compareSymbolsByHierarchy(a, b));

        } catch (error) {
            console.warn(`Error creating hierarchical symbols for ${document.uri}: ${error}`);
        }

        return symbols;
    }

    /**
     * Create a component symbol with full hierarchy information
     */
    private createComponentSymbolWithHierarchy(component: ComponentNode): DocumentSymbol {
        const componentSymbol: DocumentSymbol = {
            name: `${component.type} "${component.label || 'unnamed'}"`,
            kind: SymbolKind.Class,
            range: component.range,
            selectionRange: component.range,
            children: []
        };

        // Add component properties and arguments as children
        const componentDetails = this.getComponentDetails(component);
        componentSymbol.children!.push(...componentDetails);

        // Add relationships as children with enhanced information
        const relationships = this.getComponentRelationships(component.id);
        for (const rel of relationships) {
            const targetNode = this.hierarchy.nodes.get(rel.target);
            if (targetNode && rel.range) {
                const relationshipSymbol = this.createRelationshipSymbol(rel, targetNode);
                componentSymbol.children!.push(relationshipSymbol);
            }
        }

        // Add dependency information
        const dependencies = this.getDependencyGraph(component.id);
        if (dependencies.dependencies.length > 0 || dependencies.dependents.length > 0) {
            const dependencySymbol = this.createDependencySymbol(dependencies);
            componentSymbol.children!.push(dependencySymbol);
        }

        return componentSymbol;
    }

    /**
     * Create a config block symbol with hierarchy
     */
    private createConfigBlockSymbolWithHierarchy(configBlock: any, document: TextDocument): DocumentSymbol {
        let symbolKind: SymbolKind;
        switch (configBlock.type) {
            case 'declare':
                symbolKind = SymbolKind.Function;
                break;
            case 'argument':
                symbolKind = SymbolKind.Property;
                break;
            case 'export':
                symbolKind = SymbolKind.Field;
                break;
            default:
                symbolKind = SymbolKind.Object;
        }

        const configSymbol: DocumentSymbol = {
            name: configBlock.label ? `${configBlock.type} "${configBlock.label}"` : configBlock.type,
            kind: symbolKind,
            range: configBlock.range,
            selectionRange: configBlock.range,
            children: []
        };

        // Add config block details
        const configDetails = this.getConfigBlockDetails(configBlock, document);
        configSymbol.children!.push(...configDetails);

        return configSymbol;
    }

    /**
     * Create a relationship symbol with detailed information
     */
    private createRelationshipSymbol(relationship: ComponentRelationship, targetNode: ComponentNode): DocumentSymbol {
        const relationshipName = `${relationship.type}: ${targetNode.name}`;
        const relationshipSymbol: DocumentSymbol = {
            name: relationshipName,
            kind: this.getSymbolKindForRelationship(relationship.type),
            range: relationship.range!,
            selectionRange: relationship.range!,
            children: []
        };

        // Add relationship context if available
        if (relationship.context) {
            relationshipSymbol.children!.push({
                name: `Context: ${relationship.context}`,
                kind: SymbolKind.String,
                range: relationship.range!,
                selectionRange: relationship.range!
            });
        }

        return relationshipSymbol;
    }

    /**
     * Create a dependency overview symbol
     */
    private createDependencySymbol(dependencies: { dependencies: string[]; dependents: string[] }): DocumentSymbol {
        const dependencySymbol: DocumentSymbol = {
            name: 'Dependencies',
            kind: SymbolKind.Namespace,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            children: []
        };

        // Add dependencies
        if (dependencies.dependencies.length > 0) {
            dependencySymbol.children!.push({
                name: `Depends on: ${dependencies.dependencies.join(', ')}`,
                kind: SymbolKind.Interface,
                range: dependencySymbol.range,
                selectionRange: dependencySymbol.range
            });
        }

        // Add dependents
        if (dependencies.dependents.length > 0) {
            dependencySymbol.children!.push({
                name: `Used by: ${dependencies.dependents.join(', ')}`,
                kind: SymbolKind.Interface,
                range: dependencySymbol.range,
                selectionRange: dependencySymbol.range
            });
        }

        return dependencySymbol;
    }

    /**
     * Get detailed component information
     */
    private getComponentDetails(component: ComponentNode): DocumentSymbol[] {
        const details: DocumentSymbol[] = [];

        // Add component type information
        details.push({
            name: `Type: ${component.type}`,
            kind: SymbolKind.String,
            range: component.range,
            selectionRange: component.range
        });

        // Add label information if available
        if (component.label) {
            details.push({
                name: `Label: ${component.label}`,
                kind: SymbolKind.String,
                range: component.range,
                selectionRange: component.range
            });
        }

        return details;
    }

    /**
     * Get detailed config block information
     */
    private getConfigBlockDetails(configBlock: any, document: TextDocument): DocumentSymbol[] {
        const details: DocumentSymbol[] = [];

        // Parse config block content for arguments and values
        try {
            const content = document.getText(configBlock.range);
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.includes('=')) {
                    const [key, value] = line.split('=').map(s => s.trim());
                    if (key && value) {
                        details.push({
                            name: `${key}: ${value}`,
                            kind: SymbolKind.Property,
                            range: {
                                start: { line: configBlock.range.start.line + i, character: 0 },
                                end: { line: configBlock.range.start.line + i, character: line.length }
                            },
                            selectionRange: {
                                start: { line: configBlock.range.start.line + i, character: 0 },
                                end: { line: configBlock.range.start.line + i, character: line.length }
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.warn(`Error parsing config block details: ${error}`);
        }

        return details;
    }

    /**
     * Compare symbols by hierarchy level for sorting
     */
    private compareSymbolsByHierarchy(a: DocumentSymbol, b: DocumentSymbol): number {
        // Sort by symbol kind priority
        const getKindPriority = (kind: SymbolKind): number => {
            switch (kind) {
                case SymbolKind.Class: return 1;      // Components first
                case SymbolKind.Function: return 2;   // Functions second
                case SymbolKind.Property: return 3;   // Properties third
                case SymbolKind.Field: return 4;      // Fields fourth
                case SymbolKind.Object: return 5;     // Objects last
                default: return 99;
            }
        };

        const aPriority = getKindPriority(a.kind);
        const bPriority = getKindPriority(b.kind);

        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }

        // Then sort alphabetically
        return a.name.localeCompare(b.name);
    }
    
    /**
     * Get component dependency graph
     */
    getDependencyGraph(componentId: string): { dependencies: string[]; dependents: string[] } {
        const node = this.hierarchy.nodes.get(componentId);
        if (!node) {
            return { dependencies: [], dependents: [] };
        }
        
        const dependencies: string[] = [];
        const dependents: string[] = [];
        
        // Find dependencies (components this node references)
        for (const rel of node.relationships) {
            if (rel.type === 'references' || rel.type === 'imports_from') {
                dependencies.push(rel.target);
            }
        }
        
        // Find dependents (components that reference this node)
        for (const [id, otherNode] of this.hierarchy.nodes) {
            for (const rel of otherNode.relationships) {
                if (rel.target === componentId && (rel.type === 'references' || rel.type === 'imports_from')) {
                    dependents.push(id);
                }
            }
        }
        
        return { dependencies, dependents };
    }
    
    private reset() {
        this.hierarchy = {
            roots: [],
            nodes: new Map(),
            relationships: []
        };
    }
    
    private async collectComponents(document: TextDocument) {
        try {
            const components = utils.parseDocument(document);
            const configBlocks = utils.parseConfigBlocks(document);
            
            // Add regular components
            for (const component of components) {
                const id = this.generateComponentId(document.uri, component.name, component.label);
                const node: ComponentNode = {
                    id,
                    name: component.name,
                    type: component.name,
                    label: component.label,
                    uri: document.uri,
                    range: component.range,
                    children: [],
                    parents: [],
                    relationships: []
                };
                
                this.hierarchy.nodes.set(id, node);
            }
            
            // Add declare blocks as special components
            for (const configBlock of configBlocks) {
                if (configBlock.type === 'declare' && configBlock.label) {
                    const id = this.generateComponentId(document.uri, 'declare', configBlock.label);
                    const node: ComponentNode = {
                        id,
                        name: `declare.${configBlock.label}`,
                        type: 'declare',
                        label: configBlock.label,
                        uri: document.uri,
                        range: configBlock.range,
                        children: [],
                        parents: [],
                        relationships: []
                    };
                    
                    this.hierarchy.nodes.set(id, node);
                }
            }
            
        } catch (error) {
            console.warn(`Error collecting components from ${document.uri}: ${error}`);
        }
    }
    
    private async analyzeDocumentRelationships(document: TextDocument) {
        try {
            // Get all component data for reference validation
            const allComponentData = utils.getAllAvailableComponents(document);
            
            // Find component references in this document
            const componentMatches = utils.parseComponentReferencesInDocument(document, allComponentData);
            
            for (const match of componentMatches) {
                if (match.isValidReference) {
                    // Find the referencing component (component that contains this reference)
                    const referencingComponent = this.findComponentAtLine(document, match.lineIndex);
                    if (referencingComponent) {
                        const relationship: ComponentRelationship = {
                            type: 'references',
                            target: this.generateComponentId(document.uri, match.componentType, match.componentLabel),
                            context: `References ${match.componentType}.${match.componentLabel}`,
                            range: Range.create(
                                Position.create(match.lineIndex, match.matchIndex),
                                Position.create(match.lineIndex, match.matchIndex + match.matchedText.length)
                            )
                        };
                        
                        referencingComponent.relationships.push(relationship);
                        this.hierarchy.relationships.push(relationship);
                    }
                }
            }
            
        } catch (error) {
            console.warn(`Error analyzing relationships in ${document.uri}: ${error}`);
        }
    }
    
    private buildHierarchy() {
        // Identify root components (no parents/dependencies)
        for (const [id, node] of this.hierarchy.nodes) {
            const hasIncomingReferences = this.hierarchy.relationships.some(rel => 
                rel.target === id && rel.type === 'references'
            );
            
            if (!hasIncomingReferences) {
                this.hierarchy.roots.push(node);
            }
        }
        
        // Build parent-child relationships
        for (const relationship of this.hierarchy.relationships) {
            const sourceNodeId = this.findRelationshipSource(relationship);
            const targetNode = this.hierarchy.nodes.get(relationship.target);
            const sourceNode = this.hierarchy.nodes.get(sourceNodeId || '');
            
            if (sourceNode && targetNode && relationship.type === 'references') {
                if (!sourceNode.children.find(child => child.id === targetNode.id)) {
                    sourceNode.children.push(targetNode);
                }
                if (!targetNode.parents.find(parent => parent.id === sourceNode.id)) {
                    targetNode.parents.push(sourceNode);
                }
            }
        }
    }
    
    private getDocumentComponents(document: TextDocument): ComponentNode[] {
        const documentComponents: ComponentNode[] = [];
        
        for (const node of this.hierarchy.nodes.values()) {
            if (node.uri === document.uri) {
                documentComponents.push(node);
            }
        }
        
        return documentComponents;
    }
    
    private getComponentRelationships(componentId: string): ComponentRelationship[] {
        const node = this.hierarchy.nodes.get(componentId);
        return node?.relationships || [];
    }
    
    private getSymbolKindForRelationship(relationshipType: string): SymbolKind {
        switch (relationshipType) {
            case 'references':
                return SymbolKind.Interface;
            case 'exports_to':
                return SymbolKind.Event;
            case 'imports_from':
                return SymbolKind.TypeParameter;
            case 'declares':
                return SymbolKind.Function;
            case 'implements':
                return SymbolKind.Class;
            default:
                return SymbolKind.Object;
        }
    }
    
    private generateComponentId(uri: string, type: string, label?: string): string {
        const fileName = uri.split('/').pop() || uri;
        return `${fileName}:${type}:${label || 'unnamed'}`;
    }
    
    private findComponentAtLine(document: TextDocument, lineIndex: number): ComponentNode | undefined {
        for (const node of this.hierarchy.nodes.values()) {
            if (node.uri === document.uri &&
                lineIndex >= node.range.start.line &&
                lineIndex <= node.range.end.line) {
                return node;
            }
        }
        return undefined;
    }
    
    private findRelationshipSource(relationship: ComponentRelationship): string | undefined {
        // Find which component contains this relationship
        for (const [id, node] of this.hierarchy.nodes) {
            if (node.relationships.includes(relationship)) {
                return id;
            }
        }
        return undefined;
    }
}

// Global instance for reuse - will be initialized with connection when needed
let _relationshipAnalyzer: ComponentRelationshipAnalyzer | null = null;

export function getRelationshipAnalyzer(connection?: Connection): ComponentRelationshipAnalyzer {
    if (!_relationshipAnalyzer) {
        _relationshipAnalyzer = new ComponentRelationshipAnalyzer(connection);
    }
    return _relationshipAnalyzer;
}

// For backward compatibility
export const relationshipAnalyzer = {
    analyzeWorkspace: (documents: TextDocuments<TextDocument>) => {
        const analyzer = getRelationshipAnalyzer();
        return analyzer.analyzeWorkspace(documents);
    },
    getHierarchicalSymbols: (document: TextDocument) => {
        const analyzer = getRelationshipAnalyzer();
        return analyzer.getHierarchicalSymbols(document);
    }
};