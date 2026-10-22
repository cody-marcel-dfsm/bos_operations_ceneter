import assert from 'node:assert/strict';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat, symlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const builder = join(root, 'source/verticals/education-center/education-center-invoice-operations/scripts/build_bh_invoice.mjs');
const node = process.env.BOS_ARTIFACT_NODE;
const modules = process.env.BOS_ARTIFACT_MODULES;
const fixture = async t => {const dir=await mkdtemp(join(tmpdir(),'bos-private-artifacts-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;};
const input = () => ({date_submitted:'2026-10-22',center_name:'=1+1',address:'=1+1',billing_contact_name:'=1+1',phone_number:'=1+1',invoice_reference_number:'=1+1',rate_per_day:10,period_start:'2026-10-19',period_end:'2026-10-23',rows:['=1+1','+1+1','-1+1','@SUM(1,1)','\t=1+1','00123'].map(value=>({employee_name:value,employer:value,case_number:value,number_of_children:2,date_of_care:'2026-10-20',hours_of_care:7,other_comments:value}))});
const cellsScript = `import sys,json,zipfile,xml.etree.ElementTree as E
n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 strings=[]
 if 'xl/sharedStrings.xml' in z.namelist():
  strings=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',n)]
 result={}
 for c in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:c',n):
  f=c.find('s:f',n);v=c.find('s:v',n)
  value=v.text if v is not None else ''.join(c.find('s:is',n).itertext()) if c.find('s:is',n) is not None else None
  if c.get('t')=='s':value=strings[int(value)]
  result[c.get('r')]={'value':value,'formula':f.text if f is not None else None,'type':c.get('t')}
 print(json.dumps(result))`;

test('actual invoice serializer preserves literal text, calculations and private final-only output', {skip:!node||!modules}, async t=>{
 const dir=await fixture(t);await symlink(modules,join(dir,'node_modules'),'dir');
 const data=input(),file=join(dir,'input.json'),out=join(dir,'outputs','invoice.xlsx');await writeFile(file,JSON.stringify(data),{mode:0o600});
 const {stdout}=await exec(node,['--input-type=module','-e',"process.umask(0o022);const p=process.argv.splice(1,1)[0];await import(p);",builder,file,out],{cwd:dir,env:{...process.env}});
 const summary=JSON.parse(stdout);assert.equal(summary.invoice_total,120);assert.equal(summary.child_day_count,12);assert.equal(stdout.includes('Employee Name'),false);assert.equal(stdout.includes('@SUM'),false);
 const {stdout:xml}=await exec('python3',['-c',cellsScript,out]);const cells=JSON.parse(xml);
 for(const ref of ['B2','B3','B4','B5','B6']){assert.equal(cells[ref].value,'=1+1');assert.equal(cells[ref].formula,null);}
 const expected=data.rows.map(row=>row.employee_name).sort((a,b)=>a.localeCompare(b));
 for(let i=0;i<expected.length;i++)for(const column of ['A','B','C','I']){assert.equal(cells[column+(9+i)].value,expected[i]);assert.equal(cells[column+(9+i)].formula,null);}
 assert.deepEqual(Object.entries(cells).filter(([,c])=>c.formula!==null).map(([ref])=>ref).sort(),[...expected.map((_,i)=>'H'+(9+i)),'D16','H16'].sort());
 assert.equal(Number(cells.H16.value),120);assert.equal((await stat(out)).mode&0o777,0o600);assert.equal((await stat(join(dir,'outputs'))).mode&0o777,0o700);assert.deepEqual(await readdir(join(dir,'outputs')),['invoice.xlsx']);
 // A failed final publication keeps pre-existing contents and retires sidecars/previews.
 const blocked=join(dir,'outputs','blocked.xlsx');await mkdir(blocked);await assert.rejects(exec(node,[builder,file,blocked],{cwd:dir}));assert.deepEqual((await readdir(join(dir,'outputs'))).sort(),['blocked.xlsx','invoice.xlsx']);
 // The serializer strips a leading quote before '='; fail closed on data loss.
 data.rows[0].employee_name="'=1+1";await writeFile(file,JSON.stringify(data),{mode:0o600});await assert.rejects(exec(node,[builder,file,join(dir,'outputs','unsupported.xlsx')],{cwd:dir}),/could not preserve literal/);assert.deepEqual((await readdir(join(dir,'outputs'))).sort(),['blocked.xlsx','invoice.xlsx']);
});

test('both roster builders publish private SVG/PNG and clean failed converter derivatives under022',async t=>{
 const dir=await fixture(t),file=join(dir,'week.json');await writeFile(file,JSON.stringify({days:['Mon','Tue','Wed','Thu','Fri'].map(date=>({date,paid:[{name:'Example Student',camp:'Example Camp'}]}))}),{mode:0o600});
 const bin=join(dir,'bin');await mkdir(bin);const converter=join(bin,'rsvg-convert');
 for(const skill of ['education-center-class-operations','camp-capacity-planning']){
  const script=join(root,'source/verticals/education-center',skill,'scripts/render_week_calendar.py');
  const outputs=join(dir,skill),svg=join(outputs,'roster.svg'),png=join(outputs,'roster.png');
  const run=async output=>exec('python3',['-c',"import os,runpy,sys;os.umask(0o022);p=sys.argv.pop(1);runpy.run_path(p,run_name='__main__')",script,file,output],{env:{...process.env,PATH:bin+':'+process.env.PATH}});
  await run(svg);assert.equal((await stat(svg)).mode&0o777,0o600);assert.equal((await stat(outputs)).mode&0o777,0o700);assert.match(await readFile(svg,'utf8'),/Example Student/);
  await writeFile(converter,'#!/usr/bin/env python3\nimport sys\nfrom pathlib import Path\nPath(sys.argv[2]).write_bytes(b"synthetic-png")\n',{mode:0o700});await run(png);assert.equal((await stat(png)).mode&0o777,0o600);
  await writeFile(converter,'#!/usr/bin/env python3\nimport sys\nfrom pathlib import Path\nPath(sys.argv[2]).write_bytes(b"partial")\nsys.exit(1)\n',{mode:0o700});await assert.rejects(run(png),/Private roster conversion failed/);assert.equal(await readFile(png,'utf8'),'synthetic-png');assert.deepEqual((await readdir(outputs)).sort(),['roster.png','roster.svg']);
 }
});
