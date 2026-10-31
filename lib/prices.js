// US$ per million tokens (Anthropic price list, October 2026). Cache reads and writes are priced separately.
// Used by the turn log (server.js) and the PM control panel (lib/pm.js). Add a vendor's models here when the
// bake-off switches to it; a model without a price shows its cost as "not priced".
const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
};

// Exchange rate for every EGP figure in the app (turn log, PM panel, ROI model). Synthetic; set EGP_PER_USD to change it.
const EGP_PER_USD = Number(process.env.EGP_PER_USD || 50);

// Cost of one step from the turn log: { model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens }.
function stepCost(step) {
  const price = PRICES[step.model];
  if (!price) return null;
  return (
    (step.input_tokens * price.input +
      step.output_tokens * price.output +
      step.cache_read_tokens * price.cache_read +
      step.cache_write_tokens * price.cache_write) / 1e6
  );
}

module.exports = { PRICES, stepCost, EGP_PER_USD };
