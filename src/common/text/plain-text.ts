/**
 * Text a shopper types that everyone else will read: a product's or shop's
 * name. No markup and no links, so the catalog cannot be used to post HTML or
 * spam; everything else a name might contain is fine.
 */
export const PLAIN_TEXT = /^(?![\s\S]*(<|>|:\/\/|\bwww\.))[\s\S]*$/i;

export const PLAIN_TEXT_MESSAGE = '$property must be plain text, without links or markup';
