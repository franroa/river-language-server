#!/usr/bin/env python3
"""
Grafana Alloy Types Scraper

This script scrapes type information from the Grafana Alloy documentation
and extracts details about supported value types, naming conventions, and special types.
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from typing import Dict, List, Any
import sys


class AlloyTypesScraper:
    """Scraper for Grafana Alloy type documentation."""

    def __init__(self, url: str):
        self.url = url
        self.types_data = {}

    def fetch_content(self) -> str:
        """Fetch the webpage content."""
        try:
            response = requests.get(self.url, timeout=30)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            print(f"Error fetching content: {e}")
            sys.exit(1)

    def parse_markdown_content(self, html_content: str) -> Dict[str, Any]:
        """Parse the HTML content and extract type information."""
        soup = BeautifulSoup(html_content, 'html.parser')

        # Find the main content area
        content_div = soup.find('div', {'class': 'content'})
        if not content_div:
            # Try alternative selectors
            content_div = soup.find('main') or soup.find('article') or soup

        # Extract text content
        text_content = content_div.get_text()



        # Parse different sections
        types_info = {
            'basic_types': self._extract_basic_types(text_content),
            'naming_conventions': self._extract_naming_conventions(text_content),
            'special_types': self._extract_special_types(text_content),
            'duration_formats': self._extract_duration_formats(text_content)
        }

        return types_info

    def _extract_basic_types(self, content: str) -> Dict[str, str]:
        """Extract information about basic value types."""
        basic_types = {}

        # Extract basic types list
        basic_types_match = re.search(
            r'The Alloy syntax supports the following value types:(.*?)(?=Naming convention)',
            content,
            re.DOTALL
        )

        if basic_types_match:
            types_text = basic_types_match.group(1)

            # Split by type names and extract descriptions
            # The content seems to be concatenated, so we'll split by type names
            parts = re.split(r'(\w+:)', types_text)

            current_type = None
            for part in parts:
                part = part.strip()
                if part.endswith(':') and part[:-1] in ['number', 'string', 'bool', 'array', 'object', 'function', 'null']:
                    current_type = part[:-1]
                elif current_type and part:
                    # Clean up the description by removing subsequent type mentions
                    description = part
                    # Remove any subsequent "type: description" patterns
                    description = re.sub(r'\w+:\s*.*?(?=\w+:|$)', '', description).strip()
                    if description:
                        basic_types[current_type] = description
                        current_type = None

        return basic_types

    def _extract_naming_conventions(self, content: str) -> Dict[str, str]:
        """Extract naming conventions for types."""
        conventions = {}

        # Find naming convention section
        naming_section = re.search(
            r'Naming convention(.*?)(?=Numbers|##)',
            content,
            re.DOTALL
        )

        if naming_section:
            section_text = naming_section.group(1)

            # Extract individual conventions
            convention_patterns = [
                (r'any:\s*(.*?)(?=\n\w+\(|map\(|list\(|duration:|\n\n|$)', 'any'),
                (r'map\(T\):\s*(.*?)(?=\n\w+\(|list\(|duration:|\n\n|$)', 'map'),
                (r'list\(T\):\s*(.*?)(?=\n\w+\(|duration:|\n\n|$)', 'list'),
                (r'duration:\s*(.*?)(?=\n\w+\(|Valid|\n\n|$)', 'duration')
            ]

            for pattern, convention_name in convention_patterns:
                match = re.search(pattern, section_text, re.DOTALL)
                if match:
                    conventions[convention_name] = match.group(1).strip()

        return conventions

    def _extract_special_types(self, content: str) -> Dict[str, str]:
        """Extract information about special types."""
        special_types = {}

        # Find special types section
        special_section = re.search(
            r'Special types(.*?)(?=##|\n\n##|$)',
            content,
            re.DOTALL
        )

        if special_section:
            section_text = special_section.group(1)

            # Extract secrets and capsules information
            secrets_match = re.search(
                r'Secrets(.*?)(?=Capsules|\n\n|$)',
                section_text,
                re.DOTALL
            )
            if secrets_match:
                special_types['secrets'] = secrets_match.group(1).strip()

            capsules_match = re.search(
                r'Capsules(.*?)(?=\n\n|$)',
                section_text,
                re.DOTALL
            )
            if capsules_match:
                special_types['capsules'] = capsules_match.group(1).strip()

        return special_types

    def _extract_duration_formats(self, content: str) -> Dict[str, Any]:
        """Extract duration format information."""
        duration_info = {}

        # Find duration information
        duration_match = re.search(
            r'Valid units include:(.*?)(?=\n\n|\n\s*[A-Z]|\n\s*\[)',
            content,
            re.DOTALL
        )

        if duration_match:
            units_text = duration_match.group(1)
            # Extract unit descriptions
            units = []
            unit_matches = re.findall(r'([hmsn]+) for ([^.]+)', units_text)
            for unit, description in unit_matches:
                units.append({
                    'unit': unit,
                    'description': description.strip()
                })

            duration_info['valid_units'] = units

            # Extract combination example
            combo_match = re.search(
                r'You can combine values.*?For example, ([^,]+).*?equivalent to ([^\.]+)',
                content,
                re.DOTALL
            )
            if combo_match:
                duration_info['combination_example'] = {
                    'original': combo_match.group(1).strip(),
                    'equivalent': combo_match.group(2).strip()
                }

        return duration_info

    def save_to_json(self, data: Dict[str, Any], filename: str):
        """Save extracted data to JSON file."""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Data saved to {filename}")
        except IOError as e:
            print(f"Error saving to file: {e}")

    def print_summary(self, data: Dict[str, Any]):
        """Print a summary of extracted information."""
        print("=== Grafana Alloy Types Summary ===\n")

        print("Basic Types:")
        for type_name, description in data.get('basic_types', {}).items():
            print(f"  • {type_name}: {description[:100]}...")

        print("\nNaming Conventions:")
        for convention, description in data.get('naming_conventions', {}).items():
            print(f"  • {convention}: {description[:100]}...")

        print("\nSpecial Types:")
        for special_type, description in data.get('special_types', {}).items():
            print(f"  • {special_type}: {description[:100]}...")

        print("\nDuration Units:")
        for unit_info in data.get('duration_formats', {}).get('valid_units', []):
            print(f"  • {unit_info['unit']}: {unit_info['description']}")


def main():
    """Main function to run the scraper."""
    url = "https://grafana.com/docs/alloy/latest/get-started/configuration-syntax/expressions/types_and_values/"

    scraper = AlloyTypesScraper(url)

    print("Fetching Grafana Alloy types documentation...")
    html_content = scraper.fetch_content()

    print("Parsing content...")
    types_data = scraper.parse_markdown_content(html_content)

    print("Saving data...")
    scraper.save_to_json(types_data, 'alloy_types.json')

    print("\nExtraction complete!")
    scraper.print_summary(types_data)


if __name__ == "__main__":
    main()