import {parentPort,workerData} from "node:worker_threads";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {scanPrivacyFile,privacyPolicyPreview,root} from "../check-customer-data.mjs";
import {executableIdentity} from "./privacy-coverage.mjs";
import {join} from "node:path";

const digest=value=>createHash("sha256").update(value).digest("hex");
try {
  const names=["privacy/customer-identifiers.sha256","privacy/approved-binary-assets.sha256","privacy/owned-github-pr-identities.json"];
  const bytes=await Promise.all(names.map(name=>readFile(join(root,name))));
  for(let index=0;index<names.length;index++)if(digest(bytes[index])!==workerData.ruleHashes[join(root,names[index])])throw Error("Privacy worker rules changed");
  const observed=await privacyPolicyPreview();
  if(observed.policy_sha256!==workerData.policySha256)throw Error("Privacy worker source/policy changed");
  const config={blockedDigests:new Set(bytes[0].toString("utf8").split(/\s+/u).filter(Boolean)),
    approvedBinaryDigests:new Set(bytes[1].toString("utf8").split(/\s+/u).filter(Boolean)),githubIdentities:JSON.parse(bytes[2]),
    archiveExecutable:(await executableIdentity("unzip")).path};
  parentPort.on("message",async request=>{
    try{
      if(!(request.body instanceof Uint8Array)||request.body.byteLength>8*1024*1024)throw Error("Privacy worker body exceeded bound");
      const body=Buffer.from(request.body.buffer,request.body.byteOffset,request.body.byteLength);
      const findings=await scanPrivacyFile(request.path,body,request.context,config);
      parentPort.postMessage({type:"result",id:request.id,policySha256:workerData.policySha256,pathSha256:digest(request.path),sha256:digest(body),
        contextSha256:digest(JSON.stringify(request.context)),findings});
    }catch{parentPort.postMessage({type:"failed"});}
  });
  parentPort.postMessage({type:"ready",policySha256:workerData.policySha256});
}catch{parentPort.postMessage({type:"failed"});}
