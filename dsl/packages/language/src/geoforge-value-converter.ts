import { CstNode, DefaultValueConverter, GrammarAST, ValueType } from "langium";

export class geoforgeValueConverter extends DefaultValueConverter {
  override runConverter(rule: GrammarAST.AbstractRule, input: string, cstNode: CstNode): ValueType {
    if (rule.name === 'TimeLiteral') {
        return new Date(`1970-01-01T${input}Z`);
    } else {
        return super.runConverter(rule, input, cstNode);
    }
  }
}