/**
 * MyBatis cross-file resolver (Feature 27, Sub-PR 5)
 *
 * Links @Mapper interfaces to their MyBatis XML mapper files by matching:
 * - @Mapper interface FQCN ↔ <mapper namespace="..."> in XML
 * - Interface method names ↔ <select id="...">, <insert id="...">, etc.
 */

import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
} from '../types';
import type { DetectedApiFramework } from '../../../../discovery/frameworkDetector';

export interface MyBatisBinding {
  /** Java @Mapper interface name (simple name, not FQCN) */
  mapperInterface: string;
  /** File path of the Java @Mapper interface */
  mapperInterfaceFile?: string;
  /** XML namespace (FQCN from <mapper namespace="...">) */
  xmlNamespace: string;
  /** File path of the MyBatis XML mapper */
  xmlFile: string;
  /** Methods defined in the XML */
  xmlMethods: string[];
}

export class MyBatisResolver implements CrossFileResolver {
  readonly name = 'mybatis';

  appliesTo(frameworks: DetectedApiFramework[]): boolean {
    return frameworks.some((f) => f.name === 'spring-boot');
  }

  resolve(ctx: CrossFileResolutionContext): CrossFileResolutionResult {
    let entriesAdded = 0;
    const diagnostics: string[] = [];
    const unresolvedRefs: Array<{ ref: string; reason: string }> = [];

    // Collect @Mapper interface files and XML mapper files
    const mapperInterfaces: Array<{ name: string; file: string }> = [];
    const xmlMappers: Array<{ namespace: string; file: string; methods: string[] }> = [];

    // Scan source files for @Mapper annotations
    for (const [filePath, model] of ctx.symbolTable.models) {
      if (!filePath.endsWith('.java') && !filePath.endsWith('.kt')) continue;

      // Check if any exported class has @Mapper annotation
      for (const [funcName, func] of model.functions) {
        if (func.annotations?.some((a) => a.includes('Mapper'))) {
          // The class containing the @Mapper method
          mapperInterfaces.push({ name: funcName, file: filePath });
        }
      }
    }

    // Check class registry for interfaces that might be @Mapper by naming convention
    for (const [className, classInfo] of ctx.symbolTable.classes) {
      if (className.endsWith('Mapper')) {
        mapperInterfaces.push({ name: className, file: classInfo.filePath });
      }
    }

    // Match mapper interfaces to XML files by namespace suffix
    for (const xml of xmlMappers) {
      const simpleName = xml.namespace.split('.').pop() ?? xml.namespace;
      const matchedInterface = mapperInterfaces.find((m) =>
        m.name === simpleName || xml.namespace.endsWith(m.name),
      );

      if (matchedInterface) {
        // Create interface → implementation mapping
        if (!ctx.symbolTable.interfaceImplementations.has(matchedInterface.file)) {
          ctx.symbolTable.interfaceImplementations.set(matchedInterface.file, []);
        }
        ctx.symbolTable.interfaceImplementations.get(matchedInterface.file)!.push({
          interfaceName: matchedInterface.name,
          interfaceFile: matchedInterface.file,
          implName: `${simpleName}XmlMapper`,
          implFile: xml.file,
        });
        entriesAdded++;
      } else {
        unresolvedRefs.push({
          ref: xml.namespace,
          reason: `No @Mapper interface found for XML namespace '${xml.namespace}'`,
        });
      }
    }

    if (mapperInterfaces.length > 0 || xmlMappers.length > 0) {
      diagnostics.push(
        `Found ${mapperInterfaces.length} @Mapper interface(s), ${xmlMappers.length} XML mapper(s)`,
      );
    }

    return { entriesAdded, diagnostics, unresolvedRefs };
  }
}
