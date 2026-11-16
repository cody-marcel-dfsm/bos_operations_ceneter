import {build} from "esbuild";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {root,stableJson} from "./lib/package-model.mjs";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some(arg => arg !== "--check")) throw Error("Use --check only");
const lock = JSON.parse(await readFile(join(root,"package-lock.json")));
const installed = JSON.parse(await readFile(join(root,"node_modules/ws/package.json")));
if (installed.version !== "8.23.0" || lock.packages["node_modules/ws"].version !== installed.version) throw Error("Pinned ws dependency required");
const result = await build({entryPoints:[join(root,"scripts/entries/feedback-websocket-runtime.mjs")],bundle:true,write:false,
  platform:"node",target:"node20",format:"esm",minify:true,legalComments:"none",metafile:true,logLevel:"silent",
  define:{"process.env.WS_NO_BUFFER_UTIL":"true","process.env.WS_NO_UTF_8_VALIDATE":"true"},
  banner:{js:'import {createRequire as wsCreateRequire} from "node:module";const require=wsCreateRequire(import.meta.url);'}});
const bundle = Buffer.from(result.outputFiles[0].contents);
if (/\brequire\(["'](?:bufferutil|utf-8-validate|ws)["']\)/u.test(bundle.toString())) throw Error("Unbundled runtime dependency");
const license = await readFile(join(root,"node_modules/ws/LICENSE"));
const files = {};
for (const file of Object.keys(result.metafile.inputs).sort()) files[file] = sha256(await readFile(join(root,file)));
const provenance = Buffer.from(stableJson({package:"ws",version:installed.version,integrity:lock.packages["node_modules/ws"].integrity,
  files,bundle_sha256:sha256(bundle),license_sha256:sha256(license),optional_native_extensions:false}));
const directory=join(root,"source/host-runtime/bos-journey-notifications/vendor");
await mkdir(directory,{recursive:true});
for (const [name,bytes] of [["ws.bundle.mjs",bundle],["WS-LICENSE.txt",license],["ws.provenance.json",provenance]]) {
  const path=join(directory,name);
  if (check) {if (!(await readFile(path)).equals(bytes)) throw Error("Stale protected socket runtime: "+name);}
  else await writeFile(path,bytes);
}
console.log(check ? "Protected socket runtime is current" : "Protected socket runtime generated");
