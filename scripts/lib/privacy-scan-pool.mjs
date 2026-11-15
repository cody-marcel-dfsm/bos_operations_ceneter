import {Worker} from "node:worker_threads";
import {createHash} from "node:crypto";

const digest=value=>createHash("sha256").update(value).digest("hex");
export async function createPrivacyScanPool({policySha256,ruleHashes,count=4,WorkerClass=Worker}) {
  if(!/^[0-9a-f]{64}$/u.test(policySha256)||!Number.isSafeInteger(count)||count<1||count>4)throw Error("Bounded current privacy worker policy required");
  const slots=[];let stopped=false,sequence=0;
  const rejectAll=error=>{stopped=true;for(const slot of slots){slot.rejectReady?.(error);slot.job?.reject(error);slot.job=null;}};
  try {
    for(let index=0;index<count;index++){
      const worker=new WorkerClass(new URL("./privacy-scan-worker.mjs",import.meta.url),{
        workerData:{policySha256,ruleHashes},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:384,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
      const slot={worker,job:null,ready:null};slots.push(slot);
      slot.ready=new Promise((resolve,reject)=>{slot.resolveReady=resolve;slot.rejectReady=reject;});
      worker.on("error",()=>rejectAll(Error("Privacy worker failed; preserve completed observations")));
      worker.on("exit",()=>{if(!stopped)rejectAll(Error("Privacy worker exited before completion"));});
      worker.on("message",reply=>{
        if(reply?.type==="ready"&&reply.policySha256===policySha256&&!slot.initialized){slot.initialized=true;slot.resolveReady();return;}
        const job=slot.job;
        if(!job||reply?.type!=="result"||reply.id!==job.id||reply.policySha256!==policySha256||reply.pathSha256!==job.pathSha256||reply.sha256!==job.sha256||
            reply.contextSha256!==job.contextSha256||!Array.isArray(reply.findings)||reply.findings.some(value=>typeof value!=="string")){
          rejectAll(Error("Privacy worker input/policy/result identity mismatch"));return;
        }
        slot.job=null;job.resolve(reply.findings);
      });
    }
    await Promise.all(slots.map(slot=>slot.ready));
  }catch(error){stopped=true;await Promise.allSettled(slots.map(slot=>slot.worker.terminate()));throw error;}
  return Object.freeze({
    count,
    run(path,body,context){
      if(stopped||!Buffer.isBuffer(body)||body.length>8*1024*1024)return Promise.reject(Error("Privacy worker body/availability bound"));
      const slot=slots.find(row=>row.job===null);if(!slot)return Promise.reject(Error("Privacy worker queue exceeds fixed bound"));
      const bytes=new Uint8Array(body.length);bytes.set(body);
      return new Promise((resolve,reject)=>{
        const id=++sequence;slot.job={id,resolve,reject,pathSha256:digest(path),sha256:digest(body),contextSha256:digest(JSON.stringify(context))};
        slot.worker.postMessage({id,path,body:bytes,context},[bytes.buffer]);
      });
    },
    async close(){stopped=true;for(const slot of slots){slot.job?.reject(Error("Privacy scan pool closed"));slot.job=null;}
      await Promise.allSettled(slots.map(slot=>slot.worker.terminate()));}
  });
}
