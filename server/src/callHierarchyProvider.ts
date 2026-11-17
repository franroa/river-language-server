import {
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  CallHierarchyPrepareParams,
  CallHierarchyIncomingCallsParams,
  CallHierarchyOutgoingCallsParams,
  TextDocuments,
  SymbolKind,
  Range,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

/**
 * Component reference information for call hierarchy
 */
interface ComponentReference {
  componentType: string;
  componentLabel: string;
  location: {
    uri: string;
    range: Range;
  };
  // References to other components (outgoing calls)
  references: Array<{
    targetType: string;
    targetLabel: string;
    referenceRange: Range;
    connectionType: 'forward_to' | 'scrape_targets' | 'export' | 'receiver' | 'other';
  }>;
  // Components that reference this one (incoming calls) - computed during analysis
  referencedBy: Array<{
    sourceType: string;
    sourceLabel: string;
    sourceRange: Range;
    sourceUri: string;
    connectionType: 'forward_to' | 'scrape_targets' | 'export' | 'receiver' | 'other';
  }>;
}

// Cache for component relationships to avoid recomputing
let componentRelationshipCache: Map<string, ComponentReference> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30000; // 30 seconds

/**
 * Parse all components and their relationships in the workspace
 */
async function analyzeComponentRelationships(documents: TextDocuments<TextDocument>): Promise<Map<string, ComponentReference>> {
  // Use cache if it's still valid
  const now = Date.now();
  if (componentRelationshipCache && (now - cacheTimestamp) < CACHE_TTL) {
    return componentRelationshipCache;
  }
  
  const componentMap = new Map<string, ComponentReference>();
  
  try {
    // First pass: collect all components
    for (const document of documents.all()) {
      try {
        const components = utils.parseAllComponents(document);
        
        for (const component of components) {
          try {
            const componentKey = `${component.name}.${component.label || 'unnamed'}`;
            const componentRef: ComponentReference = {
              componentType: component.name,
              componentLabel: component.label || 'unnamed',
              location: {
                uri: document.uri,
                range: component.range,
              },
              references: [],
              referencedBy: [],
            };
            
            // Parse component content to find references
            const content = document.getText(component.range);
            const references = parseComponentReferences(content, component, document);
            componentRef.references = references;
            
            componentMap.set(componentKey, componentRef);
          } catch (error) {
            console.error(`Error processing component ${component.name}:`, error);
            // Continue with next component
          }
        }
      } catch (error) {
        console.error(`Error parsing document ${document.uri}:`, error);
        // Continue with next document
      }
    }
    
    // Second pass: build reverse references (incoming calls)
    for (const [componentKey, component] of componentMap.entries()) {
      try {
        for (const reference of component.references) {
          const targetKey = `${reference.targetType}.${reference.targetLabel}`;
          const targetComponent = componentMap.get(targetKey);
          
          if (targetComponent) {
            targetComponent.referencedBy.push({
              sourceType: component.componentType,
              sourceLabel: component.componentLabel,
              sourceRange: component.location.range,
              sourceUri: component.location.uri,
              connectionType: reference.connectionType,
            });
          }
        }
      } catch (error) {
        console.error(`Error building reverse references for ${componentKey}:`, error);
        // Continue with next component
      }
    }
  } catch (error) {
    console.error('Critical error in analyzeComponentRelationships:', error);
    // Return partial results if available
  }
  
  // Update cache
  componentRelationshipCache = componentMap;
  cacheTimestamp = now;
  
  return componentMap;
}

/**
 * Parse references within a component's content
 */
function parseComponentReferences(
  content: string,
  component: utils.ParsedComponent,
  document: TextDocument
): Array<{
  targetType: string;
  targetLabel: string;
  referenceRange: Range;
  connectionType: 'forward_to' | 'scrape_targets' | 'export' | 'receiver' | 'other';
}> {
  const references: Array<{
    targetType: string;
    targetLabel: string;
    referenceRange: Range;
    connectionType: 'forward_to' | 'scrape_targets' | 'export' | 'receiver' | 'other';
  }> = [];
  
  const lines = content.split('\n');
  let currentLineOffset = component.range.start.line;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Pattern 1: Array references (e.g., traces = [otelcol.processor.transform.default.input])
    const arrayRefMatch = line.match(/(\w+)\s*=\s*\[([^\]]+)\]/);
    if (arrayRefMatch) {
      const [, property, refsContent] = arrayRefMatch;
      const componentRefs = refsContent.split(',').map(ref => ref.trim());
      
      for (const ref of componentRefs) {
        const componentMatch = ref.match(/(\w+(?:\.\w+)*)\.([\w_]+)\.(\w+)/);
        if (componentMatch) {
          const [, componentType, componentLabel] = componentMatch;
          
          let connectionType: 'forward_to' | 'scrape_targets' | 'export' | 'receiver' | 'other' = 'other';
          if (property === 'forward_to') connectionType = 'forward_to';
          else if (property === 'targets') connectionType = 'scrape_targets';
          else if (property.includes('receiver')) connectionType = 'receiver';
          else if (property.includes('export')) connectionType = 'export';
          else if (property === 'traces' || property === 'metrics' || property === 'logs') connectionType = 'other';
          
          const startChar = line.indexOf(ref);
          if (startChar !== -1) {
            references.push({
              targetType: componentType,
              targetLabel: componentLabel,
              referenceRange: Range.create(
                Position.create(currentLineOffset + i, startChar),
                Position.create(currentLineOffset + i, startChar + ref.length)
              ),
              connectionType,
            });
          }
        }
      }
    }
    
    // Pattern 2: Direct component references (e.g., targets = prometheus.scrape.app.targets)
    const directRefMatch = line.match(/(\w+)\s*=\s*(\w+(?:\.\w+)*)\.([\w_]+)\.(\w+)/);
    if (directRefMatch) {
      const [, property, componentType, componentLabel] = directRefMatch;
      
      let connectionType: 'forward_to' | 'scrape_targets' | 'export' | 'receiver' | 'other' = 'other';
      if (property === 'targets') connectionType = 'scrape_targets';
      else if (property.includes('receiver')) connectionType = 'receiver';
      else if (property.includes('export')) connectionType = 'export';
      
      const startChar = line.indexOf(`${componentType}.${componentLabel}`);
      if (startChar !== -1) {
        references.push({
          targetType: componentType,
          targetLabel: componentLabel,
          referenceRange: Range.create(
            Position.create(currentLineOffset + i, startChar),
            Position.create(currentLineOffset + i, startChar + `${componentType}.${componentLabel}`.length)
          ),
          connectionType,
        });
      }
    }
    
    // Pattern 3: Argument references in declare blocks
    const argRefMatch = line.match(/argument\.(\w+)\.value/);
    if (argRefMatch && component.scope) {
      // This is a reference to an argument, which may resolve to another component
      // We'll handle this in a more sophisticated way by tracking argument types
      // For now, skip these as they're more complex to resolve
    }
  }
  
  return references;
}

