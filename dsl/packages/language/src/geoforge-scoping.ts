import { AstNode, AstNodeDescription, AstUtils, DefaultScopeComputation, DefaultScopeProvider, DocumentSegment, LangiumDocument, LocalSymbols, MultiMap, ReferenceInfo, Scope, stream, Stream, URI } from "langium";
import { isNamespace, Namespace } from "./generated/ast.js";
import { typeName } from "./geoforge-utils.js";

export class geoforgeScopeComputation extends DefaultScopeComputation {

  /**
   * Export the namespace itself and 
   * the top-level types using their fully qualified name.
   *
   * @param document The document to compute exports for
   * @returns The list of exported descriptions
   */
  override async collectExportedSymbols(document: LangiumDocument): Promise<AstNodeDescription[]> {
    const exportedDescriptions: AstNodeDescription[] = [];
    const namespace = document.parseResult.value as Namespace;
    const rootName = namespace.name;
    exportedDescriptions.push(this.descriptions.createDescription(namespace, rootName, document));
    for (const type of namespace.types) {
      const fqn = `${rootName}.${typeName(type)}`;
      exportedDescriptions.push(this.descriptions.createDescription(type, fqn, document));
    }
    return exportedDescriptions;
  }

  /**
   * Make top-level types available locally using their simple name.
   *
   * @param document The document to compute scopes for
   * @returns the scopes for the document
   */
  override async collectLocalSymbols(document: LangiumDocument): Promise<LocalSymbols> {
    const ns = document.parseResult.value as Namespace;
    // This multi-map stores a list of descriptions for each node in our document
    const scopes = new MultiMap<AstNode, AstNodeDescription>();
    const localDescriptions: AstNodeDescription[] = Array.from(ns.types)
        .map(type => this.descriptions.createDescription(type, typeName(type), document));
    scopes.addAll(ns, localDescriptions);
    return scopes;
  }
}

export class geoforgeScopeProvider extends DefaultScopeProvider {

  override getScope(context: ReferenceInfo): Scope {
    // log('geoforgeScopeProvider.getScope', context);
    return super.getScope(context);
  }

  override getGlobalScope(referenceType: string, context: ReferenceInfo): Scope {
    // replace with a scope that includes the imported namespace prefixes
    const globalScope = super.getGlobalScope(referenceType, context);
    const ns = AstUtils.getContainerOfType(context.container, isNamespace)
    if (! ns) {
      return globalScope;
    }
    const prefixes = ns.imports.map(imp => `${imp.namespace.$refText}.`)
    return prefixes.length === 0 ? globalScope : new ScopeWithPrefixes(prefixes, globalScope);
  }
}

class ScopeWithPrefixes implements Scope {

  constructor(readonly prefixes: string[], readonly delegate: Scope) {
  }

  /**
   * Looks up an element by its name, or, if the element is not found,
   * with the prefixes.
   *
   * @param name The name of the element to look up
   * @returns 
   */
  getElement(name: string): AstNodeDescription | undefined {
    var element = this.delegate.getElement(name);
    if (! element) {
      for (const prefix of this.prefixes) {
        element = this.delegate.getElement(`${prefix}${name}`);
        if (element) {
          break;
        }
      }
    }
    return element;
  }

  /**
   * Find all elements with all the prefixes applied.
   *
   * @param name The name of the element to look up
   * @returns 
   */
  getElements(name: string): Stream<AstNodeDescription> {
    return stream([ '', ...this.prefixes ])
        .flatMap(prefix => this.delegate.getElements(`${prefix}${name}`));
  }

  getAllElements(): Stream<AstNodeDescription> {
    const allElements = this.delegate.getAllElements();
    return allElements.flatMap(element => {
      const name = element.name;
      var unprefixedName = undefined
      for (const prefix of this.prefixes) {
        if (name.startsWith(prefix)) {
          unprefixedName = name.substring(prefix.length);
          break;
        }
      }
      return unprefixedName
          ? [element, new AstNodeDescriptionWithAltName(element, unprefixedName)]
          : element;
    })
  }
}

class AstNodeDescriptionWithAltName implements AstNodeDescription {
  node?: AstNode | undefined;
  nameSegment?: DocumentSegment | undefined;
  selectionSegment?: DocumentSegment | undefined;
  type: string;
  name: string;
  documentUri: URI;
  path: string;

  constructor(delegate: AstNodeDescription, altName: string) {
    this.node = delegate.node;
    this.nameSegment = delegate.nameSegment;
    this.selectionSegment = delegate.selectionSegment;
    this.type = delegate.type;
    this.documentUri = delegate.documentUri;
    this.path = delegate.path;

    // alternate name
    this.name = altName;
  }
} 