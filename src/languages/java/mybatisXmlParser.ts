/**
 * MyBatis XML mapper parser (Feature 27, Sub-PR 5)
 *
 * Parses MyBatis XML mapper files to extract:
 * 1. <mapper namespace="..."> — linking to Java @Mapper interface
 * 2. <select>, <insert>, <update>, <delete> — as repository-query nodes
 * 3. <if>, <choose>/<when>/<otherwise>, <foreach> — as conditional branch nodes
 * 4. <resultMap>, <association> — as DB schema evidence
 */

export interface MyBatisQuery {
  /** The SQL operation id (method name in the mapper interface) */
  id: string;
  /** SQL operation type */
  type: 'select' | 'insert' | 'update' | 'delete';
  /** The result type if specified */
  resultType?: string;
  /** The result map id if specified */
  resultMap?: string;
  /** The parameter type if specified */
  parameterType?: string;
  /** Whether the query has conditional branches (<if>, <choose>) */
  hasConditionals: boolean;
  /** Number of conditional branches */
  conditionalCount: number;
  line?: number;
}

export interface MyBatisResultMap {
  id: string;
  type: string;
  associations: string[];
  collections: string[];
}

export interface MyBatisMapperFile {
  /** Java interface FQCN from namespace attribute */
  namespace: string;
  /** Path to the XML file */
  filePath: string;
  /** Parsed queries */
  queries: MyBatisQuery[];
  /** Parsed result maps */
  resultMaps: MyBatisResultMap[];
}

/**
 * Parse a MyBatis mapper XML file.
 * Uses regex-based parsing since MyBatis XML is highly structured.
 */
export function parseMyBatisMapper(xmlContent: string, filePath: string): MyBatisMapperFile | null {
  // Extract namespace
  const namespaceMatch = xmlContent.match(/<mapper\s+namespace\s*=\s*["']([^"']+)["']/);
  if (!namespaceMatch) return null;

  const namespace = namespaceMatch[1];
  const queries = extractQueries(xmlContent);
  const resultMaps = extractResultMaps(xmlContent);

  return { namespace, filePath, queries, resultMaps };
}

function extractQueries(xml: string): MyBatisQuery[] {
  const queries: MyBatisQuery[] = [];
  const queryTypes = ['select', 'insert', 'update', 'delete'] as const;

  for (const type of queryTypes) {
    // Match opening tag with attributes
    const tagPattern = new RegExp(
      `<${type}\\s+([^>]*)>([\\s\\S]*?)</${type}>`,
      'gi',
    );
    let match;
    while ((match = tagPattern.exec(xml)) !== null) {
      const attrs = match[1];
      const body = match[2];

      const idMatch = attrs.match(/id\s*=\s*["']([^"']+)["']/);
      if (!idMatch) continue;

      const resultTypeMatch = attrs.match(/resultType\s*=\s*["']([^"']+)["']/);
      const resultMapMatch = attrs.match(/resultMap\s*=\s*["']([^"']+)["']/);
      const paramTypeMatch = attrs.match(/parameterType\s*=\s*["']([^"']+)["']/);

      // Count conditionals
      const ifCount = (body.match(/<if\b/g) || []).length;
      const chooseCount = (body.match(/<choose\b/g) || []).length;
      const foreachCount = (body.match(/<foreach\b/g) || []).length;
      const conditionalCount = ifCount + chooseCount + foreachCount;

      // Compute approximate line number
      const prefix = xml.substring(0, match.index);
      const line = (prefix.match(/\n/g) || []).length + 1;

      queries.push({
        id: idMatch[1],
        type,
        resultType: resultTypeMatch?.[1],
        resultMap: resultMapMatch?.[1],
        parameterType: paramTypeMatch?.[1],
        hasConditionals: conditionalCount > 0,
        conditionalCount,
        line,
      });
    }
  }

  return queries;
}

function extractResultMaps(xml: string): MyBatisResultMap[] {
  const resultMaps: MyBatisResultMap[] = [];

  const rmPattern = /<resultMap\s+([^>]*)>([\s\S]*?)<\/resultMap>/gi;
  let match;
  while ((match = rmPattern.exec(xml)) !== null) {
    const attrs = match[1];
    const body = match[2];

    const idMatch = attrs.match(/id\s*=\s*["']([^"']+)["']/);
    const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/);
    if (!idMatch || !typeMatch) continue;

    // Extract associations
    const associations: string[] = [];
    const assocPattern = /javaType\s*=\s*["']([^"']+)["']/g;
    let assocMatch;
    while ((assocMatch = assocPattern.exec(body)) !== null) {
      associations.push(assocMatch[1]);
    }

    // Extract collections
    const collections: string[] = [];
    const collPattern = /<collection[^>]*ofType\s*=\s*["']([^"']+)["']/g;
    let collMatch;
    while ((collMatch = collPattern.exec(body)) !== null) {
      collections.push(collMatch[1]);
    }

    resultMaps.push({
      id: idMatch[1],
      type: typeMatch[1],
      associations,
      collections,
    });
  }

  return resultMaps;
}

/**
 * Check if a file is a MyBatis XML mapper.
 */
export function isMyBatisMapperXml(content: string): boolean {
  return /<mapper\s+namespace\s*=/.test(content) &&
    (/<select\b/.test(content) || /<insert\b/.test(content) ||
     /<update\b/.test(content) || /<delete\b/.test(content));
}
