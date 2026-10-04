import {createServer} from 'node:net';
import {chmod,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {nativeCase,verifyNativeReviewer,reviewerConfigurationDigest} from './marketplace-native-run.mjs';
import {installedRelease} from './marketplace-installed-release.mjs';
import {digest} from './marketplace-prompt-catalog.mjs';

export function reviewerHostReceipt(result,item,catalog) {
  const {diagnostics,...receipt}=result;
  return {...receipt,prompt_sha256:digest(item.prompt),configuration_sha256:catalog.configuration_sha256};
}

// Optional maintainer-only capability for independently owned test runners.
// The caller executes no BOS source and receives only a sanitized case receipt.
export async function serveReviewerHost(config,{execute=nativeCase,verifyRelease=installedRelease}={}) {
  await verifyNativeReviewer(config);
  const directory=await mkdtemp(join(tmpdir(),'marketplace-reviewer-host-'));await chmod(directory,0o700);
  const socket=join(directory,'host.sock');
  const urlHash=createHash('sha256').update(config.reviewer_login_url).digest('hex');
  let busy=false;
  const server=createServer(connection=>{
    let buffer='',handled=false;
    connection.setTimeout(360000,()=>connection.destroy());
    const respond=value=>connection.end(JSON.stringify(value)+'\n');
    connection.on('error',()=>{});
    connection.on('data',chunk=>{
      if(handled)return;buffer+=chunk.toString();
      if(buffer.length>2*1024*1024){handled=true;respond({status:'FAIL',reason:'reviewer_host_request_invalid'});return;}
      if(!buffer.includes('\n'))return;handled=true;
      (async()=>{
        if(busy){respond({status:'FAIL',reason:'reviewer_host_busy'});return;}
        let request;try{request=JSON.parse(buffer.trim());}catch{respond({status:'FAIL',reason:'reviewer_host_request_invalid'});return;}
        const {catalog,item,release_expected,model}=request;
        if(request.reviewer_url_sha256!==urlHash||request.reviewer_configuration_sha256!==reviewerConfigurationDigest(config)||!['bos','education-center','my-crm'].includes(catalog?.product)||!catalog.cases?.some(row=>JSON.stringify(row)===JSON.stringify(item))||!model){respond({status:'FAIL',reason:'reviewer_host_binding_mismatch'});return;}
        const {configuration_sha256,...configuration}=catalog;
        if(digest(configuration)!==configuration_sha256){respond({status:'FAIL',reason:'reviewer_host_configuration_mismatch'});return;}
        busy=true;
        try {
          const release=await verifyRelease(catalog);
          if(release.release_commit!==release_expected?.release_commit||release.package_sha256!==release_expected?.package_sha256||release.version!==release_expected?.version)throw new Error('reviewer_host_release_mismatch');
          const bos=release.dependency??release;
          if(bos.release_commit!==release_expected?.bos_dependency?.release_commit||bos.package_sha256!==release_expected?.bos_dependency?.package_sha256)throw new Error('reviewer_host_dependency_mismatch');
          const result=await execute(catalog,item,config,release,model);
          if(result.diagnostics)console.error(JSON.stringify({product:catalog.product,id:item.id,status:result.status,diagnostics:result.diagnostics}));
          respond(reviewerHostReceipt(result,item,catalog));
        }catch{respond({status:'FAIL',reason:'reviewer_host_execution_or_release_failed'});}
        finally{busy=false;}
      })().catch(()=>respond({status:'FAIL',reason:'reviewer_host_failed'}));
    });
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(socket,done);});
  await chmod(socket,0o600);
  return {socket,close:async()=>{await new Promise(done=>server.close(done));await rm(directory,{recursive:true,force:true});}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [command,configPath]=process.argv.slice(2);
  if(command!=='--serve'||!configPath){console.error('Usage: --serve <external-private-reviewer-config.json>');process.exitCode=1;}
  else try {
    const host=await serveReviewerHost(JSON.parse(await readFile(configPath,'utf8')));
    console.log(JSON.stringify({reviewer_test_host_socket:host.socket}));
    const stop=async()=>{await host.close();process.exitCode=0;};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }catch{console.error('Reviewer test host failed: configuration or published prerequisite unavailable');process.exitCode=1;}
}
