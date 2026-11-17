import {
  DocumentLinkParams,
  DocumentLink,
  Range
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver/node";

/**
 * Provides document links for URLs, file paths, and other clickable elements in Alloy files
 */
export function provideDocumentLinks(
  params: DocumentLinkParams,
  documents: TextDocuments<TextDocument>
): DocumentLink[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const text = document.getText();
  const lines = text.split('\n');
  const links: DocumentLink[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    
    // Find HTTP/HTTPS URLs
    const urlMatches = findUrls(line, lineIndex);
    links.push(...urlMatches);

    // Find file paths
    const fileMatches = findFilePaths(line, lineIndex);
    links.push(...fileMatches);

    // Find Alloy-specific references
    const alloyMatches = findAlloyReferences(line, lineIndex);
    links.push(...alloyMatches);
  }

  return links;
}

/**
 * Find HTTP/HTTPS URLs in a line
 */
function findUrls(line: string, lineIndex: number): DocumentLink[] {
  const links: DocumentLink[] = [];
  
  // Regex for HTTP/HTTPS URLs
  const urlRegex = /https?:\/\/[^\s"'`\]}\)]+/gi;
  let match;

  while ((match = urlRegex.exec(line)) !== null) {
    const url = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + url.length;

    // Clean up common trailing punctuation
    let cleanUrl = url;
    let adjustedEnd = endIndex;
    
    while (cleanUrl.length > 0 && /[.,;:!?\]})\s]$/.test(cleanUrl)) {
      cleanUrl = cleanUrl.slice(0, -1);
      adjustedEnd--;
    }

    if (cleanUrl.length > 8) { // Minimum valid URL length
      links.push({
        range: Range.create(lineIndex, startIndex, lineIndex, adjustedEnd),
        target: cleanUrl
      });
    }
  }

  // Also check for URLs in quoted strings
  const quotedUrlRegex = /["'`](https?:\/\/[^"'`]+)["'`]/gi;
  while ((match = quotedUrlRegex.exec(line)) !== null) {
    const url = match[1];
    const startIndex = match.index + 1; // Skip opening quote
    const endIndex = startIndex + url.length;

    links.push({
      range: Range.create(lineIndex, startIndex, lineIndex, endIndex),
      target: url
    });
  }

  return links;
}

/**
 * Find file paths in a line
 */
function findFilePaths(line: string, lineIndex: number): DocumentLink[] {
  const links: DocumentLink[] = [];

  // Look for file paths in common Alloy contexts
  const filePatterns = [
    // File paths in quotes
    /["'`]([.\/][^"'`\s]+\.(?:alloy|json|yaml|yml|toml|pem|crt|key|log))["'`]/gi,
    // Unix-style paths
    /(?:^|\s)(\/[^\s"'`]+\.(?:alloy|json|yaml|yml|toml|pem|crt|key|log))(?:\s|$)/gi,
    // Relative paths
    /(?:^|\s)(\.\.[^\s"'`]*\.(?:alloy|json|yaml|yml|toml|pem|crt|key|log))(?:\s|$)/gi
  ];

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const filePath = match[1];
      const startIndex = match.index + (match[0].indexOf(filePath));
      const endIndex = startIndex + filePath.length;

      // Convert to file:// URI if it's an absolute path
      let target = filePath;
      if (filePath.startsWith('/')) {
        target = `file://${filePath}`;
      }
      // For relative paths, we could resolve them relative to the current document
      // but for now, just make them clickable as-is

      links.push({
        range: Range.create(lineIndex, startIndex, lineIndex, endIndex),
        target: target
      });
    }
  }

  return links;
}

/**
 * Find Alloy-specific references that could be clickable
 */
function findAlloyReferences(line: string, lineIndex: number): DocumentLink[] {
  const links: DocumentLink[] = [];

  // Prometheus metrics endpoints
  const metricsRegex = /["'`](\/[^"'`]*\/metrics[^"'`]*)["'`]/gi;
  let match;
  while ((match = metricsRegex.exec(line)) !== null) {
    const path = match[1];
    const startIndex = match.index + 1;
    const endIndex = startIndex + path.length;

    // Could be enhanced to construct full URLs if we know the base URL
    links.push({
      range: Range.create(lineIndex, startIndex, lineIndex, endIndex),
      target: `http://localhost${path}` // Default assumption
    });
  }

  // Look for Docker image references
  const dockerImageRegex = /["'`]([a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\/[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+)["'`]/gi;
  while ((match = dockerImageRegex.exec(line)) !== null) {
    const image = match[1];
    const startIndex = match.index + 1;
    const endIndex = startIndex + image.length;

    // Link to Docker Hub
    const imageParts = image.split('/');
    const imageName = imageParts.length > 1 ? imageParts.slice(-1)[0] : image;
    const namespace = imageParts.length > 1 ? imageParts[0] : 'library';
    
    links.push({
      range: Range.create(lineIndex, startIndex, lineIndex, endIndex),
      target: `https://hub.docker.com/r/${namespace}/${imageName.split(':')[0]}`
    });
  }

  // Look for GitHub repository references
  const githubRegex = /["'`](?:https:\/\/)?github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)["'`]/gi;
  while ((match = githubRegex.exec(line)) !== null) {
    const repo = match[1];
    const fullMatch = match[0];
    const startIndex = match.index + 1;
    let endIndex = startIndex + fullMatch.length - 2; // Account for quotes

    // If it already has https://, use as-is, otherwise construct URL
    let target = fullMatch.slice(1, -1); // Remove quotes
    if (!target.startsWith('https://')) {
      target = `https://github.com/${repo}`;
      endIndex = startIndex + repo.length + 'github.com/'.length;
    }

    links.push({
      range: Range.create(lineIndex, startIndex, lineIndex, endIndex),
      target: target
    });
  }

  // Look for IP addresses and ports (common in Alloy configs)
  const ipPortRegex = /["'`](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+)["'`]/gi;
  while ((match = ipPortRegex.exec(line)) !== null) {
    const address = match[1];
    const startIndex = match.index + 1;
    const endIndex = startIndex + address.length;

    links.push({
      range: Range.create(lineIndex, startIndex, lineIndex, endIndex),
      target: `http://${address}` // Assume HTTP for clickability
    });
  }

  return links;
}

/**
 * Resolve a document link (if the client supports it)
 */
export function resolveDocumentLink(link: DocumentLink): DocumentLink {
  // For now, just return the link as-is
  // In the future, this could be used to:
  // - Resolve relative paths to absolute paths
  // - Validate that URLs are accessible
  // - Add tooltips or additional data
  return link;
}