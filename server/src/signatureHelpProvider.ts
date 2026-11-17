import {
  SignatureHelp,
  SignatureHelpParams,
  SignatureInformation,
  ParameterInformation,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as utils from "./utils";

/**
 * Get signature help for a component call
 */
function getComponentSignature(componentName: string, allComponentData: any): SignatureInformation | null {
  const componentData = allComponentData[componentName];
  if (!componentData) {
    return null;
  }

  let label = `${componentName}`;
  const parameters: ParameterInformation[] = [];

  // Add label parameter if component supports labels
  if (componentData.lsp_structure?.component) {
    label += ` "label"`;
    parameters.push({
      label: "label",
      documentation: "Component instance label"
    });
  }

  // Add block signature
  label += " { }";

  // Build signature information
  const signature: SignatureInformation = {
    label,
    documentation: componentData.usage || `${componentName} component`,
    parameters
  };

  return signature;
}

/**
 * Get signature help for a declared component
 */
function getDeclaredComponentSignature(componentName: string, document: TextDocument): SignatureInformation | null {
  const declaredComponents = utils.getDeclaredComponents(document);
  const componentData = declaredComponents[componentName];

  if (!componentData) {
    return null;
  }

  let label = `${componentName}`;
  const parameters: ParameterInformation[] = [];

  // Add label parameter
  label += ` "label"`;
  parameters.push({
    label: "label",
    documentation: "Component instance label"
  });

  // Add arguments as parameters
  const declareStructure = utils.extractDeclareStructure(componentData);
  if (declareStructure.arguments) {
    for (const [argName, argInfo] of Object.entries(declareStructure.arguments)) {
      const arg = argInfo as any;
      label += ` ${argName}`;
      parameters.push({
        label: argName,
        documentation: arg.description || `${argName} parameter`
      });
    }
  }

  // Add block signature
  label += " { }";

  const signature: SignatureInformation = {
    label,
    documentation: `Declared component: ${componentName}`,
    parameters
  };

  return signature;
}

/**
 * Get signature help for argument references
 */
function getArgumentSignature(argumentName: string, document: TextDocument): SignatureInformation | null {
  const declaredComponents = utils.getDeclaredComponents(document);

  // Find the argument in any declare block
  for (const componentData of Object.values(declaredComponents)) {
    const declareStructure = utils.extractDeclareStructure(componentData);
    if (declareStructure.arguments && declareStructure.arguments[argumentName]) {
      const argInfo = declareStructure.arguments[argumentName] as any;

      const label = `argument.${argumentName}.value`;
      const parameters: ParameterInformation[] = [];

      const signature: SignatureInformation = {
        label,
        documentation: `Reference to argument "${argumentName}"\n\nType: ${argInfo.type || 'unknown'}\nOptional: ${argInfo.optional !== false ? 'yes' : 'no'}\n${argInfo.comment || ''}`,
        parameters
      };

      return signature;
    }
  }

  return null;
}

/**
 * Check if cursor is in a position where signature help should be shown
 */
function getSignatureHelpContext(document: TextDocument, position: any): { componentName: string; argIndex: number; context: string } | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: position.character }
  });

  // Check if we're typing a component name followed by optional label
  // Pattern: component_name ["label"] { or component_name ["label"] <cursor>
  const componentPattern = /^(\w+(?:\.\w+)*)\s*(?:"[^"]*")?\s*(\{?\s*)?$/;
  const componentMatch = line.match(componentPattern);
  if (componentMatch) {
    return {
      componentName: componentMatch[1],
      argIndex: 0,
      context: 'component'
    };
  }

  // Check if we're inside a component block typing an argument
  // Pattern: argument_name = <cursor> or argument_name = argument.<cursor>
  const argumentPattern = /(\w+)\s*=\s*(argument\.\w*\.?\w*)?$/;
  const argumentMatch = line.match(argumentPattern);
  if (argumentMatch && argumentMatch[2]) {
    // We're typing argument.something.value
    const argParts = argumentMatch[2].split('.');
    if (argParts.length >= 2) {
      return {
        componentName: argParts[1], // The argument name
        argIndex: 0,
        context: 'argument'
      };
    }
  }

  return null;
}

export function provideSignatureHelp(
  params: SignatureHelpParams,
  documents: TextDocuments<TextDocument>
): SignatureHelp | null {
  // Use unified context manager
  const context = utils.ProviderContext.create(params, documents);
  if (!context) {
    return null;
  }

  // Check if we're in a position where signature help should be shown
  const signatureContext = getSignatureHelpContext(context.document, context.position);
  if (!signatureContext) {
    return null;
  }

  const { componentName, argIndex, context: helpContext } = signatureContext;

  // Get all available components
  const allComponentData = utils.getCachedWorkspaceComponents(documents);

  let signature: SignatureInformation | null = null;

  // Handle different contexts
  if (helpContext === 'argument') {
    // We're typing an argument reference like argument.something.value
    signature = getArgumentSignature(componentName, context.document);
  } else {
    // We're typing a component name
    // Check declared components first
    if (utils.isDeclaredComponent(context.document, componentName)) {
      signature = getDeclaredComponentSignature(componentName, context.document);
    } else {
      // Check regular components
      signature = getComponentSignature(componentName, allComponentData);
    }
  }

  if (!signature) {
    return null;
  }

  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter: Math.min(argIndex, signature.parameters ? signature.parameters.length - 1 : 0)
  };
}