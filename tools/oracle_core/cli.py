"""Standalone explicit-input CLI; generates private evidence only."""
from pathlib import Path
import argparse,json,sys
from .config import load,relative
from .index import Index
from .proposal import judge,recover


def main(argv=None):
    parser=argparse.ArgumentParser();commands=parser.add_subparsers(dest='command',required=True)
    for name in ['index','proposal','recover']:
        child=commands.add_parser(name);child.add_argument('--config',required=True)
        if name!='index':child.add_argument('--output',required=True)
        if name=='proposal':child.add_argument('--proposal',required=True)
        if name=='recover':child.add_argument('--operation',required=True)
    args=parser.parse_args(argv)
    try:
        root,config=load(args.config)
        if args.command=='index':
            result=Index(relative(root,config['corpus']['root']),config['corpus']['sources'],relative(root,config['state'],exists=False)/'index').sync()
        elif args.command=='proposal':result=judge(args.config,relative(root,args.proposal).read_text(),args.output)
        else:result=recover(args.config,args.operation,args.output)
        print(json.dumps(result,sort_keys=True));return 0 if result.get('status') not in ['UNCERTAIN','ERROR','REJECTED'] else 1
    except Exception as exc:
        print(json.dumps({'status':'ERROR','error_type':type(exc).__name__,'message':str(exc)}),file=sys.stderr);return 2

if __name__=='__main__':raise SystemExit(main())