/**
 * Prepare call hierarchy by finding the component at the given position
 */
export function prepareCallHierarchy(
  params: CallHierarchyPrepareParams,
  documents: TextDocuments<TextDocument>
): CallHierarchyItem[] | null {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    
    // Find the component at the cursor position
    const components = utils.parseAllComponents(document);
    const targetComponent = utils.findParsedComponentAtPosition(components, params.position);
    
    if (!targetComponent) {
      return null;
    }
    
    // Create call hierarchy item
    const hierarchyItem: CallHierarchyItem = {
      name: `${targetComponent.name}.${targetComponent.label}`,
      kind: getComponentSymbolKind(targetComponent.name),
      detail: targetComponent.name,
      uri: document.uri,
      range: targetComponent.range,
      selectionRange: targetComponent.range,
    };
    
    return [hierarchyItem];
  } catch (error) {
    console.error('Error in prepareCallHierarchy:', error);
    return null;
  }
}

/**
 * Get incoming calls for a component (who calls this component)
 */
export async function getIncomingCalls(
  params: CallHierarchyIncomingCallsParams,
  documents: TextDocuments<TextDocument>
): Promise<CallHierarchyIncomingCall[]> {
  try {
    const componentMap = await analyzeComponentRelationships(documents);
    
    // Extract component info from the hierarchy item
    const componentName = params.item.name;
    const [componentType, componentLabel] = componentName.split('.');
    
    if (!componentType || !componentLabel) {
      return [];
    }
    
    const componentKey = componentName;
    const targetComponent = componentMap.get(componentKey);
    
    if (!targetComponent) {
      return [];
    }
  
    const incomingCalls: CallHierarchyIncomingCall[] = [];
    
    for (const reference of targetComponent.referencedBy) {
      const fromItem: CallHierarchyItem = {
        name: `${reference.sourceType}.${reference.sourceLabel}`,
        kind: getComponentSymbolKind(reference.sourceType),
        detail: reference.sourceType,
        uri: reference.sourceUri,
        range: reference.sourceRange,
        selectionRange: reference.sourceRange,
      };
      
      // Find the specific ranges where this component is referenced
      const fromRanges: Range[] = [];
      
      // Get the source component to find reference locations
      const sourceKey = `${reference.sourceType}.${reference.sourceLabel}`;
      const sourceComponent = componentMap.get(sourceKey);
      if (sourceComponent) {
        for (const ref of sourceComponent.references) {
          if (ref.targetType === componentType && ref.targetLabel === componentLabel) {
            fromRanges.push(ref.referenceRange);
          }
        }
      }
      
      if (fromRanges.length === 0) {
        // Fallback to component range if we can't find specific reference
        fromRanges.push(reference.sourceRange);
      }
      
      incomingCalls.push({
        from: fromItem,
        fromRanges: fromRanges,
      });
    }
    
    return incomingCalls;
  } catch (error) {
    console.error('Error in getIncomingCalls:', error);
    return [];
  }
}

