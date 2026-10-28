import product from '../../../product.config.json' with { type: 'json' };
export const PRODUCT = { ...product, wordmark: product.name.toLowerCase() };
