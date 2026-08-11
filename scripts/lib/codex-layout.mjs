import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const CODEX_MARKETPLACE_NAME = "bos-education-center-marketplace";

export function codexMarketplaceRoot(home = homedir()) {
  return join(resolve(home), ".agents", CODEX_MARKETPLACE_NAME);
}

export function codexMarketplaceManifest(home = homedir()) {
  return join(
    codexMarketplaceRoot(home),
    ".agents",
    "plugins",
    "marketplace.json"
  );
}

export function marketplaceRootFromManifest(manifestPath) {
  return dirname(dirname(dirname(resolve(manifestPath))));
}

export function codexProductRoot({
  home = homedir(),
  marketplace,
  product
}) {
  const marketplaceRoot = marketplace
    ? marketplaceRootFromManifest(marketplace)
    : codexMarketplaceRoot(home);
  return join(marketplaceRoot, "plugins", product);
}

export function legacyCodexProductRoot(home, product) {
  return join(resolve(home), "plugins", product);
}
