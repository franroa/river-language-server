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
            if first_p and hasattr(first_p, 'get_text'):
                info['description'] = first_p.get_text().strip()

        # Extract arguments/parameters from tables or definition lists
        self._extract_arguments(soup, info)
        
        # Extract exports
        self._extract_exports(soup, info)
        
        # Extract examples
        self._extract_examples(soup, info)

        # Extract block definitions (nested configurations)
        self._extract_blocks(soup, info)
        
        # Extract nested block properties from documentation tables
        self._extract_nested_block_properties(soup, info)

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
        """Parse arguments from a table using dynamic header detection"""
        rows = table.find_all('tr')
        
        if len(rows) < 2:  # Need header + at least one data row
            return
        
        # Get column mapping using helper method
        column_map = self._parse_table_headers(table)
        
        # Parse data rows
        for row in rows[1:]:
            cells = row.find_all(['td', 'th'])
            if len(cells) <= column_map.get('name', 0):
                continue
                
            name = cells[column_map.get('name', 0)].get_text().strip()
            if not name or name.startswith('#'):  # Skip empty or comment rows
                continue
                
            # Get description
            desc = ""
            if 'description' in column_map and len(cells) > column_map['description']:
                desc = cells[column_map['description']].get_text().strip()
            
            # Get type info
            type_info = ""
            if 'type' in column_map and len(cells) > column_map['type']:
                type_info = cells[column_map['type']].get_text().strip()
            
            # Get default value
            default_value = ""
            if 'default' in column_map and len(cells) > column_map['default']:
                default_value = cells[column_map['default']].get_text().strip()
            
            # Look for default values in type column if not found in default column
            if not default_value and type_info and 'default:' in type_info.lower():
                default_match = re.search(r'default:\s*([^)]+)', type_info.lower())
                if default_match:
                    default_value = default_match.group(1).strip()
            
            # Determine if required using helper method
            is_required = self._is_field_required(cells, column_map, name, desc, type_info)

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
        """Parse block definitions from a table using dynamic header detection"""
        rows = table.find_all('tr')
        
        if len(rows) < 2:  # Need header + at least one data row
            return
        
        # Get column mapping using helper method
        column_map = self._parse_table_headers(table)
        
        # Parse data rows
        for row in rows[1:]:
            cells = row.find_all(['td', 'th'])
            if len(cells) <= column_map.get('name', 0):
                continue
                
            block_name = cells[column_map.get('name', 0)].get_text().strip()
            if not block_name or block_name.startswith('#'):  # Skip empty or comment rows
                continue
                
            # Get description
            block_desc = ""
            if 'description' in column_map and len(cells) > column_map['description']:
                block_desc = cells[column_map['description']].get_text().strip()
            
            # Determine if required using helper method
            is_required = self._is_field_required(cells, column_map, block_name, block_desc)
            
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
        """Extract required blocks and properties from the first usage example only"""
        component_name = info['name']

        # Look for the first usage example only
        usage_patterns = ['usage', 'example', 'configuration', 'basic configuration', 'minimal configuration']

        for pattern in usage_patterns:
            # Look for usage examples in code blocks under various headings
            for heading in soup.find_all(['h2', 'h3', 'h4']):
                heading_text = heading.get_text().lower()
                if pattern in heading_text:
                    print(f"    Found {pattern} section: {heading_text}")
                    # Find the first code block after this section
                    current = heading.find_next_sibling()
                    while current:
                        if current.name == 'pre' or (current.name == 'div' and 'highlight' in current.get('class', [])):
                            code_text = current.get_text()
                            if component_name in code_text:  # Only parse if it contains our component
                                print(f"    Parsing first {pattern} code block for {component_name}")
                                self._parse_usage_code_for_requirements(code_text, info)
                                return  # Stop after processing the first usage example
                        elif current.name in ['h2', 'h3', 'h4']:
                            break
                        current = current.find_next_sibling()

        # If no usage section found, look for the first code block that contains the component name
        all_code_blocks = soup.find_all(['pre', 'code'])
        for block in all_code_blocks:
            if block.parent and block.parent.name == 'pre':
                continue  # Skip nested code blocks

            code_text = block.get_text().strip()
            if component_name in code_text and len(code_text) > 50:  # Only meaningful examples
                print(f"    Found component in first general code block")
                self._parse_usage_code_for_requirements(code_text, info)
                return  # Stop after processing the first usage example
    def _parse_usage_code_for_requirements(self, code_text: str, info: Dict):
        """Parse code examples to understand required structure"""
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

                    # Determine if this is a commented-out block (from original line, not stripped)
                    is_commented = line.lstrip().startswith('//') or line.lstrip().startswith('#')
                    
                    # CORRECTED LOGIC: Usage examples show recommended blocks, not required
                    if current_block not in info['blocks']:
                        info['blocks'][current_block] = {
                            'description': f'Configuration block for {current_block}',
                            'required': False,  # Usage examples show recommended, not required
                            'recommended': True,  # Mark as recommended
                            'properties': {}
                        }
                        print(f"    Found new usage block: {current_block} (marked as recommended)")
                    else:
                        # Block exists from docs - don't override required status
                        # But mark as recommended since it appears in usage
                        if not info['blocks'][current_block].get('required', False):
                            info['blocks'][current_block]['recommended'] = True
                            print(f"    Found existing usage block: {current_block} (marked as recommended)")
                        else:
                            print(f"    Found existing usage block: {current_block} (keeping required from docs)")

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

                        # Check if this property was already defined from documentation tables
                        if prop_match in info['blocks'][current_block]['properties']:
                            # Property already exists from docs - don't override its required status
                            existing_prop = info['blocks'][current_block]['properties'][prop_match]
                            # Just update type if we have better info from usage
                            if not existing_prop.get('type') and prop_type:
                                existing_prop['type'] = prop_type
                        else:
                            # New property found only in usage examples - mark as recommended
                            info['blocks'][current_block]['properties'][prop_match] = {
                                'required': False,  # Usage examples show recommended properties, not required
                                'recommended': True,  # Mark as recommended instead of required
                                'type': prop_type,
                                'description': f'{prop_match} configuration'
                            }
                        print(f"      Found usage property: {prop_match} ({prop_type}) in {current_block}")

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

    def _infer_property_type(self, value_part: str) -> str:
        """Infer property type from the value in usage example"""
        value_part = value_part.strip()

        if value_part.startswith('"') and value_part.endswith('"'):
            return 'string'
        elif value_part.startswith('<') and value_part.endswith('>'):
            # Placeholder like <URL> - infer from placeholder name
            placeholder = value_part[1:-1].upper()
            if 'URL' in placeholder:
                return 'string'
            elif 'BOOL' in placeholder:
                return 'bool'
            elif 'INT' in placeholder or 'NUMBER' in placeholder:
                return 'int'
            else:
                return 'string'
        elif value_part in ['true', 'false']:
            return 'bool'
        elif value_part.isdigit() or (value_part.startswith('-') and value_part[1:].isdigit()):
            return 'int'
        elif value_part.startswith('[') and value_part.endswith(']'):
            return 'list'
        elif value_part.startswith('{') and value_part.endswith('}'):
            return 'map'
        else:
            return 'string'

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

    def _extract_nested_block_properties(self, soup: BeautifulSoup, info: Dict):
        """Extract nested block properties from documentation tables"""
        # Look for nested block headings (like ### `rule` or ### `endpoint` or ### rule)
        for heading in soup.find_all(['h3', 'h4']):
            heading_text = heading.get_text().strip()
            
            # Method 1: Check if this is a nested block heading with backticks
            block_name = None
            if '`' in heading_text:
                # Extract block name from heading (remove ### and backticks)
                block_name = heading_text.replace('#', '').replace('`', '').strip()
                
            # Method 2: Check if this is a plain heading that matches known block names
            elif heading_text.lower() in ['rule', 'endpoint', 'basic_auth', 'tls_config', 'oauth2', 'authorization']:
                block_name = heading_text.lower()
                
            # Method 3: Check if heading mentions "block" and extract the block name
            elif 'block' in heading_text.lower():
                # Try to extract block name from patterns like "The rule block" or "rule block"
                import re
                match = re.search(r'(\w+)\s+block', heading_text.lower())
                if match:
                    block_name = match.group(1)
            
            if not block_name or ' ' in block_name or len(block_name) > 50:
                continue
                
            print(f"    Found nested block documentation: {block_name}")
            
            # Look for table after this heading
            current = heading.find_next_sibling()
            while current:
                if current.name == 'table':
                    properties = self._parse_nested_block_table(current, block_name)
                    if properties:
                        # Add properties to the component's blocks structure
                        if block_name not in info['blocks']:
                            info['blocks'][block_name] = {
                                'description': f'Configuration block for {block_name}',
                                'required': False,
                                'properties': {}
                            }
                        info['blocks'][block_name]['properties'] = properties
                        print(f"    Added {len(properties)} properties to block {block_name}")
                    break
                elif current.name in ['h2', 'h3', 'h4']:
                    # Stop if we hit another heading
                    break
                current = current.find_next_sibling()

    def _parse_nested_block_table(self, table, block_name: str) -> Dict:
        """Parse properties table for a nested block"""
        properties = {}
        rows = table.find_all('tr')
        
        if len(rows) < 2:  # Need header + at least one data row
            return properties
            
        # Check if this looks like a properties table
        header_row = rows[0]
        header_cells = header_row.find_all(['th', 'td'])
        header_text = [cell.get_text().strip().lower() for cell in header_cells]
        
        # Must have name and type columns to be a properties table
        if 'name' not in header_text or 'type' not in header_text:
            return properties
            
        # Find column indices
        name_col = header_text.index('name') if 'name' in header_text else 0
        type_col = header_text.index('type') if 'type' in header_text else 1
        desc_col = header_text.index('description') if 'description' in header_text else 2
        default_col = header_text.index('default') if 'default' in header_text else -1
        required_col = header_text.index('required') if 'required' in header_text else -1
        
        # Parse data rows
        for row in rows[1:]:
            cells = row.find_all(['td', 'th'])
            if len(cells) <= name_col:
                continue
                
            prop_name = cells[name_col].get_text().strip()
            if not prop_name or prop_name.startswith('#'):  # Skip empty or comment rows
                continue
                
            prop_type = cells[type_col].get_text().strip() if len(cells) > type_col else 'string'
            prop_desc = cells[desc_col].get_text().strip() if len(cells) > desc_col else f'{prop_name} configuration'
            
            # Check if required using consistent logic
            column_map = {'name': name_col, 'type': type_col, 'description': desc_col, 'default': default_col}
            if required_col >= 0:
                column_map['required'] = required_col
            
            is_required = self._is_field_required(cells, column_map, prop_name, prop_desc, prop_type)
                
            # Get default value
            default_value = ""
            if default_col >= 0 and len(cells) > default_col:
                default_value = cells[default_col].get_text().strip()
                
            properties[prop_name] = {
                'type': prop_type,
                'description': prop_desc,
                'required': is_required,
                'default': default_value
            }
            
        return properties

    def escape_for_template_literal(self, text: str) -> str:
        """Properly escape text for use in TypeScript template literals"""
        # Escape backticks and dollar signs that should be literal
        text = text.replace('`', '\\`')
        # For VS Code snippets, we want ${1} to be literal in the template string
        # So we need to escape the $ in the Python string so it becomes \${1} in the output
        text = text.replace('${', '\\${')
        return text

    def escape_for_string_literal(self, text: str) -> str:
        """Properly escape text for use in TypeScript string literals"""
        if not text:
            return text
        # Escape backslashes first (must be done before other escapes)
        text = text.replace('\\', '\\\\')
        # Escape double quotes
        text = text.replace('"', '\\"')
        # Escape single quotes (for consistency)
        text = text.replace("'", "\\'")
        # Escape newlines and other control characters
        text = text.replace('\n', '\\n')
        text = text.replace('\r', '\\r')
        text = text.replace('\t', '\\t')
        # Remove any null bytes or other problematic characters
        text = text.replace('\0', '')
        return text

    def clean_and_escape_text(self, text: str) -> str:
        """Clean and escape text for safe use in TypeScript strings"""
        if not text:
            return ""
        # First normalize whitespace and remove extra spaces
        text = ' '.join(text.split())
        # Then escape for string literal
        return self.escape_for_string_literal(text)

    def generate_typescript_file(self, category: str, components: List[Dict]) -> str:
        """Generate TypeScript file content for a component category"""
        
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
                # Apply component-specific overrides before generating snippet
                self._get_component_specific_requirements(name, comp)
                self._apply_component_specific_overrides(name, comp)
                
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

        # Generate block properties - collect all unique block types
        content += f"export const {category}BlockProperties: Record<string, CompletionItem[]> = {{\n"
        
        # Generate properties for each component
        for comp in components:
            name = comp['name']
            if comp['arguments']:
                content += f'  "{name}": [\n'
                
                for arg_name, arg_info in comp.get('arguments', {}).items():
                    try:
                        # Validate argument name
                        if not self.validate_typescript_identifier(arg_name):
                            print(f"Warning: Invalid argument name '{arg_name}' in component '{name}'")
                            continue
                        
                        arg_snippet = self._generate_argument_snippet(arg_name, arg_info)
                        arg_snippet_escaped = self.escape_for_template_literal(arg_snippet)
                        arg_desc = self.clean_and_escape_text(arg_info.get('description', ''))
                        
                        # Build detail string with proper escaping
                        detail_parts = []
                        if arg_info.get('type'):
                            detail_parts.append(self.clean_and_escape_text(str(arg_info['type'])))
                        
                        # Handle recommended vs required vs optional
                        if arg_info.get('required', False):
                            detail_parts.append('required')
                        elif arg_info.get('recommended', False):
                            detail_parts.append('recommended')
                        else:
                            detail_parts.append('optional')
                            
                        if arg_info.get('default') is not None:
                            # Escape the default value properly
                            escaped_default = self.clean_and_escape_text(str(arg_info['default']))
                            detail_parts.append(f"default: {escaped_default}")
                        arg_detail = ' - '.join(detail_parts)
                        
                        content += f'''    createSnippet(
      "{arg_name}",
      CompletionItemKind.Property,
      `{arg_snippet_escaped}`,
      "{arg_desc}",
      "{arg_detail}",
    ),
'''
                    except Exception as e:
                        print(f"Error processing argument '{arg_name}' in component '{name}': {e}")
                        continue
                
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
        
        # Generate recommended attributes (from usage examples)
        content += f"export const {category}RecommendedAttributes: Record<string, Record<string, string[]>> = {{\n"
        
        for comp in components:
            name = comp['name']
            has_recommendations = False
            
            # Check if any blocks have recommended properties
            for block_name, block_info in comp['blocks'].items():
                if 'properties' in block_info and block_info['properties']:
                    recommended_props = []
                    for prop_name, prop_info in block_info['properties'].items():
                        if prop_info.get('recommended', False):
                            recommended_props.append(prop_name)
                    
                    if recommended_props:
                        if not has_recommendations:
                            content += f'  "{name}": {{\n'
                            has_recommendations = True
                        
                        props = '", "'.join(recommended_props)
                        content += f'    "{block_name}": ["{props}"],\n'
            
            if has_recommendations:
                content += '  },\n'
        
        content += "};\n\n"
        
        # Generate block completions (for inserting blocks within components)
        content += f"export const {category}BlockCompletions: Record<string, CompletionItem[]> = {{\n"

        for comp in components:
            name = comp['name']
            if comp['blocks']:
                content += f'  "{name}": [\n'

                for block_name, block_info in comp['blocks'].items():
                    block_desc = self.clean_and_escape_text(block_info['description'])

                    # Generate block snippet with properties from usage examples
                    block_snippet = f'{block_name} {{\\n'

                    # Add properties found in usage examples for this block
                    placeholder_num = 1
                    properties_added = 0

                    if 'properties' in block_info and block_info['properties']:
                        for prop_name, prop_info in block_info['properties'].items():
                            if prop_info.get('required', False):
                                # Generate appropriate snippet based on property type
                                prop_type = prop_info.get('type', 'string')
                                if prop_type == 'string':
                                    if 'url' in prop_name.lower():
                                        block_snippet += f'\\t{prop_name} = "${{{placeholder_num}:http://localhost:9090/api/v1/write}}"\\n'
                                    elif 'endpoint' in prop_name.lower():
                                        block_snippet += f'\\t{prop_name} = "${{{placeholder_num}:http://localhost:8080}}"\\n'
                                    else:
                                        block_snippet += f'\\t{prop_name} = "${{{placeholder_num}:{prop_name}}}"\\n'
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

                    # If no properties found in usage examples, use generic placeholders
                    if properties_added == 0:
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

        # Generate nested block property completions (for properties within blocks)
        content += f"export const {category}NestedBlockProperties: Record<string, Record<string, CompletionItem[]>> = {{\n"

        for comp in components:
            name = comp['name']
            if comp['blocks']:
                content += f'  "{name}": {{\n'

                for block_name, block_info in comp['blocks'].items():
                    if 'properties' in block_info and block_info['properties']:
                        content += f'    "{block_name}": [\n'

                        for prop_name, prop_info in block_info['properties'].items():
                            prop_desc = self.clean_and_escape_text(prop_info.get('description', f'{prop_name} configuration'))

                            # Generate property snippet based on type
                            prop_type = prop_info.get('type', 'string')
                            if prop_type == 'string':
                                if 'url' in prop_name.lower():
                                    prop_snippet = f'{prop_name} = "${{1:http://localhost:9090/api/v1/write}}"'
                                elif 'endpoint' in prop_name.lower():
                                    prop_snippet = f'{prop_name} = "${{1:http://localhost:8080}}"'
                                else:
                                    prop_snippet = f'{prop_name} = "${{1:{prop_name}}}"'
                            elif prop_type == 'bool':
                                prop_snippet = f'{prop_name} = ${{1|true,false|}}'
                            elif prop_type == 'int':
                                prop_snippet = f'{prop_name} = ${{1:0}}'
                            elif prop_type == 'list':
                                prop_snippet = f'{prop_name} = [${{1:/* values */}}]'
                            else:
                                prop_snippet = f'{prop_name} = ${{1:{prop_name}}}'

                            # Escape for template literal
                            prop_snippet_escaped = self.escape_for_template_literal(prop_snippet)

                            # Build detail string with proper escaping
                            detail_parts = []
                            if prop_type:
                                detail_parts.append(self.clean_and_escape_text(prop_type))
                            
                            # Handle recommended vs required vs optional
                            if prop_info.get('required', False):
                                detail_parts.append('required')
                            elif prop_info.get('recommended', False):
                                detail_parts.append('recommended')
                            else:
                                detail_parts.append('optional')
                            if prop_info.get('default'):
                                escaped_default = self.clean_and_escape_text(str(prop_info['default']))
                                detail_parts.append(f"default: {escaped_default}")
                            prop_detail = ' - '.join(detail_parts)

                            content += f'''      createSnippet(
        "{prop_name}",
        CompletionItemKind.Property,
        `{prop_snippet_escaped}`,
        "{prop_desc}",
        "{prop_detail}",
      ),
'''

                        content += '    ],\n'

                content += '  },\n'

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

        return self.validate_and_fix_typescript_content(content, category)

    def validate_and_fix_typescript_content(self, content: str, category: str) -> str:
        """Validate and fix common issues in generated TypeScript content"""
        try:
            # Check for obvious syntax issues
            lines = content.split('\n')
            fixed_lines = []
            
            for i, line in enumerate(lines):
                # Check for unescaped quotes that could cause issues
                if '""' in line and not '\\"' in line:
                    # This might be an unescaped quote issue
                    print(f"Warning: Potential quote issue in line {i+1}: {line[:50]}...")
                
                # Check for valid string literals in detail fields
                if '"default:' in line and not line.endswith('",'):
                    print(f"Warning: Potential malformed default value in line {i+1}")
                
                fixed_lines.append(line)
            
            content = '\n'.join(fixed_lines)
            
            # Basic validation: check that the file structure looks correct
            if not content.startswith('import {'):
                print(f"Warning: Generated TypeScript file for {category} doesn't start with imports")
            
            if f'export const {category}Components' not in content:
                print(f"Warning: Generated TypeScript file for {category} missing components export")
            
            print(f"Generated TypeScript content for {category}: {len(content)} characters")
            return content
            
        except Exception as e:
            print(f"Error validating TypeScript content for {category}: {e}")
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
        """Get realistic dummy values for component blocks based on parsed usage information"""
        dummy_values = {}

        # First, use any properties found in usage examples (they take precedence)
        for prop_name, prop_info in block_info.get('properties', {}).items():
            if prop_info.get('required', False):
                # Generate appropriate placeholder based on property type
                prop_type = prop_info.get('type', 'string').lower()
                if 'url' in prop_name.lower():
                    if 'loki' in component_name:
                        dummy_values[prop_name] = 'http://localhost:3100/loki/api/v1/push'
                    elif 'prometheus' in component_name:
                        dummy_values[prop_name] = 'http://localhost:9090/api/v1/write'
                    else:
                        dummy_values[prop_name] = 'http://localhost:8080/api/v1/endpoint'
                elif 'endpoint' in prop_name.lower():
                    if 'otelcol' in component_name:
                        dummy_values[prop_name] = 'http://localhost:4317'
                    else:
                        dummy_values[prop_name] = 'http://localhost:8080'
                elif prop_type == 'string':
                    dummy_values[prop_name] = f'${{1:{prop_name}}}'
                elif prop_type == 'bool':
                    dummy_values[prop_name] = '${1|true,false|}'
                elif prop_type == 'int':
                    dummy_values[prop_name] = '${1:0}'
                elif prop_type == 'list':
                    dummy_values[prop_name] = '${1:/* values */}'

        # Fallback to generic patterns if no usage properties found
        if not dummy_values:
            if block_name == 'endpoint':
                if 'loki' in component_name:
                    dummy_values['url'] = 'http://localhost:3100/loki/api/v1/push'
                elif 'prometheus' in component_name:
                    dummy_values['url'] = 'http://localhost:9090/api/v1/write'
                else:
                    dummy_values['url'] = 'http://localhost:8080/api/v1/write'
            elif block_name == 'client':
                dummy_values['endpoint'] = 'http://localhost:8080'
            elif block_name == 'server':
                dummy_values['address'] = '0.0.0.0:8080'
            elif block_name == 'http':
                dummy_values['endpoint'] = '0.0.0.0:4318'
            elif block_name == 'grpc':
                dummy_values['endpoint'] = '0.0.0.0:4317'
            elif block_name == 'basic_auth':
                dummy_values['username'] = '${1:username}'
                dummy_values['password'] = '${2:password}'
            elif block_name == 'tls_config':
                dummy_values['cert_file'] = '${1:/path/to/cert.pem}'
                dummy_values['key_file'] = '${2:/path/to/key.pem}'

        return dummy_values

    def validate_typescript_identifier(self, name: str) -> bool:
        """Validate that a name is a valid TypeScript identifier"""
        if not name:
            return False
        
        # Must start with letter, underscore, or dollar sign
        if not (name[0].isalpha() or name[0] in ['_', '$']):
            return False
        
        # Rest must be alphanumeric, underscore, or dollar sign
        for char in name[1:]:
            if not (char.isalnum() or char in ['_', '$', '.']):
                return False
        
        return True

    def sanitize_component_name(self, name: str) -> str:
        """Sanitize component name for safe use in TypeScript"""
        if not name:
            return "unknown"
        
        # Replace invalid characters with underscores
        sanitized = ""
        for i, char in enumerate(name):
            if i == 0 and (char.isalpha() or char in ['_', '$']):
                sanitized += char
            elif i == 0:
                sanitized += '_'
            elif char.isalnum() or char in ['_', '$', '.']:
                sanitized += char
            else:
                sanitized += '_'
        
        return sanitized if sanitized else "unknown"

    def _parse_table_headers(self, table) -> Dict[str, int]:
        """Parse table headers and return column indices for common columns.
        
        This method dynamically detects table structure by examining headers,
        ensuring we don't miss required fields regardless of column order.
        Different Grafana Alloy documentation pages may have different table layouts.
        """
        rows = table.find_all('tr')
        if len(rows) < 1:
            return {}
        
        header_row = rows[0]
        header_cells = header_row.find_all(['th', 'td'])
        header_text = [cell.get_text().strip().lower() for cell in header_cells]
        
        column_map = {}
        
        for i, header in enumerate(header_text):
            # Map various header variations to standard names
            if header in ['name', 'block', 'property', 'field']:
                column_map['name'] = i
            elif header in ['type', 'data type']:
                column_map['type'] = i
            elif header in ['description', 'desc']:
                column_map['description'] = i
            elif header in ['default', 'default value']:
                column_map['default'] = i
            elif header in ['required', 'mandatory', 'req']:
                column_map['required'] = i
        
        # Fallback to positional mapping if specific headers not found
        if 'name' not in column_map and len(header_text) > 0:
            column_map['name'] = 0
        if 'description' not in column_map and len(header_text) > 1:
            column_map['description'] = 1
        if 'type' not in column_map and len(header_text) > 2:
            column_map['type'] = 2
        
        return column_map

    def _is_field_required(self, cells: List, column_map: Dict[str, int], field_name: str = "", description: str = "", type_info: str = "") -> bool:
        """Determine if a field is required based on table cell contents"""
        is_required = False
        
        # First check the dedicated Required column
        if 'required' in column_map and len(cells) > column_map['required']:
            required_text = cells[column_map['required']].get_text().strip().lower()
            is_required = 'yes' in required_text or 'true' in required_text or 'required' in required_text or required_text == '✓'
        
        # If no dedicated Required column or it's empty, check other indicators
        if not is_required:
            # Check type column for required indicators
            if type_info and ('required' in type_info.lower() or 'mandatory' in type_info.lower()):
                is_required = True
            
            # Check description for required indicators  
            if description and ('required' in description.lower() or 'mandatory' in description.lower()):
                is_required = True
            
            # Check any remaining columns for required indicators
            for i, cell in enumerate(cells):
                if i not in column_map.values():  # Skip already processed columns
                    cell_text = cell.get_text().strip().lower()
                    if ('yes' in cell_text and len(cell_text) <= 5) or cell_text == 'required' or cell_text == '✓':
                        is_required = True
                        break
        
        return is_required

    def _get_component_specific_requirements(self, component_name: str, comp: Dict) -> List[str]:
        """Get component-specific required attributes based on knowledge"""
        required = []

        # Only add component-specific requirements for properties (not blocks)
        # The usage parsing will handle block requirements dynamically
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
        elif component_name == 'prometheus.relabel':
            # Apply specific rule block properties for prometheus.relabel
            self._add_relabel_rule_properties(comp)
        elif component_name == 'otelcol.receiver.otlp':
            # For otelcol.receiver.otlp, http and grpc blocks are optional/recommended, not required
            # Both grpc and http blocks are alternative ways to configure the receiver
            if 'http' in comp['blocks']:
                comp['blocks']['http']['required'] = False
            if 'grpc' in comp['blocks']:
                comp['blocks']['grpc']['required'] = False

        return required

    def _add_relabel_rule_properties(self, comp: Dict):
        """Add specific properties for prometheus.relabel rule blocks"""
        if 'rule' not in comp['blocks']:
            comp['blocks']['rule'] = {
                'description': 'Relabeling rule configuration',
                'required': False,
                'properties': {}
            }
        
        # Define known rule properties based on Prometheus relabeling documentation
        rule_properties = {
            'action': {
                'type': 'string',
                'description': 'Action to take. Valid values: replace, keep, drop, hashmod, labelmap, labeldrop, labelkeep',
                'required': False,
                'default': 'replace'
            },
            'source_labels': {
                'type': 'list(string)', 
                'description': 'List of source label names whose values are concatenated with the separator and matched against the regex',
                'required': False,
                'default': ''
            },
            'separator': {
                'type': 'string',
                'description': 'Separator used to concatenate source label values',
                'required': False, 
                'default': ';'
            },
            'target_label': {
                'type': 'string',
                'description': 'Label name to which the replacement is written',
                'required': False,
                'default': ''
            },
            'regex': {
                'type': 'string',
                'description': 'Regular expression to match against concatenated source label values',
                'required': False,
                'default': '(.*)'
            },
            'modulus': {
                'type': 'int',
                'description': 'Modulus value for hashmod action',
                'required': False,
                'default': ''
            },
            'replacement': {
                'type': 'string', 
                'description': 'Replacement string for replace action. Can contain references to regex capture groups',
                'required': False,
                'default': '$1'
            },
            'value': {
                'type': 'string',
                'description': 'Value to use for the replacement when action is replace',
                'required': False,
                'default': ''
            }
        }
        
        comp['blocks']['rule']['properties'] = rule_properties

    def _apply_component_specific_overrides(self, component_name: str, comp: Dict):
        """Apply component-specific overrides after scraping"""
        if component_name == 'otelcol.receiver.otlp':
            # For otelcol.receiver.otlp, http and grpc blocks are optional/recommended, not required
            # Both grpc and http blocks are alternative ways to configure the receiver
            if 'http' in comp['blocks']:
                comp['blocks']['http']['required'] = False
                print(f"    Override: Set http block as optional for {component_name}")
            if 'grpc' in comp['blocks']:
                comp['blocks']['grpc']['required'] = False
                print(f"    Override: Set grpc block as optional for {component_name}")



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






