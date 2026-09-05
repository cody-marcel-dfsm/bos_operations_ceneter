import { fileURLToPath } from "node:url";

export async function linkCodexDevelopment() {
  throw new Error("Installed-client development links are prohibited. Publish a versioned Git release and install it through supported client controls.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  linkCodexDevelopment().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