/**
 * Get outgoing calls from a component (who does this component call)
 */
export async function getOutgoingCalls(
  params: CallHierarchyOutgoingCallsParams,
  documents: TextDocuments<TextDocument>
): Promise<CallHierarchyOutgoingCall[]> {
  try {
    const componentMap = await analyzeComponentRelationships(documents);
  
  // Extract component info from the hierarchy item
  const componentName = params.item.name;
  const [componentType, componentLabel] = componentName.split('.');
  
  if (!componentType || !componentLabel) {
    return [];
  }
  
  const componentKey = componentName;
  const sourceComponent = componentMap.get(componentKey);
  
  if (!sourceComponent) {
    return [];
  }
  
  const outgoingCalls: CallHierarchyOutgoingCall[] = [];
  
  for (const reference of sourceComponent.references) {
    // Find target component
    const targetKey = `${reference.targetType}.${reference.targetLabel}`;
    const targetComponent = componentMap.get(targetKey);
    
    if (targetComponent) {
      const toItem: CallHierarchyItem = {
        name: `${reference.targetType}.${reference.targetLabel}`,
        kind: getComponentSymbolKind(reference.targetType),
        detail: reference.targetType,
        uri: targetComponent.location.uri,
        range: targetComponent.location.range,
        selectionRange: targetComponent.location.range,
      };
      
      outgoingCalls.push({
        to: toItem,
        fromRanges: [reference.referenceRange],
      });
    }
  }
    
    return outgoingCalls;
  } catch (error) {
    console.error('Error in getOutgoingCalls:', error);
    return [];
  }
}

/**
 * Get appropriate symbol kind for component type
 */
function getComponentSymbolKind(componentType: string): SymbolKind {
  // Map component types to appropriate symbol kinds
  if (componentType.includes('scrape')) return SymbolKind.Method;
  if (componentType.includes('write') || componentType.includes('remote_write')) return SymbolKind.Function;
  if (componentType.includes('exporter')) return SymbolKind.Interface;
  if (componentType.includes('processor')) return SymbolKind.Class;
  if (componentType.includes('receiver')) return SymbolKind.Event;
  if (componentType.includes('discovery')) return SymbolKind.Property;
  if (componentType.includes('auth')) return SymbolKind.Key;
  
  // Default mapping
  if (componentType.startsWith('prometheus')) return SymbolKind.Module;
  if (componentType.startsWith('loki')) return SymbolKind.Module;
  if (componentType.startsWith('otelcol')) return SymbolKind.Module;
  if (componentType.startsWith('local')) return SymbolKind.File;
  
  return SymbolKind.Object;
}