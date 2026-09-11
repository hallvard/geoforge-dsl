import type { TokenType } from 'chevrotain';
import { DefaultTokenBuilder, GrammarAST, GrammarUtils, RegExpUtils } from 'langium';

interface TokenTypeWithRegex extends TokenType {
  geoforgeRegex?: RegExp;
}

/**
 * Langium's DefaultTokenBuilder can't tell a keyword like 'feature' apart from an identifier
 * that merely starts with it, e.g. 'featuretypes' -- Chevrotain then greedily tokenizes the
 * keyword and leaves 'types' dangling.
 *
 * The reason: to decide whether an identifier-like terminal is a LONGER_ALT for a keyword (so
 * Chevrotain prefers the longer identifier match over the shorter keyword), Langium's
 * findLongerAlt() reads `token.PATTERN.source`. But our ID terminal uses `\p{L}` and therefore
 * needs the regex 'u' flag, which Chevrotain doesn't support directly -- Langium works around
 * that by turning such terminals' PATTERN into a plain matcher *function* instead of a RegExp,
 * and functions have no `.source`, so the longer-alt check silently finds nothing for them.
 *
 * This subclass stashes the original (flagged) RegExp for any terminal that got the
 * function-pattern treatment, and re-checks those terminals in findLongerAlt using that
 * preserved regex (with its flags intact), rather than skipping them outright.
 */
export class GeoforgeTokenBuilder extends DefaultTokenBuilder {

  protected override buildTerminalToken(terminal: GrammarAST.TerminalRule): TokenType {
    const tokenType: TokenTypeWithRegex = super.buildTerminalToken(terminal);
    if (typeof tokenType.PATTERN === 'function') {
      tokenType.geoforgeRegex = GrammarUtils.terminalRegex(terminal);
    }
    return tokenType;
  }

  protected override findLongerAlt(keyword: GrammarAST.Keyword, terminalTokens: TokenType[]): TokenType[] {
    const longerAlts = super.findLongerAlt(keyword, terminalTokens);
    for (const token of terminalTokens) {
      const regex = (token as TokenTypeWithRegex).geoforgeRegex;
      if (!regex || longerAlts.includes(token)) {
        continue;
      }
      const anchored = new RegExp(`^(?:${regex.source})$`, regex.flags);
      if (RegExpUtils.partialMatches(anchored, keyword.value)) {
        longerAlts.push(token);
      }
    }
    return longerAlts;
  }
}
