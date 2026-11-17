import * as utils from './utils';

/**
 * Centralized component validation logic to eliminate duplication
 */
export class ComponentValidator {
  private static builtinComponents: Record<string, any> | null = null;

  /**
   * Get builtin components (cached for performance)
   */
  private static getBuiltinComponents(): Record<string, any> {
    if (!this.builtinComponents) {
      this.builtinComponents = utils.getAllComponentData();
    }
    return this.builtinComponents;
  }

  /**
   * Clear the builtin components cache (call when components are reloaded)
   */
  static clearCache(): void {
    this.builtinComponents = null;
  }

  /**
   * Check if a component name is valid (builtin or properly declared)
   */
  static isValidComponent(
    componentName: string, 
    componentData?: Record<string, any>
  ): boolean {
    // Check builtin components first
    const builtinComponents = this.getBuiltinComponents();
    const isBuiltinComponent = builtinComponents[componentName] !== undefined;
    
    if (isBuiltinComponent) {
      return true;
    }

    // Check if it's a properly declared component
    if (componentData && componentData[componentName]) {
      const componentInfo = componentData[componentName];
      return componentInfo.isDeclared === true && !!componentInfo.lsp_structure;
    }

    return false;
  }

  /**
   * Get component info, preferring builtin over declared
   */
  static getComponentInfo(
    componentName: string,
    componentData?: Record<string, any>
  ): any | null {
    // First check builtin components
    const builtinComponents = this.getBuiltinComponents();
    if (builtinComponents[componentName]) {
      return builtinComponents[componentName];
    }

    // Then check declared components
    if (componentData && componentData[componentName]) {
      const componentInfo = componentData[componentName];
      if (componentInfo.isDeclared === true && componentInfo.lsp_structure) {
        return componentInfo;
      }
    }

    return null;
  }

  /**
   * Check if a component is builtin (from JSON files)
   */
  static isBuiltinComponent(componentName: string): boolean {
    const builtinComponents = this.getBuiltinComponents();
    return builtinComponents[componentName] !== undefined;
  }

  /**
   * Check if a component is properly declared
   */
  static isDeclaredComponent(
    componentName: string,
    componentData?: Record<string, any>
  ): boolean {
    if (!componentData || !componentData[componentName]) {
      return false;
    }

    const componentInfo = componentData[componentName];
    return componentInfo.isDeclared === true && !!componentInfo.lsp_structure;
  }

  /**
   * Get all builtin component names
   */
  static getBuiltinComponentNames(): string[] {
    const builtinComponents = this.getBuiltinComponents();
    return Object.keys(builtinComponents);
  }

  /**
   * Get component validation error message
   */
  static getUnknownComponentMessage(componentName: string): string {
    return `Unknown component '${componentName}'`;
  }

  /**
   * Validate component type reference (used in references like component.type.label)
   */
  static validateComponentTypeReference(
    componentType: string,
    componentData?: Record<string, any>
  ): { isValid: boolean; isBuiltin: boolean; isDeclared: boolean } {
    const isBuiltin = this.isBuiltinComponent(componentType);
    const isDeclared = this.isDeclaredComponent(componentType, componentData);
    const isValid = isBuiltin || isDeclared;

    return {
      isValid,
      isBuiltin,
      isDeclared
    };
  }
}