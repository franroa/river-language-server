#!/usr/bin/env python3
"""
Corrected scraper with proper required vs recommended logic
"""

import sys
import os
from typing import Dict, List

# Add the current directory to Python path so we can import the original scraper
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scrape_components import AlloyComponentScraper

class CorrectedAlloyComponentScraper(AlloyComponentScraper):
    """Corrected scraper with proper required vs recommended logic"""
    
    def _parse_usage_code_for_requirements(self, code_text: str, info: Dict):
        """Parse code examples to understand recommended structure (not required)"""
        lines = code_text.split('\n')
        current_block = None
        component_name = info['name']
        indent_level = 0
        block_stack = []
        in_component_block = False
        brace_count = 0

        print(f"    Parsing usage for component: {component_name}")

        for line_num, line in enumerate(lines):
            stripped_line = line.strip()

            # Skip comments and empty lines
            if not stripped_line or stripped_line.startswith('//') or stripped_line.startswith('#'):
                continue

            # Count braces to track nesting
            brace_count += stripped_line.count('{') - stripped_line.count('}')

            # Calculate indentation level (handle both spaces and tabs)
            current_indent = 0
            for char in line:
                if char in [' ', '\t']:
                    current_indent += 1 if char == '\t' else 1
                else:
                    break

            # Look for the main component declaration
            if stripped_line.startswith(component_name) and '{' in stripped_line:
                in_component_block = True
                brace_count = 1  # Reset brace count
                print(f"    Found component declaration: {stripped_line}")
                continue

            # Only process content inside the component block
            if not in_component_block:
                continue

            # Look for block definitions like "endpoint {" or "basic_auth {"
            if '{' in stripped_line and not stripped_line.startswith('"') and not stripped_line.startswith('<'):
                # Extract block name before '{'
                block_match = stripped_line.split('{')[0].strip()

                # Skip if this looks like a property assignment with block value
                if '=' in block_match or not block_match:
                    continue

                # Valid block name - should not contain special characters
                if (block_match and
                    not any(char in block_match for char in ['"', '<', '>', '=', '(', ')', '[', ']', '.', ':']) and
                    not block_match.startswith('stage.') and  # Skip processing stages
                    len(block_match.strip()) > 0):

                    current_block = block_match.strip()

                    # CORRECTED LOGIC: Usage examples show RECOMMENDED blocks, not required ones
                    # Only documentation tables should mark things as required
                    if current_block not in info['blocks']:
                        info['blocks'][current_block] = {
                            'description': f'Configuration block for {current_block}',
                            'required': False,  # Usage examples show recommended blocks
                            'recommended': True,  # Mark as recommended
                            'properties': {}
                        }
                        print(f"    Found new usage block: {current_block} (marked as recommended)")
                    else:
                        # Block exists from docs - don't override required status from documentation
                        # But mark as recommended since it appears in usage
                        if not info['blocks'][current_block].get('required', False):
                            info['blocks'][current_block]['recommended'] = True
                            print(f"    Found existing usage block: {current_block} (marked as recommended)")
                        else:
                            print(f"    Found existing usage block: {current_block} (keeping required status from docs)")

                    block_stack.append((current_block, current_indent))
                    indent_level = current_indent

            # Look for property assignments like 'url = "..."' or 'url = <URL>'
            elif '=' in stripped_line and current_block:
                prop_match = stripped_line.split('=')[0].strip()
                value_part = stripped_line.split('=', 1)[1].strip()

                # Clean up property name (remove placeholders and quotes)
                if prop_match and not prop_match.startswith('<') and not prop_match.startswith('"'):
                    # Check if this property belongs to the current block
                    # It's a property of the current block if we're inside a block and at the right indentation
                    if block_stack and current_indent > block_stack[-1][1]:
                        # This is a property of the current block
                        prop_type = self._infer_property_type(value_part)

                        # Add property to current block
                        if 'properties' not in info['blocks'][current_block]:
                            info['blocks'][current_block]['properties'] = {}

                        # CORRECTED LOGIC: Check if property was already defined from documentation
                        if prop_match in info['blocks'][current_block]['properties']:
                            # Property already exists from docs - don't override its required status
                            existing_prop = info['blocks'][current_block]['properties'][prop_match]
                            # Mark as recommended since it appears in usage, but don't override required
                            if not existing_prop.get('required', False):
                                existing_prop['recommended'] = True
                            # Update type if we have better info from usage
                            if not existing_prop.get('type') and prop_type:
                                existing_prop['type'] = prop_type
                            print(f"      Found usage property: {prop_match} (existing from docs)")
                        else:
                            # New property found only in usage examples - mark as recommended
                            info['blocks'][current_block]['properties'][prop_match] = {
                                'required': False,  # Usage examples show recommended properties
                                'recommended': True,  # Mark as recommended
                                'type': prop_type,
                                'description': f'{prop_match} configuration'
                            }
                            print(f"      Found new usage property: {prop_match} ({prop_type}) in {current_block} (marked as recommended)")

            # Handle block closing
            elif '}' in stripped_line:
                # Remove blocks from stack that are at or above current indentation
                while block_stack and block_stack[-1][1] >= current_indent:
                    popped_block = block_stack.pop()
                    print(f"    Closed block: {popped_block[0]}")

                if block_stack:
                    current_block = block_stack[-1][0]
                    indent_level = block_stack[-1][1]
                else:
                    current_block = None
                    indent_level = 0

                # If we're closing the main component block (brace count reaches 0)
                if brace_count <= 0:
                    in_component_block = False
                    print("    Exited component block")

    def generate_typescript_file(self, category: str, components: List) -> str:
        """Generate TypeScript file with corrected required vs recommended logic"""
        
        if not components:
            print(f"Warning: No components provided for category {category}")
            return ""
        
        print(f"Generating TypeScript for category {category} with {len(components)} components")
        
        # Start with imports and helper function
        content = '''import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver/node";

function createSnippet(
  label: string,
  kind: CompletionItemKind,
  insertText: string,
  documentation: string,
  detail: string,
): CompletionItem {
  return {
    label,
    kind,
    insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    documentation,
    detail,
  };
}

'''

        # Generate components array
        content += f"export const {category}Components: CompletionItem[] = [\n"
        
        for comp in components:
            name = comp.get('name', 'unknown')
            desc = comp.get('description', '') or f"Component for {name}"
            
            # Validate and sanitize component name
            if not self.validate_typescript_identifier(name):
                print(f"Warning: Invalid component name '{name}', sanitizing...")
                name = self.sanitize_component_name(name)
            
            # Clean and escape description
            desc_escaped = self.clean_and_escape_text(desc)
            
            try:
                # Generate snippet based on component structure
                snippet = self._generate_component_snippet(comp)
                # Escape the snippet for template literal
                snippet_escaped = self.escape_for_template_literal(snippet)
                
                content += f'''  createSnippet(
    "{name}",
    CompletionItemKind.Snippet,
    `{snippet_escaped}`,
    "{desc_escaped}",
    '"{name}" {{ ... }}',
  ),
'''
            except Exception as e:
                print(f"Error generating snippet for component '{name}': {e}")
                # Add a basic fallback snippet
                content += f'''  createSnippet(
    "{name}",
    CompletionItemKind.Snippet,
    `{name} "${{1:label}}" {{\\n\\t${{2:/* configuration */}}\\n}}`,
    "{desc_escaped}",
    '"{name}" {{ ... }}',
  ),
'''

        content += "];\n\n"

        # Generate required attributes - ONLY from documentation tables, not usage examples
        content += f"export const {category}RequiredAttributes: Record<string, string[]> = {{\n"
        
        for comp in components:
            name = comp['name']
            required_attrs = []
            
            # Only add attributes explicitly marked as required in documentation
            for attr in comp['required_attributes']:
                # Only add to required_attributes if it's NOT a block and truly required
                if attr not in comp['blocks']:
                    required_attrs.append(attr)
            
            # Add properties within blocks that are explicitly marked as required
            for block_name, block_info in comp['blocks'].items():
                if 'properties' in block_info:
                    for prop_name, prop_info in block_info['properties'].items():
                        if prop_info.get('required', False):
                            # Use block.property format for required properties within blocks
                            required_attrs.append(f"{block_name}.{prop_name}")
            
            if required_attrs:
                attrs = '", "'.join(required_attrs)
                content += f'  "{name}": ["{attrs}"],\n'
        
        content += "};\n\n"
        
        # Generate recommended attributes - from usage examples
        content += f"export const {category}RecommendedAttributes: Record<string, Record<string, string[]>> = {{\n"
        
        for comp in components:
            name = comp['name']
            has_recommendations = False
            
            # Check blocks that are recommended (from usage examples)
            recommended_blocks = []
            for block_name, block_info in comp['blocks'].items():
                if block_info.get('recommended', False) and not block_info.get('required', False):
                    recommended_blocks.append(block_name)
            
            # Check properties within blocks that are recommended
            for block_name, block_info in comp['blocks'].items():
                if 'properties' in block_info and block_info['properties']:
                    recommended_props = []
                    for prop_name, prop_info in block_info['properties'].items():
                        if prop_info.get('recommended', False) and not prop_info.get('required', False):
                            recommended_props.append(prop_name)
                    
                    if recommended_props:
                        if not has_recommendations:
                            content += f'  "{name}": {{\n'
                            has_recommendations = True
                        
                        props = '", "'.join(recommended_props)
                        content += f'    "{block_name}": ["{props}"],\n'
            
            # Add recommended blocks at the top level
            if recommended_blocks:
                if not has_recommendations:
                    content += f'  "{name}": {{\n'
                    has_recommendations = True
                
                blocks = '", "'.join(recommended_blocks)
                content += f'    "_blocks": ["{blocks}"],\n'
            
            if has_recommendations:
                content += '  },\n'
        
        content += "};\n\n"
        
        # Generate required blocks - ONLY those explicitly marked as required in documentation
        content += f"export const {category}RequiredBlocks: Record<string, string[]> = {{\n"
        
        for comp in components:
            name = comp['name']
            required_blocks = []
            
            # Only add blocks explicitly marked as required in documentation
            for block_name, block_info in comp['blocks'].items():
                if block_info.get('required', False):
                    required_blocks.append(block_name)
            
            if required_blocks:
                blocks = '", "'.join(required_blocks)
                content += f'  "{name}": ["{blocks}"],\n'
        
        content += "};\n\n"
        
        # Generate block completions with proper required/recommended/optional status
        content += f"export const {category}BlockCompletions: Record<string, CompletionItem[]> = {{\n"

        for comp in components:
            name = comp['name']
            if comp['blocks']:
                content += f'  "{name}": [\n'

                for block_name, block_info in comp['blocks'].items():
                    block_desc = self.clean_and_escape_text(block_info['description'])

                    # Generate block snippet
                    block_snippet = f'{block_name} {{\\n'
                    placeholder_num = 1
                    properties_added = 0

                    # Add required properties first
                    if 'properties' in block_info and block_info['properties']:
                        for prop_name, prop_info in block_info['properties'].items():
                            if prop_info.get('required', False):
                                prop_type = prop_info.get('type', 'string')
                                if 'url' in prop_name.lower():
                                    block_snippet += f'\\t{prop_name} = "${{{placeholder_num}:http://localhost:9090/api/v1/write}}"\\n'
                                elif 'endpoint' in prop_name.lower():
                                    block_snippet += f'\\t{prop_name} = "${{{placeholder_num}:http://localhost:8080}}"\\n'
                                elif prop_type == 'bool':
                                    block_snippet += f'\\t{prop_name} = ${{{placeholder_num}|true,false|}}\\n'
                                elif prop_type == 'int':
                                    block_snippet += f'\\t{prop_name} = ${{{placeholder_num}:0}}\\n'
                                elif prop_type == 'list':
                                    block_snippet += f'\\t{prop_name} = [${{{placeholder_num}:/* values */}}]\\n'
                                else:
                                    block_snippet += f'\\t{prop_name} = "${{{placeholder_num}:{prop_name}}}"\\n'
                                placeholder_num += 1
                                properties_added += 1

                    # If no required properties, add generic placeholder
                    if properties_added == 0:
                        block_snippet += f'\\t${{1:/* configuration */}}\\n'

                    block_snippet += '}'

                    # Escape for template literal
                    block_snippet_escaped = self.escape_for_template_literal(block_snippet)

                    # Determine status: required from docs, recommended from usage, or optional
                    if block_info.get('required', False):
                        status = 'required'
                    elif block_info.get('recommended', False):
                        status = 'recommended'
                    else:
                        status = 'optional'

                    content += f'''    createSnippet(
      "{block_name}",
      CompletionItemKind.Snippet,
      `{block_snippet_escaped}`,
      "{block_desc}",
      "{block_name} {{...}} - {status}",
    ),
'''

                content += "  ],\n"

        content += "};\n"

        return self.validate_and_fix_typescript_content(content, category)

if __name__ == "__main__":
    print("Using corrected scraper with proper required vs recommended logic")
    scraper = CorrectedAlloyComponentScraper()
    scraper.run()