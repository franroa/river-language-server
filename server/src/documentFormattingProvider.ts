import {
  DocumentFormattingParams,
  TextEdit,
  TextDocuments,
  Position,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as utils from "./utils";

const execAsync = promisify(exec);

/**
 * Apply custom formatting to add missing commas in maps and remove quotes from keys
 */
function applyCustomFormatting(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inMap = false;
  let braceDepth = 0;
  let mapBraceLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Track brace depth to detect map blocks
    for (const char of line) {
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
    }

    // Check if we're entering a map
    if (line.includes("=")) {
      const equalsIndex = line.indexOf("=");
      const valuePart = line.substring(equalsIndex + 1).trim();
      if (valuePart.startsWith("{")) {
        inMap = true;
        mapBraceLevel = braceDepth;
      }
    }

    // Check if we've exited the map
    if (inMap && braceDepth < mapBraceLevel) {
      inMap = false;
    }

    // Apply custom formatting inside maps
    if (inMap && braceDepth > 0) {
      // Remove quotes from quoted keys and add commas
      line = line.replace(
        /^(\s*)("([^"]+)")\s*=\s*(.+?)(\s*\/\/.*)?$/gm,
        (match, indent, quotedKey, key, value, comment) => {
          // Remove quotes from key if it's a valid identifier or keep as string
          let cleanKey = key;
          // If the key is a valid identifier (letters, numbers, underscores, starting with letter), remove quotes
          if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(key)) {
            cleanKey = key;
          } else {
            cleanKey = `"${key}"`;
          }

          // Add comma at the end if not present and not a block opening
          let result = `${indent}${cleanKey} = ${value}`;
          if (!result.trim().endsWith(",") && !result.includes("//") && !value.trim().startsWith("{")) {
            result += ",";
          }
          if (comment) {
            result += comment;
          }
          return result;
        },
      );

      // Add commas to unquoted keys
      line = line.replace(
        /^(\s*)([a-zA-Z_][a-zA-Z0-9_.]*)\s*=\s*(.+?)(\s*\/\/.*)?$/gm,
        (match, indent, key, value, comment) => {
          // Add comma at the end if not present and not a block opening
          let result = `${indent}${key} = ${value}`;
          if (!result.trim().endsWith(",") && !result.includes("//") && !value.trim().startsWith("{")) {
            result += ",";
          }
          if (comment) {
            result += comment;
          }
          return result;
        },
      );
    }

    result.push(line);
  }

  return result.join("\n");
}

export async function provideDocumentFormatting(
  params: DocumentFormattingParams,
  documents: TextDocuments<TextDocument>,
): Promise<TextEdit[] | null> {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  try {
    let content = document.getText();

    // Stage 1: Apply custom formatting (add commas and remove quotes from keys)
    content = applyCustomFormatting(content);

    // Stage 2: Run alloy fmt on the custom formatted content
    // Create a temporary file with the custom formatted content
    const tempDir = os.tmpdir();
    const tempFileName = `alloy_format_${Date.now()}_${Math.random().toString(36).substring(7)}.alloy`;
    const tempFilePath = path.join(tempDir, tempFileName);

    // Write custom formatted content to temporary file
    fs.writeFileSync(tempFilePath, content, "utf8");

    try {
      // Run alloy fmt command and capture stdout
      const { stdout } = await execAsync(`alloy fmt "${tempFilePath}"`);

      // The formatted content is in stdout
      const formattedContent = stdout;

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);

      // Create edit for the entire document if there are changes
      if (formattedContent !== content) {
        const edits: TextEdit[] = [];
        const lines = document.getText().split("\n");
        const endLine = lines.length - 1;
        const endCharacter = lines[endLine]?.length || 0;

        edits.push({
          range: Range.create(
            Position.create(0, 0),
            Position.create(endLine, endCharacter),
          ),
          newText: formattedContent,
        });

        return edits;
      }

      return [];
     } catch (formatError: any) {
       // Clean up temporary file in case of error
       if (fs.existsSync(tempFilePath)) {
         fs.unlinkSync(tempFilePath);
       }

       // If alloy fmt fails, return the custom formatted content instead
       utils.ErrorHandler?.handleProviderError(
         "DocumentFormatting",
         formatError,
       );

       // Create edit with the custom formatted content
       const edits: TextEdit[] = [];
       const lines = document.getText().split("\n");
       const endLine = lines.length - 1;
       const endCharacter = lines[endLine]?.length || 0;

       edits.push({
         range: Range.create(
           Position.create(0, 0),
           Position.create(endLine, endCharacter),
         ),
         newText: content,
       });

       return edits;
     }
  } catch (error) {
    utils.ErrorHandler?.handleProviderError("DocumentFormatting", error);
    return null;
  }
}

