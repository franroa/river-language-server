import { BlockContent } from "./types";

export function getBlockContent(
  text: string,
  startIndex: number,
): BlockContent | null {
  let braceLevel = 1;
  let endIndex = -1;
  let inString = false;
  let inComment = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    const prevChar = text[i - 1];

    if (char === '"' && prevChar !== "\\") {
      inString = !inString;
    }

    if (!inString) {
      if (char === "/" && text[i + 1] === "/") {
        inComment = true;
      }

      if (inComment) {
        if (char === "\n") {
          inComment = false;
        }
        continue;
      }

      if (char === "{") {
        braceLevel++;
      } else if (char === "}") {
        braceLevel--;
        if (braceLevel === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex === -1) return null;

  return {
    content: text.substring(startIndex, endIndex),
    endIndex: endIndex,
  };
}

export function findParentBlockType(text: string, offset: number): string | null {
  let parentBlockType: string | null = null;
  let braceLevel = 0;
  let searchOffset = offset;

  while (searchOffset > 0) {
    searchOffset--;
    const char = text[searchOffset];
    if (char === "}") braceLevel++;
    else if (char === "{") {
      if (braceLevel === 0) {
        const headerText = text.substring(0, searchOffset);
        const blockHeaderRegex = /([a-zA-Z0-9_.]+)(?:\s*".*?")?\s*$/;
        const match = headerText.match(blockHeaderRegex);
        if (match) {
          parentBlockType = match[1];
        }
        break;
      }
      braceLevel--;
    }
  }

  return parentBlockType;
}

export function findNestedBlockContext(text: string, offset: number): { component: string; block: string } | null {
  let componentName: string | null = null;
  let blockName: string | null = null;
  let braceLevel = 0;
  let searchOffset = offset;

  // First, find the immediate parent block
  while (searchOffset > 0) {
    searchOffset--;
    const char = text[searchOffset];
    if (char === "}") braceLevel++;
    else if (char === "{") {
      if (braceLevel === 0) {
        const headerText = text.substring(0, searchOffset);
        const blockHeaderRegex = /([a-zA-Z0-9_.]+)(?:\s*".*?")?\s*$/;
        const match = headerText.match(blockHeaderRegex);
        if (match) {
          blockName = match[1];
        }
        break;
      }
      braceLevel--;
    }
  }

  if (!blockName) return null;

  // Now find the component that contains this block
  braceLevel = 0;
  while (searchOffset > 0) {
    searchOffset--;
    const char = text[searchOffset];
    if (char === "}") braceLevel++;
    else if (char === "{") {
      if (braceLevel === 0) {
        const headerText = text.substring(0, searchOffset);
        // Try to match component with quotes first (main components)
        let componentHeaderRegex = /([a-zA-Z0-9_.]+)\s*".*?"\s*$/;
        let match = headerText.match(componentHeaderRegex);
        if (match) {
          componentName = match[1];
          break;
        }
        // If no match, try without quotes (nested blocks)
        componentHeaderRegex = /([a-zA-Z0-9_.]+)(?:\s*".*?")?\s*$/;
        match = headerText.match(componentHeaderRegex);
        if (match) {
          componentName = match[1];
          break;
        }
      }
      braceLevel--;
    }
  }

  if (componentName && blockName) {
    return { component: componentName, block: blockName };
  }

  return null;
}

export function findHoveredWord(line: string, characterPosition: number): string {
  const wordRegex = /[a-zA-Z0-9_.]+/g;
  let hoveredWord = "";
  let match;

  while ((match = wordRegex.exec(line))) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    if (characterPosition >= startIndex && characterPosition <= endIndex) {
      hoveredWord = match[0];
      break;
    }
  }

  return hoveredWord;
}