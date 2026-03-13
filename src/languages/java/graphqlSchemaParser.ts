/**
 * GraphQL schema parser (Feature 27, Sub-PR 5)
 *
 * Parses .graphqls and .graphql schema files to extract:
 * 1. type Query { ... } fields as endpoint nodes with protocol: graphql
 * 2. type Mutation { ... } fields as endpoint nodes with protocol: graphql
 * 3. input types as parameter definitions
 *
 * Also detects DGS data fetcher annotations: @DgsQuery, @DgsMutation, @DgsData
 */

export interface GraphqlField {
  /** The field name (e.g. 'articles', 'createArticle') */
  name: string;
  /** 'query' or 'mutation' or 'subscription' */
  operationType: 'query' | 'mutation' | 'subscription';
  /** Return type as written in the schema */
  returnType: string;
  /** Arguments with their types */
  arguments: Array<{ name: string; type: string }>;
  line?: number;
}

export interface GraphqlInputType {
  name: string;
  fields: Array<{ name: string; type: string }>;
  line?: number;
}

export interface GraphqlSchema {
  filePath: string;
  queries: GraphqlField[];
  mutations: GraphqlField[];
  subscriptions: GraphqlField[];
  inputTypes: GraphqlInputType[];
}

/**
 * Parse a .graphqls or .graphql schema file.
 * Uses targeted regex parsing for the well-structured format.
 */
export function parseGraphqlSchema(content: string, filePath: string): GraphqlSchema {
  const queries = extractTypeFields(content, 'Query', 'query');
  const mutations = extractTypeFields(content, 'Mutation', 'mutation');
  const subscriptions = extractTypeFields(content, 'Subscription', 'subscription');
  const inputTypes = extractInputTypes(content);

  return { filePath, queries, mutations, subscriptions, inputTypes };
}

function extractTypeFields(
  content: string,
  typeName: string,
  operationType: 'query' | 'mutation' | 'subscription',
): GraphqlField[] {
  const fields: GraphqlField[] = [];

  // Match type Query { ... } or extend type Query { ... }
  const typePattern = new RegExp(
    `(?:extend\\s+)?type\\s+${typeName}\\s*\\{([\\s\\S]*?)\\}`,
    'g',
  );

  let typeMatch;
  while ((typeMatch = typePattern.exec(content)) !== null) {
    const body = typeMatch[1];
    const bodyStartLine = content.substring(0, typeMatch.index).split('\n').length;

    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // Field pattern: fieldName(arg1: Type1, arg2: Type2): ReturnType
      const fieldMatch = line.match(/^(\w+)\s*(?:\(([^)]*)\))?\s*:\s*(.+?)(?:\s*@.*)?$/);
      if (fieldMatch) {
        const args: Array<{ name: string; type: string }> = [];
        if (fieldMatch[2]) {
          const argParts = fieldMatch[2].split(',');
          for (const part of argParts) {
            const argMatch = part.trim().match(/(\w+)\s*:\s*(.+)/);
            if (argMatch) {
              args.push({ name: argMatch[1], type: argMatch[2].trim() });
            }
          }
        }

        fields.push({
          name: fieldMatch[1],
          operationType,
          returnType: fieldMatch[3].trim(),
          arguments: args,
          line: bodyStartLine + i,
        });
      }
    }
  }

  return fields;
}

function extractInputTypes(content: string): GraphqlInputType[] {
  const inputs: GraphqlInputType[] = [];
  const inputPattern = /input\s+(\w+)\s*\{([\s\S]*?)\}/g;

  let match;
  while ((match = inputPattern.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const line = content.substring(0, match.index).split('\n').length;

    const fields: Array<{ name: string; type: string }> = [];
    const fieldLines = body.split('\n');
    for (const fl of fieldLines) {
      const trimmed = fl.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const fieldMatch = trimmed.match(/(\w+)\s*:\s*(.+)/);
      if (fieldMatch) {
        fields.push({ name: fieldMatch[1], type: fieldMatch[2].trim() });
      }
    }

    inputs.push({ name, fields, line });
  }

  return inputs;
}

// ─── DGS Annotation Detection ───────────────────────────────────────────────

export interface DgsDataFetcher {
  /** Java/Kotlin method name */
  methodName: string;
  /** The annotation type: @DgsQuery, @DgsMutation, @DgsData, etc. */
  annotation: string;
  /** The parent type (from @DgsData parentType=) or implicit from @DgsQuery/@DgsMutation */
  parentType: string;
  /** The field name (from annotation value or method name) */
  fieldName: string;
  sourceFile: string;
  line?: number;
}

/**
 * Detect DGS data fetcher annotations from Java/Kotlin source.
 */
export function detectDgsAnnotations(sourceContent: string, filePath: string): DgsDataFetcher[] {
  const fetchers: DgsDataFetcher[] = [];
  const lines = sourceContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // @DgsQuery or @DgsQuery(field = "articles")
    const queryMatch = line.match(/@DgsQuery(?:\s*\(\s*(?:field\s*=\s*)?["']?(\w+)["']?\s*\))?/);
    if (queryMatch) {
      const methodName = findNextMethodName(lines, i);
      if (methodName) {
        fetchers.push({
          methodName,
          annotation: '@DgsQuery',
          parentType: 'Query',
          fieldName: queryMatch[1] || methodName,
          sourceFile: filePath,
          line: i + 1,
        });
      }
      continue;
    }

    // @DgsMutation
    const mutationMatch = line.match(/@DgsMutation(?:\s*\(\s*(?:field\s*=\s*)?["']?(\w+)["']?\s*\))?/);
    if (mutationMatch) {
      const methodName = findNextMethodName(lines, i);
      if (methodName) {
        fetchers.push({
          methodName,
          annotation: '@DgsMutation',
          parentType: 'Mutation',
          fieldName: mutationMatch[1] || methodName,
          sourceFile: filePath,
          line: i + 1,
        });
      }
      continue;
    }

    // @DgsData(parentType = "Article", field = "author")
    const dataMatch = line.match(/@DgsData\s*\(\s*parentType\s*=\s*["'](\w+)["'](?:\s*,\s*field\s*=\s*["'](\w+)["'])?\s*\)/);
    if (dataMatch) {
      const methodName = findNextMethodName(lines, i);
      if (methodName) {
        fetchers.push({
          methodName,
          annotation: '@DgsData',
          parentType: dataMatch[1],
          fieldName: dataMatch[2] || methodName,
          sourceFile: filePath,
          line: i + 1,
        });
      }
    }
  }

  return fetchers;
}

function findNextMethodName(lines: string[], fromLine: number): string | undefined {
  for (let j = fromLine + 1; j < Math.min(fromLine + 5, lines.length); j++) {
    // Java: public List<Article> articles(...) or fun articles(...)
    const methodMatch = lines[j].match(/(?:public|private|protected|fun)\s+\S+\s+(\w+)\s*\(/);
    if (methodMatch) return methodMatch[1];
    // Kotlin shorthand: fun articles(
    const kotlinMatch = lines[j].match(/fun\s+(\w+)\s*\(/);
    if (kotlinMatch) return kotlinMatch[1];
  }
  return undefined;
}

/**
 * Check if a file is a GraphQL schema file.
 */
export function isGraphqlSchemaFile(filePath: string): boolean {
  return /\.graphqls?$/.test(filePath);
}
