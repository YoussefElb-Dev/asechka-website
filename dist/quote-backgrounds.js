// UUID-based variety stays steady on refresh and matches the native apps.
export const QUOTE_BACKGROUND_COUNT = 10;
export function nextQuoteBackground(key, previous = -1) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  const choice = hash % QUOTE_BACKGROUND_COUNT;
  return choice === previous ? (choice + 1 + Math.floor(hash / QUOTE_BACKGROUND_COUNT) % (QUOTE_BACKGROUND_COUNT - 1)) % QUOTE_BACKGROUND_COUNT : choice;
}
export const quoteBackgroundSource = index => `assets/quote-backgrounds/orbit-${String(index + 1).padStart(2, '0')}.jpg`;
export function quoteBackgroundSequence(keys, looping = false) {
  let previous = -1;
  const choices = keys.map(key => previous = nextQuoteBackground(key, previous));
  if (looping && choices.length > 1 && choices.at(-1) === choices[0]) {
    let choice = choices.at(-1);
    do { choice = (choice + 1) % QUOTE_BACKGROUND_COUNT; } while (choice === choices[0] || choice === choices.at(-2));
    choices[choices.length - 1] = choice;
  }
  return choices;
}
