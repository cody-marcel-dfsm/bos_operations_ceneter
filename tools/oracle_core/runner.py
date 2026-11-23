"""Existing CLI judge transports, explicit capabilities and bounded output custody."""
from pathlib import Path
import json,os,shutil,signal,subprocess,threading,time
from .custody import immutable,digest,identity

# UnifiedExec is a backend selected only inside the ShellTool-enabled guard.
# Disabling ShellTool removes both shell and unified exec handlers.
ENVIRONMENT={'PATH','HOME','CODEX_HOME','OPENAI_API_KEY','ANTHROPIC_API_KEY','XDG_CACHE_HOME','SSL_CERT_FILE','SSL_CERT_DIR','LANG','LC_ALL','TMPDIR'}
DISABLED=('apps','shell_tool','skill_search','skill_mcp_dependency_install','hooks','plugins','remote_plugin','plugin_sharing','multi_agent','multi_agent_v2','memories','guardian_include_additional_context')


def codex_command(executable,model,effort,root,schema,output,prompt,policy,*,sandbox='read-only',portable=True):
    cmd=[executable,'exec','--ephemeral','--ignore-user-config','--model',model,
         '-c','developer_instructions='+json.dumps(policy),'--sandbox',sandbox,'--cd',str(root),
         '--output-schema',str(schema),'--output-last-message',str(output)]
    if effort is not None:cmd+=['-c','model_reasoning_effort='+json.dumps(effort)]
    if portable:
        cmd+=['--skip-git-repo-check','--strict-config','--ignore-rules','-c','approval_policy="never"','-c','mcp_servers={}','-c','project_doc_max_bytes=0','-c','skills.include_instructions=false','-c','skills.bundled.enabled=false','-c','web_search="disabled"']
        for name in DISABLED:cmd+=['--disable',name]
    return cmd+[prompt]


def environment(runner):
    excluded='ANTHROPIC_API_KEY' if runner['engine']=='codex' else 'OPENAI_API_KEY'
    return {k:v for k,v in os.environ.items() if k in ENVIRONMENT and k!=excluded}


def runtime(runner):
    executable=shutil.which(runner['executable'])
    if not executable:raise ValueError('Configured existing CLI is unavailable')
    return {'engine':runner['engine'],'model':runner['model'],'executable_sha256':digest(Path(executable).read_bytes()),
            'capabilities':{'sandbox':runner['sandbox'],'apps':False,'mcp':False,'shell':False,'automatic_project_context':False},
            'timeout_seconds':runner['timeout_seconds'],'maximum_output_bytes':runner['max_output_bytes'],
            'environment_sha256':identity({k:digest(v.encode()) for k,v in environment(runner).items()})}


def preflight(runner):
    meta=runtime(runner)
    if runner['engine']=='codex':
        help_run=subprocess.run([runner['executable'],'exec','--help'],capture_output=True,text=True,timeout=10)
        for flag in ['--ignore-user-config','--ephemeral','--strict-config','--skip-git-repo-check','--output-schema','--sandbox']:
            if help_run.returncode or flag not in help_run.stdout:raise ValueError('CLI capability restriction unsupported')
        args=[runner['executable'],'features','list']
        for name in DISABLED:args+=['--disable',name]
        status=subprocess.run(args,capture_output=True,text=True,timeout=10)
        lines={x.split()[0]:x.split()[-1] for x in status.stdout.splitlines() if x.split()}
        if status.returncode or any(lines.get(name)!='false' for name in DISABLED):raise ValueError('CLI tool restrictions unavailable')
    else:
        help_run=subprocess.run([runner['executable'],'--help'],capture_output=True,text=True,timeout=10)
        for flag in ['--bare','--disallowedTools','--restricted','--strict-mcp-config','--mcp-config','--tools','--allowedTools','--json-schema','--no-session-persistence']:
            if help_run.returncode or flag not in help_run.stdout:raise ValueError('CLI capability restriction unsupported')
    return meta


def run(runner,root,directory,prompt,policy,schema):
    meta=preflight(runner);directory=Path(directory);output=directory/'model-response.json';schema_path=directory/'response-schema.json'
    immutable(schema_path,schema)
    if runner['engine']=='codex':cmd=codex_command(runner['executable'],runner['model'],runner['reasoning_effort'],root,schema_path,output,prompt,policy)
    else:
        cmd=[runner['executable'],'--bare','--disallowedTools','*','-p','--output-format','json','--json-schema',json.dumps(schema),'--restricted','--strict-mcp-config',
             '--mcp-config','{"mcpServers":{}}','--tools','','--allowedTools','','--no-session-persistence','--model',runner['model'],
             '--append-system-prompt',policy,'--',prompt]
    immutable(directory/'runtime.json',meta)
    immutable(directory/'invocation.json',{'argv_sha256':identity(cmd),'schema_sha256':identity(schema),'prompt_sha256':digest(prompt.encode()),'policy_sha256':digest(policy.encode()),'runtime_sha256':identity(meta)})
    # Authentication remains CLI-owned. No shell or inherited model-auth body is read here.
    env=environment(runner)
    child=subprocess.Popen(cmd,cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    parts=[bytearray(),bytearray()];counts=[0,0];overflow=threading.Event();errors=[];guard=threading.Lock()
    def drain(stream,index):
        try:
            while True:
                block=stream.read1(65536)
                if not block:return
                with guard:
                    left=max(0,runner['max_output_bytes']-sum(counts));counts[index]+=len(block);parts[index].extend(block[:left])
                    if sum(counts)>runner['max_output_bytes']:overflow.set()
        except BaseException as exc:errors.append(type(exc).__name__)
    readers=[threading.Thread(target=drain,args=(stream,i),daemon=True) for i,stream in enumerate((child.stdout,child.stderr))]
    for thread in readers:thread.start()
    start=time.monotonic();failure=None
    while child.poll() is None:
        if overflow.is_set() or errors or time.monotonic()-start>=runner['timeout_seconds']:
            failure='output limit' if overflow.is_set() else 'output error' if errors else 'timeout';break
        time.sleep(.025)
    if failure:
        try:os.killpg(child.pid,signal.SIGTERM)
        except ProcessLookupError:pass
        try:child.wait(timeout=2)
        except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=2)
    for thread in readers:thread.join(2)
    if any(t.is_alive() for t in readers):
        try:os.killpg(child.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        failure=failure or 'descendant retained output'
        for thread in readers:thread.join(2)
    for name,raw in zip(['stdout','stderr'],parts):
        path=directory/(name+'.log');path.write_bytes(raw);path.chmod(0o600)
    immutable(directory/'process.json',{'exit_code':child.returncode,'failure':failure,'stdout_sha256':digest(parts[0]),'stderr_sha256':digest(parts[1]),'seconds':round(time.monotonic()-start,6)})
    if failure or child.returncode or overflow.is_set() or errors:raise RuntimeError('Model execution uncertain; retained operation must not be replayed')
    if runner['engine']=='claude':
        envelope=json.loads(parts[0]); reported=list(envelope.get('modelUsage',{}))
        if len(reported)!=1 or envelope.get('is_error'):raise ValueError('No single successful model identity')
        if reported[0]!=runner['model']:raise ValueError('Provider reported a different model identity')
        answer=envelope.get('structured_output')
        if answer is None:answer=json.loads(envelope.get('result') or '')
    else:
        if not output.is_file() or output.stat().st_size>runner['max_output_bytes']:raise ValueError('Model result unavailable or oversized')
        answer=json.loads(output.read_text())
    return answer,meta
