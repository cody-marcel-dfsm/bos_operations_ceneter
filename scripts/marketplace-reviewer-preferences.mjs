import {pathToFileURL} from 'node:url';
import {readPublishedFile} from './marketplace-published-package.mjs';
import {installedPath} from './marketplace-native-resources.mjs';

const helperPath='skills/bos-mcp-client/scripts/customer-preferences.mjs';
const supportedProducts=new Set(['bos','education-center','my-crm']);

// Read the requesting plugin's existing store. Explicit reviewer scope replaces
// saved intent for this request; preference values never enter actor evidence.
export async function readReviewerPreferences(product,bos,dependencies={}) {
 if(!supportedProducts.has(product))throw new Error('reviewer_preference_read_failed');
 const verify=dependencies.verify??readPublishedFile;
 const locate=dependencies.locate??installedPath;
 const load=dependencies.load??(path=>import(pathToFileURL(path).href));
 try {
  await verify(bos.path,bos.release_commit,helperPath);
  const helper=await load(await locate(bos.path,helperPath));
  const preferences=await helper.readPluginPreferences(product);
  return {plugin_name:product,read_performed:true,default_present:preferences!==null,values_discarded:true,write_performed:false};
 }catch{throw new Error('reviewer_preference_read_failed');}
}
