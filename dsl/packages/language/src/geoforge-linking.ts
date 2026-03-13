import { AstNode, AstNodeDescription, AstUtils, DefaultLinker, LinkingError, ReferenceInfo, Scope } from "langium";
import { isNamespace } from "./generated/ast.js";

export class geoforgeLinker extends DefaultLinker {

  // try both original name and within imported namespaces
  override getCandidate(refInfo: ReferenceInfo): AstNodeDescription | LinkingError {
    const scope = this.scopeProvider.getScope(refInfo)
    const refText = refInfo.reference.$refText
    const description = scope.getElement(refText)
        || this.tryImports(refText, refInfo.container,scope);
    return description ?? this.createLinkingError(refInfo);
  }

  private tryImports(refText: string, context: AstNode, scope: Scope): AstNodeDescription | undefined {
    const namespace = AstUtils.getContainerOfType(context, isNamespace)
    if (namespace) {
      for (const imp of namespace.imports) {
        const description = scope.getElement(`${imp.namespace}.${refText}`);
        if (description) {
          return description;
        }
      }
    }
    return undefined;
  }
}