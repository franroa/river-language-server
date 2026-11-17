#!/usr/bin/env python3
"""
Grafana Alloy Component Scraper
Scrapes component documentation from https://grafana.com/docs/alloy/latest/reference/components/
and generates TypeScript completion files for the Language Server.
"""

import requests
import re
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import os
import time
from typing import Dict, List, Tuple, Optional
import json
import sys

class AlloyComponentScraper:
    def __init__(self):
        self.base_url = "https://grafana.com/docs/alloy/latest/reference/components/"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Linux; x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.components_data = {}
        self.delay = 1  # Delay between requests to be respectful

    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch a page and return BeautifulSoup object"""
        try:
            print(f"Fetching: {url}")
            response = self.session.get(url)
            response.raise_for_status()
            time.sleep(self.delay)
            return BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    def get_component_categories(self) -> List[str]:
        """Get list of component categories from main components page"""
        soup = self.fetch_page(self.base_url)
        if not soup:
            return []

        categories = []
        # Look for component category links in the navigation or content
        links = soup.find_all('a', href=re.compile(r'/reference/components/[^/]+/$'))
        for link in links:
            href = link.get('href')
            if href:
                # Extract category name from URL
                match = re.search(r'/reference/components/([^/]+)/$', href)
                if match:
                    category = match.group(1)
                    if category not in categories:
                        categories.append(category)

        # Also look for categories in the main content
        content_links = soup.find_all('a', href=re.compile(r'/docs/alloy/latest/reference/components/[^/]+/$'))
        for link in content_links:
            href = link.get('href')
            if href:
                match = re.search(r'/reference/components/([^/]+)/$', href)
                if match:
                    category = match.group(1)
                    if category not in categories:
                        categories.append(category)

        return sorted(list(set(categories)))

    def get_components_in_category(self, category: str) -> List[str]:
        """Get list of components in a category"""
        category_url = urljoin(self.base_url, f"{category}/")
        soup = self.fetch_page(category_url)
        if not soup:
            return []

        components = []
        # Look for component links within the category
        links = soup.find_all('a', href=re.compile(rf'/reference/components/{category}/[^/]+/$'))
        for link in links:
            href = link.get('href')
            if href:
                # Extract component name from URL
                match = re.search(rf'/reference/components/{category}/([^/]+)/$', href)
                if match:
                    component = match.group(1)
                    if component not in components:
                        components.append(component)

        return components

    def extract_component_info(self, category: str, component_name: str) -> Dict:
        """Extract detailed information about a component"""
        component_url = urljoin(self.base_url, f"{category}/{component_name}/")

        soup = self.fetch_page(component_url)
        if not soup:
            return {}

        info = {
            'name': component_name,
            'category': category,
            'description': '',
            'arguments': {},
            'exports': {},
            'examples': [],
            'required_attributes': [],
            'blocks': {},  # Add blocks for nested configurations
            'conditional_requirements': {}  # Store conditional requirements with their contexts
        }

        # Extract description from the page
        main_content = soup.find('main') or soup.find('article') or soup.find('div', class_='content')
        if main_content:
            # Get first paragraph after main heading
            first_p = main_content.find('p')
            if first_p:
                info['description'] = first_p.get_text().strip()

        # Extract arguments/parameters from tables or definition lists
        self._extract_arguments(soup, info)
        
        # Extract exports
        self._extract_exports(soup, info)
        
        # Extract examples
        self._extract_examples(soup, info)

        # Extract block definitions (nested configurations)
        self._extract_blocks(soup, info)

        return info

    def _extract_arguments(self, soup: BeautifulSoup, info: Dict):
        """Extract component arguments from documentation"""
        # Look for arguments section
        args_section = None
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            heading_text = heading.get_text().lower()
            if 'argument' in heading_text or 'parameter' in heading_text:
                args_section = heading
                break

        if args_section:
            # Find table or list after the arguments heading
            current = args_section.find_next_sibling()
            while current:
                if current.name == 'table':
                    self._parse_arguments_table(current, info)
                    break
                elif current.name in ['dl', 'ul', 'ol']:
                    self._parse_arguments_list(current, info)
                    break
                elif current.name in ['h2', 'h3', 'h4']:
                    break
                current = current.find_next_sibling()

    def _parse_arguments_table(self, table, info: Dict):
        """Parse arguments from a table"""
        rows = table.find_all('tr')[1:]  # Skip header row
        for row in rows:
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 2:
                name = cells[0].get_text().strip()
                desc = cells[1].get_text().strip()
                
                # Try to determine if required and get type info
                is_required = False
                type_info = ""
                default_value = ""
                
                if len(cells) >= 3:
                    type_cell = cells[2].get_text().strip()
                    type_info = type_cell
                    is_required = 'required' in type_cell.lower() or 'mandatory' in type_cell.lower()
                    
                    # Look for default values
                    if 'default:' in type_cell.lower():
                        default_match = re.search(r'default:\s*([^)]+)', type_cell.lower())
                        if default_match:
                            default_value = default_match.group(1).strip()

                # Check description for required indicators
                if not is_required:
                    is_required = 'required' in desc.lower() or 'mandatory' in desc.lower()

                info['arguments'][name] = {
                    'description': desc,
                    'type': type_info,
                    'required': is_required,
                    'default': default_value
                }
                
                if is_required:
                    info['required_attributes'].append(name)
                
                # Let the Blocks table parsing handle block identification
                # Don't create blocks based on argument analysis

    def _parse_arguments_list(self, list_elem, info: Dict):
        """Parse arguments from a definition list or unordered list"""
        items = list_elem.find_all(['dt', 'li'])
        for item in items:
            text = item.get_text().strip()
            # Extract argument name and description
            if ' - ' in text:
                parts = text.split(' - ', 1)
                name = parts[0].strip()
                desc = parts[1].strip()
                is_required = 'required' in desc.lower()
                info['arguments'][name] = {
                    'description': desc,
                    'type': '',
                    'required': is_required,
                    'default': ''
                }
                if is_required:
                    info['required_attributes'].append(name)

    def _extract_blocks(self, soup: BeautifulSoup, info: Dict):
        """Extract block definitions (nested configurations)"""
        # Look for blocks section
        blocks_section = None
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            heading_text = heading.get_text().lower()
            if 'block' in heading_text or 'configuration' in heading_text:
                blocks_section = heading
                break

        if blocks_section:
            current = blocks_section.find_next_sibling()
            while current:
                if current.name == 'table':
                    self._parse_blocks_table(current, info)
                    break
                elif current.name == 'ul' or current.name == 'ol':
                    self._parse_blocks_list(current, info)
                    break
                elif current.name in ['h2', 'h3', 'h4']:
                    break
                current = current.find_next_sibling()
        
        # Also look for usage examples to understand required blocks
        self._extract_block_requirements_from_usage(soup, info)

    def _parse_blocks_table(self, table, info: Dict):
        """Parse block definitions from a table"""
        rows = table.find_all('tr')[1:]  # Skip header row
        for row in rows:
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 2:
                block_name = cells[0].get_text().strip()
                block_desc = cells[1].get_text().strip()
                
                # Check if block is required (look in third column or description)
                is_required = False
                if len(cells) >= 3:
                    third_column = cells[2].get_text().strip().lower()
                    is_required = 'yes' in third_column or 'required' in third_column
                else:
                    # Check if "required" is mentioned in description
                    is_required = 'required' in block_desc.lower()
                
                # Parse hierarchical block names (e.g., "endpoint > azuread > managed_identity")
                if ' > ' in block_name:
                    self._handle_nested_block(block_name, block_desc, is_required, info)
                else:
                    # Handle top-level blocks
                    info['blocks'][block_name] = {
                        'description': block_desc,
                        'required': is_required,
                        'properties': {}
                    }
                    
                    # Don't add blocks to required_attributes - they are blocks, not properties
                    # The block requirement will be handled separately in the blocks structure
    
    def _handle_nested_block(self, block_path: str, block_desc: str, is_required: bool, info: Dict):
        """Handle nested block definitions with hierarchical paths"""
        parts = [part.strip() for part in block_path.split(' > ')]
        
        # Create the nested structure
        current_blocks = info['blocks']
        full_path = []
        
        for i, part in enumerate(parts):
            full_path.append(part)
            current_path = ' > '.join(full_path)
            is_leaf = (i == len(parts) - 1)  # Last part in the path
            
            # Check if current_blocks is valid (not None)
            if current_blocks is None:
                # This shouldn't happen in normal flow, but let's be safe
                break
                
            if part not in current_blocks:
                # Create the block if it doesn't exist
                current_blocks[part] = {
                    'description': block_desc if is_leaf else f'Configuration block for {part}',
                    'required': False,  # Nested blocks are not unconditionally required
                    'properties': {},
                }
                # Only add nested_blocks for non-leaf nodes
                if not is_leaf:
                    current_blocks[part]['nested_blocks'] = {}
            else:
                # Block exists, ensure it has nested_blocks if it's not a leaf
                if not is_leaf and 'nested_blocks' not in current_blocks[part]:
                    current_blocks[part]['nested_blocks'] = {}
                elif not is_leaf and current_blocks[part]['nested_blocks'] is None:
                    current_blocks[part]['nested_blocks'] = {}
            
            # For non-leaf blocks, continue building the tree
            if not is_leaf:
                # Safely navigate to nested blocks
                nested = current_blocks[part].get('nested_blocks')
                if nested is not None:
                    current_blocks = nested
                else:
                    # Create nested_blocks if it doesn't exist or is None
                    current_blocks[part]['nested_blocks'] = {}
                    current_blocks = current_blocks[part]['nested_blocks']
        
        # Handle conditional requirements for nested blocks
        if is_required and len(parts) > 1:
            # This block is required only when its parent chain exists
            parent_path = ' > '.join(parts[:-1])
            leaf_block = parts[-1]
            
            if parent_path not in info['conditional_requirements']:
                info['conditional_requirements'][parent_path] = []
            
            info['conditional_requirements'][parent_path].append({
                'block': leaf_block,
                'description': block_desc,
                'required': True
            })
        elif is_required and len(parts) == 1:
            # This is a top-level required block - don't add to required_attributes
            # The block requirement is handled in the blocks structure itself
            pass

    def _parse_blocks_list(self, list_elem, info: Dict):
        """Parse block definitions from a list"""
        items = list_elem.find_all('li')
        for item in items:
            text = item.get_text().strip()
            # Look for block definitions in list format
            if ':' in text:
                parts = text.split(':', 1)
                block_name = parts[0].strip()
                block_desc = parts[1].strip()
                
                is_required = 'required' in block_desc.lower()
                info['blocks'][block_name] = {
                    'description': block_desc,
                    'required': is_required,
                    'properties': {}
                }
                
                # Don't add blocks to required_attributes - they are blocks, not properties

    def _extract_block_requirements_from_usage(self, soup: BeautifulSoup, info: Dict):
        """Extract required blocks and properties from usage examples"""
        # Look for usage examples in code blocks
        usage_section = None
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            heading_text = heading.get_text().lower()
            if 'usage' in heading_text or 'example' in heading_text:
                usage_section = heading
                break
        
        if usage_section:
            # Find code blocks after usage section
            current = usage_section.find_next_sibling()
            while current:
                if current.name == 'pre' or (current.name == 'div' and 'highlight' in current.get('class', [])):
                    code_text = current.get_text()
                    self._parse_usage_code_for_requirements(code_text, info)
                elif current.name in ['h2', 'h3', 'h4']:
                    break
                current = current.find_next_sibling()
        
        # Also check examples section
        examples_section = None
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            heading_text = heading.get_text().lower()
            if heading_text.strip() == 'examples':
                examples_section = heading
                break
        
        if examples_section:
            current = examples_section.find_next_sibling()
            while current:
                if current.name == 'pre' or (current.name == 'div' and 'highlight' in current.get('class', [])):
                    code_text = current.get_text()
                    self._parse_usage_code_for_requirements(code_text, info)
                elif current.name in ['h2', 'h3', 'h4']:
                    break
                current = current.find_next_sibling()
    def _parse_usage_code_for_requirements(self, code_text: str, info: Dict):
        """Parse code examples to understand required structure"""
        lines = code_text.split('\n')
        current_block = None
        component_pattern = None
        
        # First, identify the main component pattern to avoid confusing it with blocks
        for line in lines:
            stripped_line = line.strip()
            # Look for the main component declaration (has quotes and label placeholder)
            if stripped_line.startswith(info['name']) and '"' in stripped_line and '{' in stripped_line:
                component_pattern = stripped_line.split('{')[0].strip()
                break
        
        for line in lines:
            stripped_line = line.strip()
            
            # Look for block definitions like "endpoint {" or "basic_auth {"
            if '{' in stripped_line and not stripped_line.startswith('//') and not stripped_line.startswith('#'):
                # Extract block name before '{'
                block_match = stripped_line.split('{')[0].strip()
                
                # Skip the main component declaration and empty lines
                if (block_match and 
                    block_match != component_pattern and 
                    not block_match.startswith(info['name']) and
                    not block_match.startswith('"') and
                    not '<' in block_match):  # Skip placeholder patterns like "<LABEL>"
                    
                    current_block = block_match
                    
                    # If we see it in usage, it's likely required (override docs if needed)
                    if current_block not in info['blocks']:
                        info['blocks'][current_block] = {
                            'description': f'Configuration block for {current_block}',
                            'required': True,  # Usage examples show essential blocks
                            'properties': {}
                        }
                    else:
                        # Override documentation - if it's in usage, mark as required
                        info['blocks'][current_block]['required'] = True
                        
                    print(f"    Found usage block: {current_block} (marked as required)")
            
            # Look for property assignments like 'url = "..."'
            elif '=' in stripped_line and current_block and not stripped_line.startswith('//'):
                prop_match = stripped_line.split('=')[0].strip()
                # Clean up property name (remove placeholders)
                if prop_match and not prop_match.startswith('<') and not prop_match.startswith('"'):
                    # Add property to current block
                    info['blocks'][current_block]['properties'][prop_match] = {
                        'required': True,  # Assume required if in usage example
                        'type': 'string',  # Default type
                        'description': f'{prop_match} configuration'
                    }
                    print(f"      Found usage property: {prop_match} in {current_block}")

    def _extract_exports(self, soup: BeautifulSoup, info: Dict):
        """Extract component exports from documentation"""
        exports_section = None
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            if 'export' in heading.get_text().lower():
                exports_section = heading
                break

        if exports_section:
            current = exports_section.find_next_sibling()
            while current:
                if current.name == 'table':
                    rows = current.find_all('tr')[1:]
                    for row in rows:
                        cells = row.find_all(['td', 'th'])
                        if len(cells) >= 2:
                            name = cells[0].get_text().strip()
                            desc = cells[1].get_text().strip()
                            info['exports'][name] = desc
                    break
                elif current.name in ['h2', 'h3', 'h4']:
                    break
                current = current.find_next_sibling()

    def _extract_examples(self, soup: BeautifulSoup, info: Dict):
        """Extract code examples from documentation"""
        code_blocks = soup.find_all(['pre', 'code'])
        for block in code_blocks:
            if block.parent and block.parent.name == 'pre':
                continue  # Skip nested code blocks
            
            code_text = block.get_text().strip()
            if code_text and len(code_text) > 20:  # Only meaningful examples
                info['examples'].append(code_text)

    def escape_for_template_literal(self, text: str) -> str:
        """Properly escape text for use in TypeScript template literals"""
        # Escape backticks and dollar signs that should be literal
        text = text.replace('`', '\\`')
        # For VS Code snippets, we want ${1} to be literal in the template string
        # So we need to escape the $ in the Python string so it becomes \${1} in the output
        text = text.replace('${', '\\${')
        return text

    def generate_typescript_file(self, category: str, components: List[Dict]) -> str:
        """Generate TypeScript file content for a component category"""
        
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
            name = comp['name']
            desc = comp['description'] or f"Component for {name}"
            
            # Escape quotes and normalize newlines in description
            desc_escaped = desc.replace('"', '\\"').replace('\n', ' ').replace('\r', ' ').strip()
            # Remove multiple spaces
            desc_escaped = ' '.join(desc_escaped.split())
            
            # Apply component-specific overrides before generating snippet
            self._get_component_specific_requirements(name, comp)
            
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

        content += "];\n\n"

        # Generate block properties - collect all unique block types
        content += f"export const {category}BlockProperties: Record<string, CompletionItem[]> = {{\n"
        
        # Generate properties for each component
        for comp in components:
            name = comp['name']
            if comp['arguments']:
                content += f'  "{name}": [\n'
                
                for arg_name, arg_info in comp['arguments'].items():
                    arg_snippet = self._generate_argument_snippet(arg_name, arg_info)
                    arg_snippet_escaped = self.escape_for_template_literal(arg_snippet)
                    arg_desc = arg_info['description'].replace('"', '\\"').replace('\n', ' ').replace('\r', ' ').strip()
                    # Remove multiple spaces
                    arg_desc = ' '.join(arg_desc.split())
                    
                    # Build detail string
                    detail_parts = []
                    if arg_info.get('type'):
                        detail_parts.append(arg_info['type'])
                    detail_parts.append('required' if arg_info['required'] else 'optional')
                    if arg_info.get('default'):
                        detail_parts.append(f"default: {arg_info['default']}")
                    arg_detail = ' - '.join(detail_parts)
                    # Escape quotes and normalize newlines in detail
                    arg_detail = arg_detail.replace('"', '\\"').replace('\n', ' ').replace('\r', ' ').strip()
                    arg_detail = ' '.join(arg_detail.split())
                    
                    content += f'''    createSnippet(
      "{arg_name}",
      CompletionItemKind.Property,
      `{arg_snippet_escaped}`,
      "{arg_desc}",
      "{arg_detail}",
    ),
'''
                
                content += "  ],\n"

        # Add generic block properties that might be shared (based on your example)
        generic_blocks = {
            'output': {
                'properties': [
                    ('metrics_receiver', 'list(MetricsReceiver) - optional', 'Receptores para métricas.'),
                    ('logs_receiver', 'list(LogsReceiver) - optional', 'Receptores para logs.'),
                    ('traces_receiver', 'list(TracesReceiver) - optional', 'Receptores para trazas.'),
                ]
            },
            'client': {
                'properties': [
                    ('endpoint', 'string - required', 'Dirección del endpoint del cliente.'),
                    ('compression', 'string - optional (default: none)', 'Compresión a usar.'),
                ]
            },
            'http': {
                'properties': [
                    ('endpoint', 'string - optional (default: 0.0.0.0:4318)', 'Dirección del endpoint HTTP.'),
                ]
            },
            'grpc': {
                'properties': [
                    ('endpoint', 'string - optional (default: 0.0.0.0:4317)', 'Dirección del endpoint gRPC.'),
                ]
            },
        }
        
        for block_name, block_info in generic_blocks.items():
            content += f'  "{block_name}": [\n'
            for prop_name, prop_detail, prop_desc in block_info['properties']:
                if prop_name == 'endpoint':
                    snippet_text = f'{prop_name} = "${{1:{prop_name}}}"'
                elif 'receiver' in prop_name:
                    snippet_text = f'{prop_name} = [${{1:/* receiver */}}]'
                elif prop_name == 'compression':
                    snippet_text = f'{prop_name} = "${{1|gzip,zlib,none|}}"'
                else:
                    snippet_text = f'{prop_name} = "${{1:{prop_name}}}"'
                
                snippet_escaped = self.escape_for_template_literal(snippet_text)
                
                content += f'''    createSnippet(
      "{prop_name}",
      CompletionItemKind.Property,
      `{snippet_escaped}`,
      "{prop_desc}",
      "{prop_detail}",
    ),
'''
            content += "  ],\n"
        
        content += "};\n\n"

        # Generate required attributes
        content += f"export const {category}RequiredAttributes: Record<string, string[]> = {{\n"
        
        for comp in components:
            name = comp['name']
            required_attrs = []
            
            # Add explicitly found required attributes (only top-level unconditional ones)
            # Filter out any items that are actually blocks, not properties
            for attr in comp['required_attributes']:
                # Only add to required_attributes if it's NOT a top-level block
                if attr not in comp['blocks']:
                    required_attrs.append(attr)
            
            # Add component-specific required attributes based on knowledge
            component_specific_required = self._get_component_specific_requirements(name, comp)
            required_attrs.extend(component_specific_required)
            
            # Remove duplicates while preserving order
            seen = set()
            unique_attrs = []
            for attr in required_attrs:
                if attr not in seen:
                    seen.add(attr)
                    unique_attrs.append(attr)
            
            if unique_attrs:
                attrs = '", "'.join(unique_attrs)
                content += f'  "{name}": ["{attrs}"],\n'
        
        # Add some common required attributes for specific blocks (properties within blocks)
        content += '  "client": ["endpoint"],\n'
        content += '  "endpoint": ["url"],\n'
        content += '  "basic_auth": ["username", "password"],\n'
        
        content += "};\n\n"
        
        # Generate block completions (for inserting blocks within components)
        content += f"export const {category}BlockCompletions: Record<string, CompletionItem[]> = {{\n"
        
        for comp in components:
            name = comp['name']
            if comp['blocks']:
                content += f'  "{name}": [\n'
                
                for block_name, block_info in comp['blocks'].items():
                    block_desc = block_info['description'].replace('"', '\\"').replace('\n', ' ').replace('\r', ' ').strip()
                    block_desc = ' '.join(block_desc.split())
                    
                    # Generate block snippet (e.g., "endpoint {\n\t${1:url} = \"${2:value}\"\n}")
                    block_snippet = f'{block_name} {{\\n'
                    
                    # Add common properties for this block type
                    placeholder_num = 1
                    if block_name == 'endpoint':
                        block_snippet += f'\\t${{1:url}} = "${{2:http://localhost:9090/api/v1/write}}"\\n'
                        placeholder_num = 3
                    elif block_name == 'basic_auth':
                        block_snippet += f'\\tusername = "${{1:username}}"\\n'
                        block_snippet += f'\\tpassword = "${{2:password}}"\\n'
                        placeholder_num = 3
                    elif block_name == 'tls_config':
                        block_snippet += f'\\tcert_file = "${{1:/path/to/cert.pem}}"\\n'
                        block_snippet += f'\\tkey_file = "${{2:/path/to/key.pem}}"\\n'
                        placeholder_num = 3
                    else:
                        # Add placeholder for custom configuration
                        block_snippet += f'\\t${{1:/* configuration */}}\\n'
                        placeholder_num = 2
                    
                    block_snippet += '}'
                    
                    # Escape for template literal
                    block_snippet_escaped = self.escape_for_template_literal(block_snippet)
                    
                    # Determine if required
                    is_required = 'required' if block_info.get('required', False) else 'optional'
                    
                    content += f'''    createSnippet(
      "{block_name}",
      CompletionItemKind.Snippet,
      `{block_snippet_escaped}`,
      "{block_desc}",
      "{block_name} {{...}} - {is_required}",
    ),
'''
                
                content += "  ],\n"
        
        content += "};\n\n"
        
        # Generate required blocks (separate from properties)
        content += f"export const {category}RequiredBlocks: Record<string, string[]> = {{\n"
        
        for comp in components:
            name = comp['name']
            required_blocks = []
            
            # Add explicitly required blocks
            for block_name, block_info in comp['blocks'].items():
                if block_info.get('required', False):
                    required_blocks.append(block_name)
            
            if required_blocks:
                blocks = '", "'.join(required_blocks)
                content += f'  "{name}": ["{blocks}"],\n'
        
        content += "};\n\n"
        
        # Generate conditional requirements
        content += f"export const {category}ConditionalRequirements: Record<string, Record<string, string[]>> = {{\n"
        
        for comp in components:
            name = comp['name']
            if comp.get('conditional_requirements'):
                content += f'  "{name}": {{\n'
                for context, requirements in comp['conditional_requirements'].items():
                    required_blocks = [req['block'] for req in requirements if req.get('required', False)]
                    if required_blocks:
                        blocks_str = '", "'.join(required_blocks)
                        content += f'    "{context}": ["{blocks_str}"],\n'
                content += '  },\n'
        
        content += "};\n"

        return content

    def _generate_component_snippet(self, comp: Dict) -> str:
        """Generate a component snippet with placeholders"""
        name = comp['name']
        category = comp.get('category', '')

        # Start with basic structure
        snippet = f'{name} "${{1:label}}" {{'

        # Add required arguments with placeholders
        placeholder_num = 2
        for arg_name, arg_info in comp['arguments'].items():
            if arg_info['required']:
                arg_type = arg_info.get('type', '').lower()
                
                if 'string' in arg_type or 'url' in arg_type or 'endpoint' in arg_type:
                    snippet += f'\\n\\t{arg_name} = "${{{placeholder_num}:{arg_name}}}"'
                elif 'bool' in arg_type:
                    snippet += f'\\n\\t{arg_name} = ${{{placeholder_num}|true,false|}}'
                elif 'list' in arg_type or 'array' in arg_type:
                    snippet += f'\\n\\t{arg_name} = [${{{placeholder_num}:/* values */}}]'
                elif 'int' in arg_type or 'number' in arg_type:
                    default_val = arg_info.get('default', '0')
                    snippet += f'\\n\\t{arg_name} = ${{{placeholder_num}:{default_val}}}'
                else:
                    snippet += f'\\n\\t{arg_name} = ${{{placeholder_num}:{arg_name}}}'
                placeholder_num += 1

        # Add required blocks with realistic examples
        for block_name, block_info in comp['blocks'].items():
            if block_info.get('required', False):
                snippet += f'\\n\\n\\t{block_name} {{'
                
                # Add component-specific realistic values
                dummy_values = self._get_dummy_values_for_block(name, block_name, block_info)
                for prop_name, prop_value in dummy_values.items():
                    snippet += f'\\n\\t\\t{prop_name} = "{prop_value}"'
                
                # Add properties from block definition
                for prop_name, prop_info in block_info.get('properties', {}).items():
                    if prop_info.get('required', False) and prop_name not in dummy_values:
                        snippet += f'\\n\\t\\t{prop_name} = "${{{placeholder_num}:{prop_name}}}"'
                        placeholder_num += 1
                
                snippet += '\\n\\t}'

        snippet += '\\n}'
        return snippet

    def _get_dummy_values_for_block(self, component_name: str, block_name: str, block_info: Dict) -> Dict[str, str]:
        """Get realistic dummy values for component blocks"""
        dummy_values = {}
        
        # Component-specific dummy values
        if component_name == 'prometheus.remote_write':
            if block_name == 'endpoint':
                dummy_values['url'] = 'http://localhost:9090/api/v1/write'
        elif component_name == 'loki.write':
            if block_name == 'endpoint':
                dummy_values['url'] = 'http://localhost:3100/loki/api/v1/push'
        elif component_name.endswith('.write') or 'write' in component_name:
            if block_name == 'endpoint':
                dummy_values['url'] = 'http://localhost:8080/api/v1/write'
        elif component_name.startswith('otelcol.exporter'):
            if block_name == 'endpoint':
                dummy_values['endpoint'] = 'http://localhost:4317'
        elif component_name.startswith('prometheus.'):
            if block_name == 'endpoint':
                dummy_values['url'] = 'http://localhost:9090/api/v1/write'
        
        # Generic patterns based on block name
        if block_name == 'client':
            dummy_values['endpoint'] = 'http://localhost:8080'
        elif block_name == 'server':
            dummy_values['address'] = '0.0.0.0:8080'
        elif block_name == 'http':
            dummy_values['endpoint'] = '0.0.0.0:4318'
        elif block_name == 'grpc':
            dummy_values['endpoint'] = '0.0.0.0:4317'
        elif block_name == 'basic_auth':
            dummy_values['username'] = '${2:username}'
            dummy_values['password'] = '${3:password}'
        elif block_name == 'tls_config':
            dummy_values['cert_file'] = '${2:/path/to/cert.pem}'
            dummy_values['key_file'] = '${3:/path/to/key.pem}'
        
        # Look for url/endpoint properties in block
        for prop_name, prop_info in block_info.get('properties', {}).items():
            if 'url' in prop_name.lower() and prop_name not in dummy_values:
                if 'loki' in component_name:
                    dummy_values[prop_name] = 'http://localhost:3100/loki/api/v1/push'
                elif 'prometheus' in component_name:
                    dummy_values[prop_name] = 'http://localhost:9090/api/v1/write'
                else:
                    dummy_values[prop_name] = 'http://localhost:8080/api/v1/endpoint'
            elif 'endpoint' in prop_name.lower() and prop_name not in dummy_values:
                dummy_values[prop_name] = 'http://localhost:8080'
        
        return dummy_values

    def _get_component_specific_requirements(self, component_name: str, comp: Dict) -> List[str]:
        """Get component-specific required attributes based on knowledge"""
        required = []
        
        # Component-specific overrides for documentation inconsistencies
        if component_name == 'prometheus.remote_write':
            # Force endpoint block to be required (docs incorrectly mark it as optional)
            if 'endpoint' in comp['blocks']:
                comp['blocks']['endpoint']['required'] = True
                # Ensure url property exists in endpoint
                if 'url' not in comp['blocks']['endpoint']['properties']:
                    comp['blocks']['endpoint']['properties']['url'] = {
                        'required': True,
                        'type': 'string',
                        'description': 'Full URL to send metrics to'
                    }
            else:
                # Create endpoint block if it doesn't exist
                comp['blocks']['endpoint'] = {
                    'description': 'Location to send metrics to',
                    'required': True,
                    'properties': {
                        'url': {
                            'required': True,
                            'type': 'string',
                            'description': 'Full URL to send metrics to'
                        }
                    }
                }
            print(f"    Applied prometheus.remote_write override: endpoint block required")
        
        # Other component-specific requirements (only for properties, not blocks)
        if component_name.startswith('loki.source.'):
            # forward_to is typically a property, not a block
            required.append('forward_to')
        elif component_name.startswith('discovery.'):
            # These are typically properties based on documentation
            if 'kubernetes' in component_name:
                required.append('role')
            elif 'file' in component_name:
                required.append('files')
        elif component_name == 'prometheus.scrape':
            # targets is typically a property
            required.append('targets')
        
        return required

    def _generate_argument_snippet(self, arg_name: str, arg_info: Dict) -> str:
        """Generate snippet for an individual argument"""
        arg_type = arg_info.get('type', '').lower()
        default_val = arg_info.get('default', '')

        if 'string' in arg_type or 'url' in arg_type:
            default_text = default_val if default_val else arg_name
            return f'{arg_name} = "${{1:{default_text}}}"'
        elif 'bool' in arg_type:
            return f'{arg_name} = ${{1|true,false|}}'
        elif 'list' in arg_type or 'array' in arg_type:
            return f'{arg_name} = [${{1:/* values */}}]'
        elif 'map' in arg_type or 'object' in arg_type:
            return f'{arg_name} = {{\\n\\t${{1:/* properties */}}\\n}}'
        elif 'int' in arg_type or 'number' in arg_type:
            default_text = default_val if default_val else '0'
            return f'{arg_name} = ${{1:{default_text}}}'
        else:
            return f'{arg_name} = ${{1:{arg_name}}}'

    def scrape_all_components(self):
        """Main method to scrape all components"""
        print("Starting Grafana Alloy component scraping...")
        
        # Get component categories
        categories = self.get_component_categories()
        print(f"Found categories: {categories}")
        
        for category in categories:
            print(f"\nProcessing category: {category}")
            
            # Get components in this category
            components_list = self.get_components_in_category(category)
            print(f"Found components: {components_list}")
            
            # Extract detailed info for each component
            category_components = []
            for component_name in components_list:
                print(f"  Extracting info for: {component_name}")
                comp_info = self.extract_component_info(category, component_name)
                if comp_info:
                    category_components.append(comp_info)
                    # Debug output
                    print(f"    Description: {comp_info['description'][:50]}...")
                    print(f"    Arguments: {list(comp_info['arguments'].keys())}")
                    print(f"    Required: {comp_info['required_attributes']}")
                    if comp_info.get('conditional_requirements'):
                        print(f"    Conditional: {comp_info['conditional_requirements']}")
            
            # Generate TypeScript file
            if category_components:
                ts_content = self.generate_typescript_file(category, category_components)
                
                # Write to file
                output_file = f"components/{category}.ts"
                os.makedirs("components", exist_ok=True)
                
                with open(output_file, 'w', encoding='utf-8') as f:
                    f.write(ts_content)
                
                print(f"Generated: {output_file}")
            else:
                print(f"No components found for category: {category}")

    def run(self):
        """Run the scraper"""
        try:
            self.scrape_all_components()
            print("\nScraping completed successfully!")
            print("Generated TypeScript files in the components/ directory")
        except KeyboardInterrupt:
            print("\nScraping interrupted by user")
        except Exception as e:
            print(f"Error during scraping: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == "__main__":
    scraper = AlloyComponentScraper()
    scraper.run()






