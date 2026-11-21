"""Fixed deterministic skill-package verification and exact-source publication.

This gate issues a VERIFIED source receipt, never an approval verdict. Unsupported
runtime/configuration changes require a separate fixed verification profile.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import selectors
import secrets
import threading
import tempfile
import signal
import argparse
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

try:
    from . import deterministic_source as native
    from . import validation_contract as contract
    from . import oracle_spec_seal as spec_seal
except ImportError:
    import deterministic_source as native
    import validation_contract as contract
    import oracle_spec_seal as spec_seal

KIND = 'boc-deterministic-package/1'
PROFILE = 'feedback-discovery-and-release-tool/19'
_OUTPUT_LOCK = threading.Lock()
WS_LOCK_RECORD = {
    'version': '8.23.0', 'resolved': 'https://registry.npmjs.org/ws/-/ws-8.23.0.tgz',
    'integrity': 'sha512-wCkmX8QMOrKjgO8HW2WyDbTSGeqkocxgDzS9iR79rEAexty6/2qzilx3Ag8Tqf9ykop3irLKle0MtVn5qjVnoQ==',
    'dev': True, 'license': 'MIT', 'engines': {'node': '>=10.0.0'},
    'peerDependencies': {'bufferutil': '^4.0.1', 'utf-8-validate': '>=5.0.2'},
    'peerDependenciesMeta': {'bufferutil': {'optional': True}, 'utf-8-validate': {'optional': True}},
}
TESTS = [
    'tests/bos-foundation-connection.test.mjs', 'tests/bos-logout.test.mjs',
    'tests/context-selection.test.mjs', 'tests/product-mcp-contract.test.mjs',
    'tests/external-authentication-handoff.test.mjs',
    'tests/muse-workflow-guidance.test.mjs',
    'tests/feedback-evidence-guidance.test.mjs', 'tests/bos-native-compatibility.test.mjs',
    'tests/feedback-customization.test.mjs', 'tests/feedback-lifecycle.test.mjs',
    'tests/release-version.test.mjs', 'tests/skill-dependencies.test.mjs',
    'tests/versioned-skills.test.mjs', 'tests/package-model.test.mjs',
    'tests/journey-package-parity.test.mjs', 'tests/muse-package.test.mjs',
    'tests/bos-customer-profile.test.mjs', 'tests/plugin-console.test.mjs',
    'tests/plugin-settings.test.mjs', 'tests/publication-safety.test.mjs',
    'tests/ada-client.test.mjs', 'tests/ada-journey-view.test.mjs',
    'tests/runtime-skill-export.test.mjs', 'tests/feedback-item-discussion.test.mjs',
    'tests/notification-host.test.mjs', 'tests/notification-host-installer.test.mjs',
    'tests/document-cache.test.mjs', 'tests/ada-customer-onboarding.test.mjs',
    'tests/customer-onboarding-host.test.mjs',
    'tests/bos-oauth-live-contract.test.mjs', 'tests/external-dependency-adapter.test.mjs',
    'tests/journey-notifications.test.mjs', 'tests/oracle-api-version-request.test.mjs',
    'tests/oracle-performance.test.mjs', 'tests/isolated-test-cohort.test.mjs',
    'tests/publication-history.test.mjs',
    'tests/feedback-socket-host.test.mjs', 'tests/feedback-event-subscriber.test.mjs',
    'tests/customer-data-privacy.test.mjs', 'tests/privacy-coverage.test.mjs',
]
PYTHON_MODULES = ('deterministic_package_test', 'command_coverage_test', 'oracle_parallel_test')
ORACLE_CLASSES = ('ParallelReview', 'CriterionDependencyRoles', 'RawObservationCriterion')
ORACLE_INDEPENDENT_CASES = {'CriterionDependencyRoles': ('test_authentic_legacy_controls_require_fresh_adoption_and_future_roles_remain_separate', 'test_original_functional_control_module_and_changed_support_stay_individual', 'test_tampered_unknown_lineage_policy_changed_body_and_admitted_control_invalidation'), 'RawObservationCriterion': ('test_postcheck_error_reuses_only_unchanged_completed_body_after_independent_adoption', 'test_tampered_output_or_foreign_producer_role_cannot_form_a_raw_criterion', 'test_aggregate_error_retains_authenticated_completed_per_file_observation', 'test_raw_checkpoint_guard_lookup_is_once_per_original_record', 'test_later_admitted_unreviewed_keeps_raw_source_individual_until_reassessed', 'test_later_admitted_invalidated_support_keeps_raw_source_individual_until_reassessed', 'test_changed_inputs_and_negative_rows_remain_individual_assignments')}
PYTHON_UNITS = PYTHON_MODULES[:2] + ('oracle_parallel_test.ParallelReview',) + tuple(
    'oracle_parallel_test.'+name+'.'+method for name,methods in ORACLE_INDEPENDENT_CASES.items() for method in sorted(methods))
# The measured89s module starts immediately; exact independent cases fill the
# remaining slots. Result order and the complete membership remain canonical.
PYTHON_DISPATCH = (PYTHON_MODULES[0],) + PYTHON_UNITS[3:] + (PYTHON_MODULES[1], PYTHON_UNITS[2])
PYTHON_CHECK = [sys.executable, '-B', 'tools/deterministic_package.py', 'python-category', 'unittest']
_PYTHON_ACTIVE = set()
_PYTHON_LOCK = threading.Lock()
_PYTHON_STOPPING = set()

CHECKS = [
    ['node', 'scripts/build-feedback-socket-runtime.mjs', '--check'],
    ['npm', 'run', 'build:packages'], ['git', 'diff', '--exit-code', 'HEAD', '--'],
    ['npm', 'run', 'check'], ['node', 'scripts/check-customer-data.mjs'],
    ['npm', 'run', 'check:publication'],
    ['node', '--test', '--test-reporter=tap', '--test-concurrency=1', *TESTS],
    PYTHON_CHECK,
    ['node', 'scripts/check-publication-history.mjs'],
]
# /10: the explicitly requested Muse PR187 guidance and complete conformance module.
MUSE_GUIDANCE = {
    'source/platform/bos-visual-output/SKILL.md',
    'source/platform/bos-visual-output/references/graph-rendering.md',
    'tests/muse-workflow-guidance.test.mjs',
}
# Owner-requested Retell iteration guidance: exact implementation skill only.
BODY_SKILLS = {'source/platform/implementation/SKILL.md',
               'source/platform/bos-mcp-client/SKILL.md',
               'source/platform/submit-feedback/SKILL.md',
               'source/platform/submit-feedback/references/feedback-contract.md',
               'source/platform/bos-mcp-client/references/identity-context.md'}
# Profile /2 amendment: BOS customer initialization and the MCP discovery
# fallback for plugin settings/console. Exact files only; anything else in
# source/ still fails closed.
CUSTOMER_INITIALIZATION = {
    'source/platform/bos-customer-initialization/SKILL.md',
    'source/platform/bos-customer-initialization/agents/openai.yaml',
    'source/platform/bos-customer-initialization/scripts/customer-profile.mjs',
    'source/platform/bos-plugin-settings-initialization/SKILL.md',
    'source/platform/bos-plugin-console/SKILL.md',
    'source/platform/bos-mcp-client/references/identity-context.md',
    'tests/bos-customer-profile.test.mjs',
}
# Profile /3 amendment: owner-directed shared Ada client behavior and pure
# turn safeguards. Exact files only; existing auth/transport is unchanged.
ADA_CLIENT = {
    'source/platform/ada/SKILL.md',
    'source/platform/ada/scripts/customer-onboarding.mjs',
    'source/platform/ada/references/customer-onboarding.md',
    'source/host-runtime/bos-journey-notifications/customer-onboarding-host.mjs',
    'tests/ada-customer-onboarding.test.mjs', 'tests/customer-onboarding-host.test.mjs',
    'tests/helpers/synthetic-onboarding.mjs',
    'source/platform/ada/agents/openai.yaml',
    'source/platform/ada/references/turn-safeguards.md',
    'source/platform/ada/scripts/turn-safeguards.mjs',
    'tests/ada-client.test.mjs',
    'source/platform/ada/scripts/journey-view.mjs',
    'source/platform/ada/references/journey-view.md',
    'tests/ada-journey-view.test.mjs',
    'source/platform/ada/references/behavior-core.md',
    'source/platform/ada/references/runtime-export.md',
    'source/platform/ada/runtime-export.json',
    'scripts/lib/runtime-skill-export.mjs',
    'scripts/export-runtime-skill.mjs',
    'tests/runtime-skill-export.test.mjs',
    'source/platform/submit-feedback/scripts/item-discussion.mjs',
    'source/platform/submit-feedback/references/item-discussion.md',
    'tests/feedback-item-discussion.test.mjs',
    'source/host-runtime/bos-journey-notifications/feedback-socket.mjs',
    'source/host-runtime/bos-journey-notifications/feedback-discussion-host.mjs',
    'source/host-runtime/bos-journey-notifications/muse-companion-cli.mjs',
    'source/host-runtime/bos-journey-notifications/muse-companion-host.mjs',
    'tests/notification-host.test.mjs',  # /10 exact portable-socket conformance repair
    # /11 exact Claude Code event-wake subscriber (Ada C1 host binding).
    'source/host-runtime/bos-journey-notifications/event-wake-subscriber.mjs',
    'tests/feedback-event-subscriber.test.mjs', 'tests/helpers/feedback-socket-stand-in.mjs',
    'source/host-runtime/bos-journey-notifications/muse-hook.sh',
    'source/host-runtime/bos-journey-notifications/README.md',
    'source/host-runtime/bos-journey-notifications/vendor/ws.bundle.mjs',
    'source/host-runtime/bos-journey-notifications/vendor/WS-LICENSE.txt',
    'source/host-runtime/bos-journey-notifications/vendor/ws.provenance.json',
    'scripts/build-feedback-socket-runtime.mjs',
    'scripts/entries/feedback-websocket-runtime.mjs',
    'scripts/install-notification-host.mjs',
    'tests/notification-host-installer.test.mjs',
    'tests/feedback-socket-host.test.mjs',
    'source/host-runtime/bos-shared-cache/document-cache.mjs', 'tests/document-cache.test.mjs',
    'scripts/check-customer-data.mjs', 'tests/customer-data-privacy.test.mjs',
    'scripts/lib/privacy-coverage.mjs', 'scripts/lib/privacy-scan-pool.mjs',
    'scripts/lib/privacy-scan-worker.mjs', 'tests/privacy-coverage.test.mjs',
}
# Profile /2 amendment: owner-approved repairs of tests that went stale when
# CI moved to this deterministic gate (aa66d553, 6d75ed26, 2dbc43b4).
STALE_TEST_REPAIRS = {
    # Workflow text assertions removed by aa66d553 / 6d75ed26 / 2dbc43b4.
    'tests/publication-safety.test.mjs',
    'tests/oracle-governance.test.mjs',
    # Reasoning effort is bounded by owner delivery policy since ca4c5108.
    'tests/oracle_parallel_test.py',
    'tests/oracle_review_series.py',
    # Patched helper was renamed (process_identity -> process_birth).
    'tests/oracle_lifecycle_test.py',
    # A killed orphan is a zombie until reaped; it is terminated either way.
    'tests/isolated-test-cohort.test.mjs',
    # Wrapper timeout (120s) was at the suite's runtime on slower hosts.
    'tests/oracle-lifecycle.test.mjs',
    # Owner-approved tool bug fixes found by these tests.
    'tools/command_coverage.py',   # crash on a tree without package.json
    'tools/oracle_approval.py',    # proposal final_tree used _tree, not _review_tree
    # Owner-approved: exporter accepts deterministic CI provenance (verify-published).
    'scripts/build-marketplace-update.mjs',
}

# /9 explicitly covers preserved feature edges, not arbitrary older history.
LEGACY_FEATURE_PATHS = {
    'scripts/lib/bos-oauth-live-contract.mjs', 'tests/bos-oauth-live-contract.test.mjs',
    'contracts/bos-client-dependency.v1/manifest.json', 'scripts/lib/package-model.mjs',
    'source/platform/authentication-context-integrity/SKILL.md',
    'source/platform/bos-external-dependency-adapter/SKILL.md',
    'source/platform/bos-external-dependency-adapter/references/dependency-adapter.md',
    'source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs',
    'source/platform/bos-guided-support/references/support-state-machine.md',
    'source/platform/bos-mcp-client/references/runtime-continuation-contract.md',
    'tests/external-authentication-handoff.test.mjs', 'tests/external-dependency-adapter.test.mjs',
    'tools/oracle_parallel.py', 'tests/oracle_parallel_test.py',
    'tests/journey-notifications.test.mjs', 'tests/command_coverage_test.py',
    'tests/helpers/isolated-test-cohort.mjs', 'tests/isolated-test-cohort.test.mjs',
    'tests/oracle-api-version-request.test.mjs', 'tests/oracle-performance.test.mjs',
    'scripts/check-publication-history.mjs', 'tests/publication-history.test.mjs',
    'scripts/lib/publication-credentials.mjs', 'scripts/check-package.mjs',
}

# /12: exact preserved native implementation/spec/publication work.
PRESERVED_SPEC_PATHS = {'.agents/skills/operations-center-implementation/SKILL.md',
 '.agents/skills/oracle/review-output.schema.json',
 '.claude/skills/operations-center-implementation/SKILL.md',
 'CLAUDE.md',
 'scripts/check-publication-safety.mjs',
 'tests/agent-driven-journey-live-verifier.test.mjs',
 'tests/deterministic-lanes.test.mjs',
 'tests/deterministic_source_test.py',
 'tests/marketplace-update.test.mjs',
 'tests/oracle-fixture.mjs',
 'tests/oracle-implementation-spec.test.mjs',
 'tests/oracle-parallel.test.mjs',
 'tests/oracle-review-series.test.mjs',
 'tests/helpers/native-validation-git.mjs',
 'tests/helpers/native-validation-state.mjs',
 'tests/oracle-scope-index.test.mjs',
 'tests/oracle-source-frontier.test.mjs',
 'tests/oracle_scope_index_test.py',
 'tests/oracle_source_frontier_test.py',
 'tests/oracle_spec_test.py',
 'tests/publication-admission.test.mjs',
 'tests/publication_admission_test.py',
 'tests/published_fixture.py',
 'tests/shipment-workflow.test.mjs',
 'tests/shipment_workflow_test.py',
 'tests/validation_contract_test.py',
 'tools/deterministic-source.md',
 'tools/deterministic_source.py',
 'tools/oracle_lifecycle.py',
 'tools/oracle_spec_seal.py',
 'tools/publication_admission.py',
 'tools/publication_status.py',
 'tools/validation-contract.md',
 'tools/validation_contract.py',
 'tools/vault_index.py'}
PRESERVED_SPEC_TESTS = {'tests/agent-driven-journey-live-verifier.test.mjs',
 'tests/isolated-test-cohort.test.mjs',
 'tests/command-coverage.test.mjs',
 'tests/deterministic-lanes.test.mjs',
 'tests/document-cache.test.mjs',
 'tests/journey-notifications.test.mjs',
 'tests/marketplace-update.test.mjs',
 'tests/oracle-api-version-request.test.mjs',
 'tests/oracle-governance.test.mjs',
 'tests/oracle-implementation-spec.test.mjs',
 'tests/oracle-lifecycle.test.mjs',
 'tests/oracle-parallel.test.mjs',
 'tests/oracle-performance.test.mjs',
 'tests/oracle-review-series.test.mjs',
 'tests/oracle-scope-index.test.mjs',
 'tests/oracle-source-frontier.test.mjs',
 'tests/package-model.test.mjs',
 'tests/publication-admission.test.mjs',
 'tests/publication-safety.test.mjs',
 'tests/release-version.test.mjs',
 'tests/shipment-workflow.test.mjs',
 'tests/validation-contract.test.mjs'}
HISTORICAL_HEADER_RECORDS = ({'blob': '1951d9696d5e13b3860a3ece69ebdc6c767b323b',
  'bytes': 27255,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8568,
  'sha256': 'fd59c5e0d1826b95b94b879800210bc1227dd4aef05de4625138ee5d5262c30b',
  'span_bytes': 27},
 {'blob': '2619f0337bbe7b5884058d421f229b7850a781d2',
  'bytes': 27144,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8457,
  'sha256': 'f8f0d42c12567893cf415837eb02693391fb544ced8662b6f40f400d73eb0a68',
  'span_bytes': 27},
 {'blob': '6313e66c4d52cc7ed88fb5fbba50510a517f325e',
  'bytes': 32529,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': '49d1d6b4b1329a5101654069432ea350cf480b554cd951b81cc5f38742033fd1',
  'span_bytes': 27},
 {'blob': '68f4e0ca18671d37480c5eac05b2b840faf3e2cc',
  'bytes': 42404,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': 'f0121b793435573994e873099c7345d848c55ec188bda13742fb4a11f83c3a68',
  'span_bytes': 27},
 {'blob': '73a6d26c670e2e22b082f3cade796c1e1dc78ab0',
  'bytes': 36281,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': '2a9863e18c54fe7403c69cc8019bfd8e5cf27308083d3986f3ab508ab574b350',
  'span_bytes': 27},
 {'blob': '792720d050c8c96e30ab3a11b500f019293f11cd',
  'bytes': 40009,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': 'e8c064398f5f304324bf34b6c089d76d42afd11024265adc99cf9bd49e198e81',
  'span_bytes': 27},
 {'blob': '8651b812804aec856f337273449f44d0f9e05763',
  'bytes': 30804,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8568,
  'sha256': '45e0963ad42d2dc422f54dd3dcedf5e2a3fa31a960ffca8646d18588a49a6d81',
  'span_bytes': 27},
 {'blob': 'aa03dddc08e9905065ab7344c82724ef2debe42b',
  'bytes': 37047,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': 'd6befd66ad433340d43bd8aab31cc7f1ff3087107ed495c2805f9587edea7274',
  'span_bytes': 27},
 {'blob': 'bbb7365a6ce85ea2c92aa906f3e3aba1c2e611da',
  'bytes': 35291,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': '74fe638fd6f9e291ad6dcc84d189e233027f74dee50bc94aaf92955f772633c5',
  'span_bytes': 27},
 {'blob': 'c6a09ce01915821bfb8ef6640c5a5f9d4a7078b5',
  'bytes': 39780,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': 'ab70958bb8080143945151d213801a059c6d289fa673ccd80c94530fafea8aa0',
  'span_bytes': 27},
 {'blob': 'd59f21a9c664818fa1566807e4c322fc64d89750',
  'bytes': 23322,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8457,
  'sha256': '1f4454821ebd549c233fc90fc7758bf8ab02024aec76cd817517605f25ddbf95',
  'span_bytes': 27},
 {'blob': 'dbd54291c0c5db40db492c5fe15692ae8b0b74be',
  'bytes': 41448,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8580,
  'sha256': '980812b99a77e02c0c2230698bab7169dc7ea211525ee47d85052b44f047bd52',
  'span_bytes': 27},
 {'blob': 'dce815948f403e5cabb276736299b1bf0d2d2bc5',
  'bytes': 25063,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8457,
  'sha256': '50b17f01a8cb5d6b24a6c16d5a3a79a0932ba9055a18de6a22ac399a6b2a267c',
  'span_bytes': 27},
 {'blob': 'fec896741581a989f6af399f0923789d3041630b',
  'bytes': 23940,
  'context_sha256': '8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f',
  'offset': 8457,
  'sha256': 'fffe5d5ea2b9a8a9c657c8cbd4bcbbd719ecc8484daef2f2c86b457cf10a3ce8',
  'span_bytes': 27})

PRODUCT_INCLUDE_ADDITIONS = {'products/bos/product.json': {'platform/bos-customer-initialization', 'platform/ada'}}
LEGACY_RELEASE_SCRIPT_ALIASES = {
    'release:instruction':'python3 tools/publication_admission.py instruction',
    'release:question':'python3 tools/publication_admission.py question',
}
MAINTENANCE = {
    'AGENTS.md', '.agents/skills/ship-it/SKILL.md',
    'tools/deterministic_package.py', 'tools/deterministic-package.md',
    'tests/deterministic_package_test.py', 'scripts/bump-release-version.mjs',
    'tests/release-version.test.mjs', '.github/workflows/publication-safety.yml',
    'scripts/release.mjs',
    'tests/package-model.test.mjs',
    'tests/muse-workflow-guidance.test.mjs',
    'tests/feedback-evidence-guidance.test.mjs', 'tests/bos-native-compatibility.test.mjs',
}

# Historical selections are retained evidence, never executable validation authority.
RETIRED_SELECTION = 'tools/validation-selection.json'
RETIRED_SELECTION_SHA256 = frozenset({
    '3492d4153de820e07a13d7ecc8c187fc04c5e60a2acce2fa488ea4972b8823b4',
    'c1f0431bcc70c271d2411797d049ab1d7b18ffc375b86e08d43e42322469eddf',
    '97963c568bef047d9621c0d07bf8b7b672e3130edd018c0b5bc638eb966bd1eb',
})


def blob(root, revision, path):
    return subprocess.check_output(['git', '--no-replace-objects', 'show',
                                    revision + ':' + path], cwd=root)


def require_original_git_history(root):
    if native.git(root, 'rev-parse', '--is-shallow-repository') != 'false' or native.git(root, 'replace', '-l'):
        raise ValueError('Complete original Git history is required')
    graft = Path(native.git(root, 'rev-parse', '--git-path', 'info/grafts'))
    if not graft.is_absolute(): graft = Path(root) / graft
    if graft.exists() and graft.read_bytes().strip():
        raise ValueError('Original Git history cannot use grafts')


def commits_and_paths(root, base, source):
    if not all(re.fullmatch('[0-9a-f]{40}', x or '') for x in (base, source)):
        raise ValueError('Exact candidate and publication base are required')
    require_original_git_history(root)
    native.git(root, 'merge-base', '--is-ancestor', base, source)
    result = []
    for commit in native.git(root, 'rev-list', '--reverse', base + '..' + source).splitlines():
        parents = native.git(root, 'show', '-s', '--format=%P', commit).split()
        if len(parents) == 2:
            trusted = []
            for parent in parents:
                observation = subprocess.run(['git', '--no-replace-objects', 'merge-base',
                                               '--is-ancestor', parent, base], cwd=root,
                                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if observation.returncode not in (0, 1):
                    observation.check_returncode()
                if observation.returncode == 0:
                    trusted.append(parent)
            if not trusted:
                # A preserved integration may have unpublished work after main
                # on its first parent and a side branch from older published main.
                # Every side commit remains in rev-list below; this selects only
                # the baseline for classifying the merge resolution itself.
                descendants=[]
                for parent in parents:
                    observed=subprocess.run(['git','--no-replace-objects','merge-base','--is-ancestor',base,parent],
                                            cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
                    if observed.returncode not in (0,1):observed.check_returncode()
                    if observed.returncode==0:descendants.append(parent)
                fork = subprocess.run(['git', '--no-replace-objects', 'merge-base', base, parents[1]],
                                      cwd=root, capture_output=True, text=True)
                if descendants == [parents[0]] and fork.returncode == 0 and fork.stdout.strip():
                    trusted = [parents[0]]
                elif descendants == parents:
                    # /13: private source sync may fork after the published base.
                    # Require one complete shared ancestor anchored to that exact
                    # base. Every edge and first-parent resolution is still checked.
                    common = native.git(root, 'merge-base', '--all', *parents).splitlines()
                    if len(common)==1:
                        anchored=subprocess.run(['git','--no-replace-objects','merge-base','--is-ancestor',base,common[0]],
                                                cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
                        if anchored.returncode not in (0,1):anchored.check_returncode()
                        if anchored.returncode==0:trusted=[parents[0]]
            if len(trusted) != 1:
                raise ValueError('Merge needs exactly one publication-base ancestor parent or bounded published-fork integration')
            # Check the integrated result against its trusted published parent.
            # rev-list still checks every unpublished nonmerge edge, including reverts.
            parents = trusted
        elif len(parents) != 1:
            raise ValueError('Only two-parent publication-base anchored merges are mapped')
        for row in native.git(root, 'diff-tree', '--no-commit-id', '--raw', '-r',
                              '--no-renames', parents[0], commit).splitlines():
            fields, path = row.split('\t')
            old_mode, new_mode = fields.split()[:2]
            if new_mode not in {'100644', '100755'} and not (
                    path == RETIRED_SELECTION and new_mode == '000000'):
                raise ValueError('Deletion or nonregular source change: ' + path)
            result.append((parents[0], commit, path, old_mode[1:], new_mode))
    if not result:
        raise ValueError('No package changes to verify')
    return result


def scope_blob_snapshot(root, requests):
    require_original_git_history(root)
    requests = sorted(set(requests))
    if not requests: return {}
    if len(requests)>8192: raise ValueError('Scope snapshot request bound exceeded')
    queries=[]
    for revision,path in requests:
        if (not re.fullmatch('[0-9a-f]{40}',revision) or not isinstance(path,str) or not path
                or path.startswith('/') or '..' in path.split('/') or len(path)>4096
                or any(ord(char)<32 or ord(char)==127 for char in path)):
            raise ValueError('Immutable scope snapshot query required')
        queries.append(revision+':'+path)
    if sum(len(value.encode())+1 for value in queries)>128*1024:
        raise ValueError('Scope snapshot argument bound exceeded')
    if native.git(root,'rev-parse','--show-object-format')!='sha1':
        raise ValueError('Unsupported scope object format')
    def run(arguments, body=None):
        result=subprocess.run(['git','--no-replace-objects',*arguments],cwd=root,input=body,
                              stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=30)
        return result.stdout
    resolved=run(['rev-parse','--revs-only','--end-of-options',*queries])
    ids=resolved.split(b'\n')
    if ids[-1:]!=[b''] or len(ids)!=len(queries)+1 or any(not re.fullmatch(rb'[0-9a-f]{40}',value) for value in ids[:-1]):
        raise ValueError('Scope object resolution incomplete')
    ids=ids[:-1];request_bytes=b'\n'.join(ids)+b'\n'
    metadata=run(['cat-file','--batch-check'],request_bytes)
    lines=metadata.split(b'\n')
    if len(metadata)>2*1024*1024 or len(lines)!=len(ids)+1 or lines[-1]!=b'':
        raise ValueError('Scope metadata framing changed')
    headers=[];total=0
    for expected,line in zip(ids,lines[:-1]):
        match=re.fullmatch(rb'([0-9a-f]{40}) (blob) ([0-9]+)',line)
        if not match or match[1]!=expected: raise ValueError('Scope object type or order changed')
        size=int(match[3]);total+=size
        if size>8*1024*1024 or total>32*1024*1024: raise ValueError('Scope snapshot byte bound exceeded')
        headers.append((line,size))
    raw=run(['cat-file','--batch'],request_bytes)
    if len(raw)!=total+sum(len(header)+2 for header,size in headers):
        raise ValueError('Scope body length or EOF changed')
    result={};offset=0
    for key,expected,(header,size) in zip(requests,ids,headers):
        if raw[offset:offset+len(header)+1]!=header+b'\n':raise ValueError('Scope response order changed')
        offset+=len(header)+1;body=raw[offset:offset+size];offset+=size
        if raw[offset:offset+1]!=b'\n':raise ValueError('Scope body framing changed')
        offset+=1
        observed=hashlib.sha1(b'blob '+str(size).encode()+b'\0'+body).hexdigest().encode()
        if observed!=expected:raise ValueError('Scope raw Git blob hash changed')
        result[key]=body
    if offset!=len(raw):raise ValueError('Scope trailing bytes changed')
    return result


def scope(root, base, source):
    rows = commits_and_paths(root, base, source)
    requests=set()
    for parent,commit,path,old_mode,new_mode in rows:
        known=(path in MAINTENANCE or path in BODY_SKILLS or path in CUSTOMER_INITIALIZATION
               or path in STALE_TEST_REPAIRS or path in ADA_CLIENT or path in LEGACY_FEATURE_PATHS
                or path in MUSE_GUIDANCE or path in PRESERVED_SPEC_PATHS)
        if (path==RETIRED_SELECTION or path=='contracts/bos-client-dependency.v1/manifest.json'
                or not known and (path=='README.md' or path.startswith('source/') and path.endswith('/SKILL.md')
                  or path in {'package.json','package-manifest.json','package-lock.json','products/bos/product.json','products/education-center/product.json'})):
            for revision,mode in ((parent,old_mode),(commit,new_mode)):
                if mode!='000000':requests.add((revision,path))
    snapshot=scope_blob_snapshot(root,requests)
    def read_blob(unused_root,revision,path):
        try:return snapshot[(revision,path)]
        except KeyError:raise ValueError('Complete scope snapshot required')
    paths = set()
    for parent, commit, path, old_mode, new_mode in rows:
        paths.add(path)
        if path == RETIRED_SELECTION:
            for revision, mode in ((parent, old_mode), (commit, new_mode)):
                if mode == '000000':
                    continue
                if mode != '100644' or not sealed_or_retired(read_blob(root, revision, path)):
                    raise ValueError('Unmapped retired validation selection')
            continue
        if path == 'contracts/bos-client-dependency.v1/manifest.json':
            values = [json.loads(read_blob(root, revision, path)) for revision in (parent, commit)]
            def immutable_contract(value):
                if isinstance(value, dict):
                    return {key: immutable_contract(item) for key, item in value.items()
                            if key not in {'sha256', 'bundle_sha256'}}
                if isinstance(value, list): return [immutable_contract(item) for item in value]
                return value
            if immutable_contract(values[0]) != immutable_contract(values[1]):
                raise ValueError('Existing public dependency contract identity cannot change')
            continue
        if (path in MAINTENANCE or path in BODY_SKILLS or path in CUSTOMER_INITIALIZATION
                or path in STALE_TEST_REPAIRS or path in ADA_CLIENT or path in LEGACY_FEATURE_PATHS
                or path in MUSE_GUIDANCE or path in PRESERVED_SPEC_PATHS):
            continue
        if path.startswith('clients/'):
            # The fixed build+clean-tree checks independently regenerate all consumers.
            continue
        if path in {'skill-release-manifest.json', 'products/bos/openai/bos-skills.zip',
                    'products/education-center/openai/education-center-skills.zip'}:
            continue
        if path.startswith('source/') and path.endswith('/SKILL.md'):
            def without_pins(value):
                parts = value.split(b'---', 2)
                if len(parts) != 3 or parts[0].strip():
                    raise ValueError('Skill frontmatter is required')
                parts[1] = re.sub(rb'^  (?:version|requires):.*$', b'', parts[1], flags=re.M)
                return b'---'.join(parts)
            if without_pins(read_blob(root, parent, path)) != without_pins(read_blob(root, commit, path)):
                raise ValueError('Unmapped skill behavior: ' + path)
            continue
        if path in {'package.json', 'package-manifest.json', 'package-lock.json',
                    'products/bos/product.json', 'products/education-center/product.json'}:
            before, after = (json.loads(read_blob(root, ref, path)) for ref in (parent, commit))
            for value in (before, after):
                value.pop('version', None)
                if path == 'package.json':
                    for key,expected in LEGACY_RELEASE_SCRIPT_ALIASES.items():
                        if key in value.get('scripts',{}):
                            if value['scripts'][key]!=expected:raise ValueError('Unexpected publication instruction alias')
                            value['scripts'].pop(key)
                    command = value.get('scripts', {}).get('release:check')
                    if command is not None and command not in {'python3 tools/validation_contract.py release',
                                                               'python3 tools/deterministic_package.py validate',
                                                               'npm run build && npm run check && npm run check:privacy && npm run contract:check && npm test'}:
                        raise ValueError('Unexpected release verification command')
                    if 'release:check' in value.get('scripts', {}):
                        value['scripts']['release:check'] = 'FIXED_DETERMINISTIC_GATE_MIGRATION'
                if path == 'package-lock.json':
                    value.get('packages', {}).get('', {}).pop('version', None)
            if path in {'package.json', 'package-lock.json'}:
                for value in (before, after):
                    owner = value if path == 'package.json' else value.get('packages', {}).get('', {})
                    ws = owner.get('devDependencies', {}).pop('ws', None)
                    if ws not in (None, '8.23.0'):
                        raise ValueError('Unmapped WebSocket dependency version')
                    if path == 'package-lock.json':
                        ws_row = value.get('packages', {}).pop('node_modules/ws', None)
                        if ws_row is not None and ws_row != WS_LOCK_RECORD:
                            raise ValueError('Unmapped WebSocket dependency integrity')
            allowed = PRODUCT_INCLUDE_ADDITIONS.get(path)
            if allowed and isinstance(before.get('includes'), list) and isinstance(after.get('includes'), list):
                added = [x for x in after['includes'] if x not in before['includes']]
                if set(added) <= allowed and len(added) == len(set(added)) and \
                        [x for x in after['includes'] if x not in added] == before['includes']:
                    after['includes'] = before['includes']
            if before != after:
                raise ValueError('Unmapped package configuration or dependency change: ' + path)
            continue
        if path == 'README.md':
            def without_release(value):
                for handoff in (b'The probe stops at the first redirect. It requires a 302/303/307 response to\n`accounts.google.com` with `prompt` containing `select_account`; an HTTP 500,\nthe wrong provider, or automatic account selection fails the contract. After\nthe selected Google identity returns, the BOS server resolves organization and\nrole from that verified identity on every authorization. The client never\nchooses or stores an organization mapping.', b'The probe accepts a direct 302/303/307 Google redirect or at most two automatic\nsame-origin continuations through the existing bound BOS handoff routes. Every\ncontinuation preserves its opaque transaction; a rendered BOS login, consent,\norganization/role or grant page fails the contract. The final Google redirect\nrequires `prompt` containing `select_account`. Google owns account choice and\nprovider consent. The probe establishes login initiation; the service-owned\nbrowser suite separately verifies automatic registered-client callback delivery,\ncode/token exchange and authenticated MCP. The server checks current membership\nand operation authority after identity verification.'):
                    value = value.replace(handoff, b'BOUNDED_AUTOMATIC_HANDOFF_GUIDANCE')
                value = re.sub(rb'\n<!-- deterministic-package-release -->.*?<!-- /deterministic-package-release -->\n',
                               b'', value, flags=re.S)
                return re.sub(rb'Current source package release: `[^`]+`\. If `[^`]+` is installed,',
                              b'RELEASE', value)
            if without_release(read_blob(root, parent, path)) != without_release(read_blob(root, commit, path)):
                raise ValueError('Unmapped documentation change')
            continue
        raise ValueError('Unsupported package-release scope: ' + path)
    # Owner direction 2026-11-11: a package change carries this changelist's sealed spec;
    # a missing, stale or mismatched spec fails here. Retired v1 blobs never qualify.
    admitted=contract.gate(root, base, source)
    if paths & PRESERVED_SPEC_PATHS:
        if admitted['status']!='SPEC_SEALED':raise ValueError('Preserved native source requires its complete sealed spec')
        selected=contract.verify(root,source)['selection']
        modules={name for row in selected['categories'] for name in row['tests']}
        if not PRESERVED_SPEC_TESTS <= modules:raise ValueError('Preserved native conformance modules missing')
    return sorted(paths)


def sealed_or_retired(raw):
    """A pinned historical v1 selection, or an oracle-spec/1 sealed contract revision."""
    if hashlib.sha256(raw).hexdigest() in RETIRED_SELECTION_SHA256:
        return True
    try:
        value = json.loads(raw)
    except ValueError:
        return False
    return isinstance(value, dict) and value.get('schema') == contract.SCHEMA and spec_seal.seal_matches(value)


_PYTHON_CANCELLED = threading.Event()
_PYTHON_OUTPUT_LIMIT = 8 * 1024 * 1024


def python_module_command(module):
    if module not in set(PYTHON_MODULES) | set(PYTHON_UNITS): raise ValueError('Unknown Python module')
    return [sys.executable, '-B', '-c',
            "import sys,unittest;sys.path.insert(0,'tests');sys.argv.pop(1);unittest.main(module=None)",
            'unittest', module, '-v']


def _stop_python_group(process, force=False):
    with _PYTHON_LOCK:
        if process not in _PYTHON_ACTIVE or not force and process in _PYTHON_STOPPING: return
        _PYTHON_STOPPING.add(process)
    try: os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)
    except ProcessLookupError: return
    except PermissionError:
        # A short-lived child can already be reaped before the pipe reader
        # observes its final chunk. Never signal a reused/foreign group.
        if process.poll() is None:
            try: process.terminate()
            except ProcessLookupError: pass
        return
    if not force:
        timer = threading.Timer(2, _stop_python_group, args=(process, True))
        timer.daemon = True; timer.start()


def cancel_python_category(*unused):
    _PYTHON_CANCELLED.set()
    with _PYTHON_LOCK: processes = list(_PYTHON_ACTIVE)
    for process in processes: _stop_python_group(process)


def execute_python_module(root, module, *, command=None, timeout=300):
    command = command or python_module_command(module)
    began = time.monotonic(); root = Path(root)
    scratch = root / 'Vault/tmp'; scratch.mkdir(parents=True, exist_ok=True)
    result = {'module':module, 'command':command, 'exit_code':'CANCELLED', 'output':b''}
    with tempfile.TemporaryDirectory(dir=scratch, prefix='native-python-') as temporary:
        environment = dict(os.environ, TMPDIR=temporary)
        result['temporary_directory_sha256'] = native.digest(temporary.encode())
        if not _PYTHON_CANCELLED.is_set():
            process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       env=environment, start_new_session=True)
            with _PYTHON_LOCK: _PYTHON_ACTIVE.add(process)
            if _PYTHON_CANCELLED.is_set(): _stop_python_group(process)
            streams = [[], []]; size = 0; lock = threading.Lock(); overflow = threading.Event(); reader_error = threading.Event()
            def collect(index, pipe):
                nonlocal size
                try:
                    while True:
                        chunk = pipe.read(65536)
                        if not chunk: break
                        with lock:
                            if size + len(chunk) > _PYTHON_OUTPUT_LIMIT:
                                overflow.set()
                            elif not overflow.is_set():
                                streams[index].append(chunk); size += len(chunk)
                        if overflow.is_set(): _stop_python_group(process)
                except Exception:
                    reader_error.set()
                    try: _stop_python_group(process)
                    except OSError: pass
                finally: pipe.close()
            readers = [threading.Thread(target=collect,args=(index,pipe),daemon=True)
                       for index,pipe in enumerate((process.stdout,process.stderr))]
            for reader in readers: reader.start()
            try:
                try: result['exit_code'] = process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    result['exit_code'] = 'TIMEOUT'; _stop_python_group(process)
                    process.wait(timeout=5)
                for reader in readers: reader.join(timeout=5)
                if any(reader.is_alive() for reader in readers):
                    _stop_python_group(process, True)
                    for reader in readers: reader.join(timeout=5)
                    result['exit_code'] = 'PIPE_CLEANUP_ERROR'
                if overflow.is_set(): result['exit_code'] = 'OUTPUT_LIMIT'
                if reader_error.is_set(): result['exit_code'] = 'PIPE_READER_ERROR'
                if _PYTHON_CANCELLED.is_set(): result['exit_code'] = 'CANCELLED'
                result['output'] = b''.join(streams[0])+b'\n'+b''.join(streams[1])
            finally:
                if process.poll() is None: _stop_python_group(process, True); process.wait()
                with _PYTHON_LOCK:
                    _PYTHON_ACTIVE.discard(process); _PYTHON_STOPPING.discard(process)
    result['wall_ms'] = round((time.monotonic()-began)*1000,3)
    return result


def validate_python_inventory(value):
    try:
        if set(value) != {'units','modules','source_sha256'}: raise ValueError()
        if set(value['units'])!=set(PYTHON_UNITS) or set(value['modules'])!=set(PYTHON_MODULES) or set(value['source_sha256'])!=set(PYTHON_MODULES): raise ValueError()
        for unit, ids in value['units'].items():
            if unit.count('.')==2 and ids != [unit]:raise ValueError()
            if (not isinstance(ids,list) or not 0<len(ids)<=10000 or ids!=sorted(set(ids))
                    or any(not isinstance(name,str) or len(name)>512 or not (name==unit or name.startswith(unit+'.')) for name in ids)): raise ValueError()
        for module in PYTHON_MODULES:
            ids=sorted(name for unit in PYTHON_UNITS if unit.split('.')[0]==module for name in value['units'][unit])
            if (value['modules'][module]!=ids or len(ids)!=len(set(ids))
                    or not re.fullmatch('[0-9a-f]{64}',value['source_sha256'][module])): raise ValueError()
        return value
    except (ValueError,KeyError,TypeError,AttributeError):
        raise ValueError('Complete nonduplicated Python test membership required')


def python_inventory(root):
    # Discovery imports definitions only, in its own process. No test or fixture
    # is executed here. Only inspected per-test fixtures become exact-ID units.
    code = """import importlib,json,sys,unittest
sys.path.insert(0,'tests')
modules=('deterministic_package_test','command_coverage_test','oracle_parallel_test')
independent={'CriterionDependencyRoles': ('test_authentic_legacy_controls_require_fresh_adoption_and_future_roles_remain_separate', 'test_original_functional_control_module_and_changed_support_stay_individual', 'test_tampered_unknown_lineage_policy_changed_body_and_admitted_control_invalidation'), 'RawObservationCriterion': ('test_postcheck_error_reuses_only_unchanged_completed_body_after_independent_adoption', 'test_tampered_output_or_foreign_producer_role_cannot_form_a_raw_criterion', 'test_aggregate_error_retains_authenticated_completed_per_file_observation', 'test_raw_checkpoint_guard_lookup_is_once_per_original_record', 'test_later_admitted_unreviewed_keeps_raw_source_individual_until_reassessed', 'test_later_admitted_invalidated_support_keeps_raw_source_individual_until_reassessed', 'test_changed_inputs_and_negative_rows_remain_individual_assignments')}
classes=('ParallelReview','CriterionDependencyRoles','RawObservationCriterion')
def ids(suite):
 result=[]
 for item in suite:
  result.extend(ids(item) if isinstance(item,unittest.TestSuite) else [item.id()])
 return sorted(result)
loader=unittest.TestLoader()
full={name:ids(loader.loadTestsFromName(name)) for name in modules}
oracle=importlib.import_module('oracle_parallel_test')
assert not getattr(oracle,'setUpModule',None) and not getattr(oracle,'tearDownModule',None)
actual=sorted(name for name,item in vars(oracle).items() if isinstance(item,type) and issubclass(item,unittest.TestCase) and item.__module__==oracle.__name__)
assert actual==sorted(classes)
units={name:full[name] for name in modules[:2]}
for name in classes:
 cls=getattr(oracle,name)
 assert all(getattr(getattr(cls,hook,None),'__func__',None)==getattr(getattr(unittest.TestCase,hook,None),'__func__',None) for hook in ('setUpClass','tearDownClass'))
 prefix='oracle_parallel_test.'+name
 discovered=ids(loader.loadTestsFromName(prefix))
 if name in independent:
  assert discovered==sorted(prefix+'.'+method for method in independent[name])
  units.update({item:[item] for item in discovered})
 else:units[prefix]=discovered
print(json.dumps({'units':units,'modules':full}))
"""
    root=Path(root)
    hashes={name:native.digest((root/'tests'/ (name+'.py')).read_bytes()) for name in PYTHON_MODULES}
    source=native.git(root,'rev-parse','HEAD')
    if hashes!={name:native.digest(blob(root,source,'tests/'+name+'.py')) for name in PYTHON_MODULES}:
        raise ValueError('Python discovery source differs from committed content')
    result=subprocess.run([sys.executable,'-B','-c',code],cwd=root,capture_output=True,timeout=30)
    if result.returncode or len(result.stdout)>2*1024*1024: raise ValueError('Python test discovery failed')
    value=json.loads(result.stdout);value['source_sha256']=hashes
    if hashes!={name:native.digest((root/'tests'/ (name+'.py')).read_bytes()) for name in PYTHON_MODULES}: raise ValueError('Python membership source changed')
    return validate_python_inventory(value)


def executed_python_ids(raw):
    return [name.decode('ascii') for name in re.findall(
        rb'^test_[A-Za-z0-9_]+ \(([A-Za-z0-9_.]+)\) \.\.\.',raw,re.M)]


def python_category_output(before, results, *, inventory, unchanged=True):
    validate_python_inventory(inventory)
    if [row['module'] for row in results] != list(PYTHON_UNITS):
        raise ValueError('Complete fixed Python modules required')
    frames = []; summaries = []
    passed = unchanged
    for row in results:
        raw = row['output']
        if len(raw) > _PYTHON_OUTPUT_LIMIT + 1: raise ValueError('Python output bound changed')
        count = re.findall(rb'Ran ([1-9][0-9]*) tests? in', raw)
        tests = int(count[-1]) if count else 0
        passed = passed and complete(python_module_command(row['module']), raw, row['exit_code']) and tests==len(inventory['units'][row['module']]) and executed_python_ids(raw)==inventory['units'][row['module']]
        frames.append(b'BOC_PYTHON_MODULE '+row['module'].encode()+b' '+str(len(raw)).encode()+b'\n'+raw)
        summaries.append({key:row[key] for key in ('module','command','exit_code','wall_ms','temporary_directory_sha256')} |
                         {'tests':tests,'executed_ids':executed_python_ids(raw),'output_sha256':native.digest(raw)})
    report = {'source':before['source'],'tree':before['tree'],'runtime_sha256':native.digest(native.encoded(before['runtime'])),
              'modules':summaries,'membership':inventory,'concurrency':3,'status':'PASS' if passed else 'REJECT'}
    return b''.join(frames)+native.encoded({'python_category':report})+b'\n', 0 if passed else 1


def run_python_category(root, executor=execute_python_module, *, reset=True, inventory_loader=None):
    if reset: _PYTHON_CANCELLED.clear()
    before = native.identity(root)
    inventory_loader = inventory_loader or python_inventory
    inventory = validate_python_inventory(inventory_loader(root))
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {module:pool.submit(executor, root, module) for module in PYTHON_DISPATCH}
        results = []
        for module in PYTHON_UNITS:
            future = futures[module]
            try: results.append(future.result())
            except Exception:
                results.append({'module':module,'command':python_module_command(module),'exit_code':'EXECUTION_ERROR',
                                'output':b'Fixed Python module execution failed.\n','wall_ms':0,
                                'temporary_directory_sha256':'0'*64})
    for row in results:
        path = directory(root)/(native.digest(row['output'])+'.log')
        with _OUTPUT_LOCK:
            if not path.exists(): native.private_write(path,row['output'])
    try: unchanged = native.identity(root) == before and not _PYTHON_CANCELLED.is_set() and inventory_loader(root)==inventory
    except (ValueError, OSError, subprocess.SubprocessError): unchanged = False
    return python_category_output(before,results,inventory=inventory,unchanged=unchanged)


def python_category_report(output, expected=None, membership=None):
    try:
        remaining = output; originals = []
        for module in PYTHON_UNITS:
            header,remaining = remaining.split(b'\n',1)
            prefix = b'BOC_PYTHON_MODULE '+module.encode()+b' '
            if not header.startswith(prefix): raise ValueError()
            size = int(header[len(prefix):])
            if not 0 < size <= _PYTHON_OUTPUT_LIMIT+1 or len(remaining)<size: raise ValueError()
            originals.append(remaining[:size]);remaining=remaining[size:]
        envelope = json.loads(remaining)
        if set(envelope) != {'python_category'}: raise ValueError()
        report = envelope['python_category']
        if set(report) != {'source','tree','runtime_sha256','modules','membership','concurrency','status'}: raise ValueError()
        if (report['status']!='PASS' or type(report['concurrency']) is not int or report['concurrency']!=3
                or len(report['modules'])!=len(PYTHON_UNITS) or not re.fullmatch('[0-9a-f]{40}',report['source'])
                or not re.fullmatch('[0-9a-f]{40}',report['tree'])
                or not re.fullmatch('[0-9a-f]{64}',report['runtime_sha256'])): raise ValueError()
        if expected is not None and (report['source']!=expected['source'] or report['tree']!=expected['tree']
                or report['runtime_sha256']!=native.digest(native.encoded(expected['runtime']))): raise ValueError()
        validate_python_inventory(report['membership'])
        if membership is not None and membership!=report['membership']: raise ValueError()
        for module,row,raw in zip(PYTHON_UNITS,report['modules'],originals):
            if set(row) != {'module','command','exit_code','wall_ms','temporary_directory_sha256','tests','executed_ids','output_sha256'}: raise ValueError()
            count=re.findall(rb'Ran ([1-9][0-9]*) tests? in',raw)
            if (row['module']!=module or row['command']!=python_module_command(module)
                    or type(row['exit_code']) is not int or row['exit_code']!=0
                    or row['output_sha256']!=native.digest(raw) or len(count)!=1
                    or row['executed_ids']!=executed_python_ids(raw) or row['executed_ids']!=report['membership']['units'][module]
                    or type(row['tests']) is not int or row['tests']!=int(count[-1]) or row['tests']!=len(report['membership']['units'][module])
                    or type(row['wall_ms']) not in (int,float) or not 0<=row['wall_ms']<=305000
                    or not re.fullmatch('[0-9a-f]{64}',row['temporary_directory_sha256'])
                    or not complete(python_module_command(module),raw,row['exit_code'])): raise ValueError()
        return report
    except (ValueError, KeyError, TypeError, AttributeError, IndexError):
        raise ValueError('Exact complete Python module proof missing or changed')


def complete(command, output, code):
    if code != 0:
        return False
    if '--test-reporter=tap' in command:
        values = {}
        for key, number in re.findall(rb'^# (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)\s*$', output, re.M):
            values[key.decode()] = int(number)
        return (set(values) == {'tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'}
                and values['tests'] > 0 and values['pass'] == values['tests']
                and not any(values[k] for k in ('fail', 'cancelled', 'skipped', 'todo')))
    if 'python-category' in command:
        try: python_category_report(output)
        except ValueError: return False
        return True
    if 'unittest' in command:
        return (bool(re.search(rb'Ran [1-9][0-9]* tests? in', output))
                and bool(re.search(rb'\nOK\s*$', output)) and b'skipped=' not in output)
    return True


def directory(root):
    return Path(native.git(root, 'rev-parse', '--absolute-git-dir')) / 'oracle/deterministic-package'


def read_receipt(root):
    current = native.identity(root)
    paths = [directory(root) / (current['source'] + '.json'),
             *directory(root).glob(current['source'] + '.*.json')]
    paths = [path for path in paths if path.exists()]
    if not paths:
        raise ValueError('No deterministic package receipt for this candidate')
    for candidate in paths:
        if candidate.is_symlink() or candidate.stat().st_mode & 0o077:
            raise ValueError('Unsafe package receipt')
    path = max(paths, key=lambda item: max(row['completed_at'] for row in json.loads(item.read_bytes())['runs']))
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError('Unsafe package receipt')
    value = json.loads(path.read_bytes())
    checksum = value.pop('sha256')
    if (native.digest(native.encoded(value)) != checksum or value.get('kind') != KIND
            or value.get('profile') != PROFILE or value.get('status') != 'VERIFIED'):
        raise ValueError('Invalid deterministic package receipt')
    if any(value.get(k) != v for k, v in current.items()):
        raise ValueError('Candidate, runtime or dependency inputs changed')
    if value['paths'] != scope(root, value['base'], current['source']):
        raise ValueError('Publication range changed')
    if value.get('scheduling') != scheduling(CHECKS):
        raise ValueError('Fixed scheduling contract changed')
    if [row['command'] for row in value['runs']] != CHECKS:
        raise ValueError('Fixed command category changed')
    require_node_file_bounds(native.selected_commands(root, value['base'], current['source']))
    check_combined_schedule(root, current, value['runs'], value.get('spec_runs'), value.get('selected_scheduling'), ci=value.get('spec_mode') == 'ci')
    native.check_spec_runs(root, value['base'], current['source'], value.get('spec_runs'), directory(root),
                           receipt_completed=native._completed(value), mode=value.get('spec_mode'))
    require_native_streams(root,value.get('spec_runs'),value.get('spec_mode'))
    for failure in directory(root).glob('*.failure.json'):
        record = json.loads(failure.read_bytes())
        if (record.get('identity') == current and record.get('runs')
                and max(row['completed_at'] for row in record['runs']) > max(row['completed_at'] for row in value['runs'])):
            raise ValueError('A later failed execution supersedes this receipt')
    for row in value['runs']:
        path = directory(root) / (row['output_sha256'] + '.log')
        if path.is_symlink() or path.stat().st_mode & 0o077:
            raise ValueError('Unsafe command output')
        output = path.read_bytes()
        if native.digest(output) != row['output_sha256'] or not complete(row['command'], output, row['exit_code']):
            raise ValueError('Original command output changed or is incomplete')
        if row['command']==['node','scripts/check-customer-data.mjs']:privacy_report(output)
        if row['command']==['node','scripts/check-publication-history.mjs']:history_report(output, value['base'], current['source'])
        if row['command']==PYTHON_CHECK:python_category_report(output, current, python_inventory(root))
    return dict(value, sha256=checksum)


def privacy_report(output):
    try:
        reports=[json.loads(line)['privacy_coverage'] for line in output.splitlines()
                 if line.startswith(b'{"privacy_coverage":')]
    except (ValueError, KeyError):
        reports=[]
    if len(reports)!=1 or not isinstance(reports[0],dict):
        raise ValueError('Native privacy report missing or malformed')
    report=reports[0]
    if (type(report.get('io_threads')) is not int or report['io_threads']!=8 or
            type(report.get('compact_persistence_bytes')) is not int or report['compact_persistence_bytes']!=65536 or
            any(type(report.get(key)) is not int or not 0<=report[key]<=8
                for key in ('max_active_persistence','max_awaiting_persistence'))):
        raise ValueError('Native privacy I/O or persistence bounds changed')
    return report


def scheduling(commands):
    return ('source-prepared-privacy-snapshot-parallel/1' if len(commands) in (8, 9) and
            (len(commands) == 8 or commands[8] == ['node', 'scripts/check-publication-history.mjs']) and
            commands[4] == ['node', 'scripts/check-customer-data.mjs'] and
            commands[5] == ['npm', 'run', 'check:publication'] and
            commands[6][:3] == ['node', '--test', '--test-reporter=tap'] and
            'unittest' in commands[7] else 'serial/1')


def execute_check(root, command, ready=None, history=None):
    began = time.time()
    try:
        if ready is None:
            environment = dict(os.environ)
            if history is not None:
                environment.update(BOC_PUBLICATION_BASE=history[0], BOC_PUBLICATION_SOURCE=history[1])
            if command == PYTHON_CHECK:
                process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
                try:
                    stdout, stderr = process.communicate(timeout=300)
                    code = process.returncode
                except subprocess.TimeoutExpired:
                    # The category's TERM handler drains/kills its isolated
                    # groups. Preserve the original 300-second deadline.
                    process.terminate()
                    try: stdout, stderr = process.communicate(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill(); stdout, stderr = process.communicate()
                    code = 'TIMEOUT'
                output = stdout + b'\n' + stderr
            else:
                result = subprocess.run(command, cwd=root, capture_output=True, timeout=300, env=environment)
                output, code = result.stdout + b'\n' + result.stderr, result.returncode
        else:
            fd, token = ready
            environment = dict(os.environ, BOC_PRIVACY_READY_FD=str(fd), BOC_PRIVACY_READY_TOKEN=token, UV_THREADPOOL_SIZE="8")
            try:
                process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                           env=environment, pass_fds=(fd,))
            finally:
                os.close(fd)
            try:
                stdout, stderr = process.communicate(timeout=300)
                output, code = stdout + b'\n' + stderr, process.returncode
            except subprocess.TimeoutExpired:
                process.kill(); stdout, stderr = process.communicate()
                output, code = stdout + b'\n' + stderr, 'TIMEOUT'
    except subprocess.TimeoutExpired as error:
        output, code = (error.stdout or b'') + b'\n' + (error.stderr or b''), 'TIMEOUT'
    except OSError as error:
        output, code = str(error).encode(), 'EXECUTION_ERROR'
    checksum = native.digest(output)
    path = directory(root) / (checksum + '.log')
    with _OUTPUT_LOCK:
        if not path.exists():
            native.private_write(path, output)
    return {'command': command, 'exit_code': code, 'output_sha256': checksum,
            'started_at': began, 'completed_at': time.time()}


def await_privacy_snapshot(fd, token, before):
    with selectors.DefaultSelector() as selector:
        selector.register(fd, selectors.EVENT_READ)
        pending = b''; deadline = time.monotonic() + 10
        while b'\n' not in pending:
            if not selector.select(max(0, deadline-time.monotonic())):
                raise ValueError('Privacy snapshot readiness timed out')
            part = os.read(fd, 1025-len(pending))
            if not part or len(pending)+len(part)>1024:
                raise ValueError('Privacy snapshot readiness missing or oversized')
            pending += part
        row = json.loads(pending)
        if (set(row) != {'kind','token','source','tree','files','policy_sha256'} or
                row['kind'] != 'boc-privacy-snapshot-ready-v1' or row['token'] != token or
                row['source'] != before['source'] or row['tree'] != before['tree'] or
                type(row['files']) is not int or row['files'] < 1 or
                not re.fullmatch('[0-9a-f]{64}', row['policy_sha256'])):
            raise ValueError('Privacy snapshot readiness identity changed')
        return row


def run_category(root, commands, before, base=None, *, before_privacy=None, after_snapshot=None):
    runs = []
    parallel = scheduling(commands) != 'serial/1'
    for command in commands[:4] if parallel else commands:
        row = execute_check(root, command); runs.append(row)
        if not complete(command, (directory(root)/(row['output_sha256']+'.log')).read_bytes(), row['exit_code']):
            return runs
    if not parallel:
        return runs
    if before_privacy is not None and before_privacy(runs) is not True:
        return runs
    read_fd, write_fd = os.pipe(); token = secrets.token_hex(32)
    with ThreadPoolExecutor(max_workers=4) as pool:
        privacy = pool.submit(execute_check, root, commands[4], (write_fd, token))
        try:
            snapshot = await_privacy_snapshot(read_fd, token, before)
        except Exception as error:
            runs.append(privacy.result())
            # A malformed/missing snapshot never starts the independent suites.
            row = runs[-1]; original=(directory(root)/(row['output_sha256']+'.log')).read_bytes()
            output=original+b'\n'+str(error).encode(); checksum=native.digest(output)
            path=directory(root)/(checksum+'.log')
            if not path.exists():native.private_write(path,output)
            row.update(exit_code='READINESS_ERROR',output_sha256=checksum)
            return runs
        finally:
            os.close(read_fd)
        if after_snapshot is not None and after_snapshot(snapshot) is not True:
            runs.append(privacy.result())
            return runs
        others = [pool.submit(execute_check, root, command, None, (base, before['source']))
                  if command == ['node', 'scripts/check-publication-history.mjs'] else
                  pool.submit(execute_check, root, command) for command in commands[5:]]
        runs.extend([privacy.result(), *(future.result() for future in others)])
    privacy_output=(directory(root)/(runs[4]['output_sha256']+'.log')).read_bytes()
    try:
        report=privacy_report(privacy_output)
        matches=all(report.get(key)==snapshot[value] for key,value in
                    [('source_commit','source'),('source_tree','tree'),('files','files'),('policy_sha256','policy_sha256')])
    except ValueError:
        matches=False
    if not matches:runs[4]['exit_code']='SNAPSHOT_RESULT_MISMATCH'
    if commands[7] == PYTHON_CHECK:
        row = runs[7]
        try: python_category_report((directory(root)/(row['output_sha256']+'.log')).read_bytes(), before, python_inventory(root))
        except ValueError: row['exit_code'] = 'PYTHON_RESULT_MISMATCH'
    if len(commands) == 9:
        row = runs[8]
        try: history_report((directory(root)/(row['output_sha256']+'.log')).read_bytes(), base, before['source'])
        except ValueError: row['exit_code'] = 'HISTORY_RESULT_MISMATCH'
    return runs


COMBINED_SCHEDULING = 'prepared-sanity-complete-privacy-ready-selected-parallel/1'


def require_node_file_bounds(selected):
    """Current package admission requires the actual newly sealed Node vector."""
    for row in selected:
        if row['category'] == 'sanity': continue
        expected = ['node','--test','--test-reporter=tap','--test-concurrency=1',*row['tests']]
        if row['argv'] != expected:
            raise ValueError('Current selected Node commands require explicit file concurrency one')


def require_native_streams(root,rows,mode):
    """Profile19 requires actual streams; immutable historical records stay legacy."""
    if mode=='ci':return  # CI executes the exact vectors directly, without a local native record.
    if mode!='native' or not isinstance(rows,list):raise ValueError('Native stream execution mode changed')
    for row in rows:
        record=json.loads(Path(row['record']).read_bytes())
        if 'stream_custody' not in record:raise ValueError('Current native execution lacks stream custody')
        streams,finish=contract.verify_stream_execution(root,record)
        if finish['status']!='COMPLETE':raise ValueError('Incomplete native stream execution')


def run_complete_category(root, base, before, selected, *, ci=False):
    """Actual sanity is complete before the existing readiness-gated parallel tail."""
    spec_runs = []; futures = []; errors = []; schedule = None
    # A generic/source lane and other selected shapes retain their original order.
    combined = (scheduling(CHECKS) != 'serial/1'
                and [row['category'] for row in selected] == ['sanity', 'interactions', 'acceptance'])
    if not combined:
        return run_category(root, CHECKS, before, base), None, None, []
    with ThreadPoolExecutor(max_workers=2) as pool:
        sanity_report = None
        def sanity(preparation):
            nonlocal sanity_report
            entry, passed = native.execute_spec_category(root, base, before['source'], directory(root), selected[0],
                ci=ci, environment_overrides={'UV_THREADPOOL_SIZE':'8'})
            spec_runs.append(entry)
            if not passed:
                errors.append('Selected sanity failed'); return False
            try:
                native.check_spec_environment(root, entry, directory(root), ci=ci)
                sanity_report = privacy_report(native.spec_category_output(root, entry, directory(root), ci=ci))
                if (sanity_report.get('source_commit') != before['source']
                        or sanity_report.get('source_tree') != before['tree']):
                    raise ValueError('Selected sanity source changed')
            except (ValueError, KeyError, TypeError, OSError) as error:
                errors.append(str(error)); return False
            return True
        def ready(snapshot):
            nonlocal schedule
            if not all(sanity_report.get(key) == snapshot[value] for key,value in
                    [('source_commit','source'),('source_tree','tree'),('files','files'),('policy_sha256','policy_sha256')]):
                errors.append('Selected sanity and fixed snapshot differ'); return False
            schedule = {'kind':COMBINED_SCHEDULING,'selected_workers':2,
                        'ready_at':time.time(), 'snapshot':{key:snapshot[key] for key in ('source','tree','files','policy_sha256')}}
            futures.extend(pool.submit(native.execute_spec_category, root, base, before['source'], directory(root), row, ci=ci)
                           for row in selected[1:])
            return True
        try:
            runs = run_category(root, CHECKS, before, base, before_privacy=sanity, after_snapshot=ready)
        finally:
            # The context waits every owned category even when another job fails.
            for future in futures:
                try:
                    entry, passed = future.result(); spec_runs.append(entry)
                    if not passed: errors.append('Selected category failed: '+entry['category'])
                except Exception as error:
                    errors.append('Selected category execution error: '+type(error).__name__)
    return runs, spec_runs, schedule, errors


def check_combined_schedule(root, before, runs, spec_runs, schedule, *, ci=False):
    if not isinstance(spec_runs,list):raise ValueError('Selected schedule membership missing')
    if schedule is None:
        if ([row.get('category') for row in spec_runs] == ['sanity','interactions','acceptance'] and scheduling(CHECKS) != 'serial/1'
                or any('environment_overrides' in row for row in spec_runs)):
            raise ValueError('Selected schedule missing')
        return
    try:
        if (set(schedule) != {'kind','selected_workers','ready_at','snapshot'} or schedule['kind'] != COMBINED_SCHEDULING
                or type(schedule['selected_workers']) is not int or schedule['selected_workers'] != 2
                or type(schedule['ready_at']) not in (float,int)
                or [row['category'] for row in spec_runs] != ['sanity','interactions','acceptance']
                or [row['command'] for row in runs] != CHECKS
                or spec_runs[0].get('environment_overrides') != {'UV_THREADPOOL_SIZE':'8'}
                or any('environment_overrides' in row for row in spec_runs[1:])):
            raise ValueError()
        snapshot=schedule['snapshot']
        if (set(snapshot) != {'source','tree','files','policy_sha256'} or snapshot['source'] != before['source']
                or snapshot['tree'] != before['tree'] or type(snapshot['files']) is not int or snapshot['files'] < 1
                or not re.fullmatch('[0-9a-f]{64}',snapshot['policy_sha256'])):
            raise ValueError()
        fixed=privacy_report((directory(root)/(runs[4]['output_sha256']+'.log')).read_bytes())
        native.check_spec_environment(root,spec_runs[0],directory(root),ci=ci)
        sanity=privacy_report(native.spec_category_output(root,spec_runs[0],directory(root),ci=ci))
        for report in (fixed,sanity):
            if not all(report.get(key)==snapshot[value] for key,value in
                    [('source_commit','source'),('source_tree','tree'),('files','files'),('policy_sha256','policy_sha256')]):raise ValueError()
        if not (max(row['completed_at'] for row in runs[:4]) <= spec_runs[0]['started_at']
                <= spec_runs[0]['completed_at'] <= runs[4]['started_at'] <= schedule['ready_at']
                <= min(row['started_at'] for row in [*runs[5:],*spec_runs[1:]])
                and schedule['ready_at'] <= runs[4]['completed_at']
                and max(row['started_at'] for row in [runs[6],*spec_runs[1:]])
                    < min(row['completed_at'] for row in [runs[6],*spec_runs[1:]])):raise ValueError()
    except (ValueError,KeyError,TypeError,IndexError,OSError):
        raise ValueError('Complete selected scheduling custody changed')


def history_report(output, base, source):
    try:
        reports = [json.loads(line)['publication_history'] for line in output.splitlines()
                   if line.startswith(b'{"publication_history":')]
        if len(reports) != 1: raise ValueError()
        row = reports[0]
        if set(row) != {'base','source','status','pairs','inventory_sha256','policy_sha256','findings','classifications'} or row['findings'] != []:
            raise ValueError()
        classifications = row['classifications']
        expected = [{'path_sha256': hashlib.sha256(b'scripts/lib/runtime-skill-export.mjs').hexdigest(),
                     'blob':'7dab470bc8e3a1f647a2d2a5ec094e48be25f401',
                     'sha256':'49ae97294c1c9e0b3fa09ca0dba20603e2d02685fa5a65aee3fc847f9b4db242',
                     'kind':'exact_public_git_ssh_protocol_user','literal_count':1}]
        expected += [dict(record,path_sha256=hashlib.sha256(b'tests/oracle_spec_test.py').hexdigest(),
                         kind='exact_historical_negative_fixture_key_header',literal_count=1) for record in HISTORICAL_HEADER_RECORDS]
        if not isinstance(classifications,list) or len(classifications)>len(expected):raise ValueError()
        seen=set()
        for item in classifications:
            if item not in expected or any(type(item[k]) is not int for k in ('literal_count','bytes','offset','span_bytes') if k in item):raise ValueError()
            identity=(item['path_sha256'],item['blob'],item['kind'])
            if identity in seen:raise ValueError()
            seen.add(identity)
        if (row['base'] != base or row['source'] != source or row['status'] != 'PASS'
                or type(row['pairs']) is not int or row['pairs'] < 1
                or not re.fullmatch('[0-9a-f]{64}', row['inventory_sha256'])
                or not re.fullmatch('[0-9a-f]{64}', row['policy_sha256'])): raise ValueError()
        return row
    except (ValueError, KeyError, TypeError):
        raise ValueError('Exact complete publication history proof missing or changed')


def failed_check_summary(runs, root):
    """Expose bounded public test locators/counts, retaining raw output privately."""
    summaries = []
    for index, row in enumerate(runs):
        output = (directory(root) / (row['output_sha256'] + '.log')).read_bytes()
        if complete(row['command'], output, row['exit_code']):
            continue
        locators = []
        for line in output.decode('utf-8', errors='replace').splitlines():
            match = re.fullmatch(r'(?:not ok [0-9]+ - |FAIL: |ERROR: )([A-Za-z0-9_ .,:()/-]{1,512})', line)
            if match and len(locators) < 20:
                locators.append(match.group(1))
        summaries.append({'check_index': index, 'exit_code': row['exit_code'],
                          'output_sha256': row['output_sha256'], 'failed_tests': locators})
    return summaries


def validate(root, base, requested_at, *, ci=False):
    start = None if requested_at == 'unknown' else datetime.fromisoformat(requested_at.replace('Z', '+00:00'))
    if start is not None and (start.tzinfo is None or start > datetime.now(timezone.utc)):
        raise ValueError('Original timezone-aware request time is required')
    before = native.identity(root)
    paths = scope(root, base, before['source'])
    if not ci and contract.gate(root, base, before['source'])['status'] == 'SPEC_SEALED':
        contract.native_origin(root, before['source'])
    if not CHECKS:
        raise ValueError('Fixed package check category is empty')
    selected_commands = native.selected_commands(root, base, before['source'])
    require_node_file_bounds(selected_commands)
    runs, selected, selected_schedule, execution_errors = run_complete_category(root, base, before, selected_commands, ci=ci)
    if execution_errors or [row['command'] for row in runs] != CHECKS or any(not complete(row['command'], (directory(root) / (row['output_sha256'] + '.log')).read_bytes(), row['exit_code']) for row in runs):
        native.private_write(directory(root) / (str(time.time_ns()) + '.failure.json'),
                             native.encoded({'kind': KIND + '-failure', 'identity': before,
                                             'base': base, 'request_started_at': requested_at, 'runs': runs,
                                             'spec_runs': selected or [], 'execution_errors': execution_errors}))
        raise ValueError('Required package check failed: ' + json.dumps(failed_check_summary(runs, root), sort_keys=True)
                         + '; original outputs retained: ' + str(directory(root)))
    if selected is None:
        selected = native.spec_runs(root, base, before['source'], directory(root),
                                {'kind': KIND + '-failure', 'identity': before, 'base': base,
                                 'request_started_at': requested_at, 'runs': runs}, ci=ci)
    check_combined_schedule(root, before, runs, selected, selected_schedule, ci=ci)
    if native.identity(root) != before:
        raise ValueError('Source, generated package or runtime changed during verification')
    value = {'kind': KIND, 'profile': PROFILE, 'status': 'VERIFIED', **before,
             'base': base, 'paths': paths, 'runs': runs, 'scheduling': scheduling(CHECKS),
             'spec_runs': selected, 'selected_scheduling': selected_schedule, 'spec_mode': 'ci' if ci else 'native',
             'request_started_at': requested_at,
             'sla_status': ('BREACHED_ORIGINAL_TIME_UNAVAILABLE' if start is None else
                            'BREACHED' if time.time() - start.timestamp() > 300 else 'NOT_ESTABLISHED'),
             'deployment_authorized': False}
    value['sha256'] = native.digest(native.encoded(value))
    path = directory(root) / (before['source'] + '.json')
    if path.exists():
        # A repaired retry gets new immutable evidence; prior executions survive.
        path = directory(root) / (before['source'] + '.' + str(time.time_ns()) + '.json')
    native.private_write(path, native.encoded(value))
    return read_receipt(root)


def effect(root, command, value):
    began = time.time()
    try:
        result = subprocess.run(command, cwd=root, capture_output=True, timeout=120)
        output, code = result.stdout + b'\n' + result.stderr, result.returncode
    except subprocess.TimeoutExpired as error:
        output, code = (error.stdout or b'') + b'\n' + (error.stderr or b''), 'TIMEOUT'
    checksum = native.digest(output)
    path = directory(root) / (checksum + '.log')
    if not path.exists():
        native.private_write(path, output)
    record = {'kind': KIND + '-publication-attempt', 'source': value['source'],
              'tree': value['tree'], 'base': value['base'], 'command': command,
              'exit_code': code, 'output_sha256': checksum,
              'started_at': began, 'completed_at': time.time()}
    native.private_write(directory(root) / (str(time.time_ns()) + '.publication.json'), native.encoded(record))
    if code != 0:
        raise ValueError('Git publication failed; original attempt retained: ' + str(path))


def publish(root, ref, pr=None):
    if pr is not None and not re.fullmatch('[1-9][0-9]*', str(pr)):
        raise ValueError('Exact numeric pull request identity required')
    value = read_receipt(root)
    if value.get('spec_mode') != 'native':
        raise ValueError('Publication requires the local native spec execution receipt')
    version = json.loads(blob(root, value['source'], 'package.json'))['version']
    if ref != 'codex/release-v' + version:
        raise ValueError('Exact version-bound release ref required')
    destinations = native.git(root, 'remote', 'get-url', '--push', '--all', 'origin').splitlines()
    owned = {'https://github.com/' + native.REPOSITORY + '.git',
             'git' + chr(64) + 'github.com:' + native.REPOSITORY + '.git'}
    if len(destinations) != 1 or destinations[0] not in owned:
        raise ValueError('Exact owned publication destination required')
    remote = destinations[0]
    if native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0] != value['base']:
        raise ValueError('Remote publication base moved; integrate and revalidate')
    if pr is None:
        effect(root, ['git', 'push', remote, value['source'] + ':refs/heads/' + ref], value)
        observed = native.git(root, 'ls-remote', remote, 'refs/heads/' + ref).split()
        if not observed or observed[0] != value['source']:
            raise ValueError('Release branch publication was not confirmed; read state before retrying')
    else:
        try:
            from . import publication_admission as admission
        except ImportError:
            import publication_admission as admission
        selected = {'candidate_commit': value['source'], 'candidate_tree': value['tree'],
                    'release_ref': ref, 'publication_scope': {'baseline_commit': value['base']}}
        observed = admission._remote_admission(root, selected)
        native.private_write(directory(root) / (str(time.time_ns()) + '.remote.json'), native.encoded(observed))
        read_receipt(root)
        if native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0] != value['base']:
            raise ValueError('Remote publication base moved during CI admission')
        # Exact-baseline fast-forward over the owned destination replaces the PR merge.
        effect(root, ['git', 'push', '--force-with-lease=refs/heads/main:' + value['base'], remote,
                      value['source'] + ':refs/heads/main'], value)
        merged = native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0]
        if merged != value['source']:
            raise ValueError('Main publication was not confirmed; read state before retrying')
        native.git(root, 'fetch', 'origin')
        if native.git(root, 'rev-parse', merged + '^{tree}') != value['tree']:
            raise ValueError('Published main tree differs from verified package')
    return {'status': 'RELEASE_SOURCE_PUSHED' if pr is None else 'RELEASE_MERGED',
            'source': value['source'], 'deployment_authorized': False}


def github_read(path):
    request = urllib.request.Request('https://api.github.com/repos/' + native.REPOSITORY + path,
                                     headers={'Accept': 'application/vnd.github+json',
                                              'User-Agent': 'bos-deterministic-package'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def ci_observation(source, ref, read=github_read):
    """Consume actual repository-owned Actions execution, never a supplied PASS."""
    data = read('/actions/runs?event=push&head_sha=' + source + '&per_page=100')
    if data.get('total_count', 0) > 100:
        raise ValueError('Actions result set is incomplete')
    runs = [run for run in data.get('workflow_runs', [])
            if run.get('path') == '.github/workflows/publication-safety.yml'
            and run.get('head_sha') == source and run.get('head_branch') == ref
            and run.get('event') == 'push'
            and run.get('repository', {}).get('full_name') == native.REPOSITORY
            and run.get('head_repository', {}).get('full_name') == native.REPOSITORY]
    if not runs:
        raise ValueError('Exact-source repository Actions execution is not available yet')
    run = max(runs, key=lambda row: int(row['id']))
    if run.get('status') != 'completed' or run.get('conclusion') != 'success':
        raise ValueError('Latest exact-source repository CI is not successful: ' + str(run.get('status'))
                         + '/' + str(run.get('conclusion')))
    identity = run['id']
    if not isinstance(identity, int) or identity <= 0:
        raise ValueError('Invalid Actions execution identity')
    jobs = read('/actions/runs/' + str(identity) + '/jobs?filter=latest&per_page=100')
    if jobs.get('total_count') != len(jobs.get('jobs', [])):
        raise ValueError('Actions job evidence is incomplete')
    relevant = [job for job in jobs['jobs'] if job.get('name') == 'verify-public-repository']
    if len(relevant) != 1 or relevant[0].get('conclusion') != 'success':
        raise ValueError('Required repository verification job did not succeed')
    step = [step for step in relevant[0].get('steps', [])
            if step.get('name') == 'Verify the fixed deterministic source or skill-package category']
    if len(step) != 1 or step[0].get('conclusion') != 'success':
        raise ValueError('Fixed deterministic category has no successful native execution')
    return {'run': run, 'jobs': jobs}


def verify_published(root, source, read=github_read):
    """Accept a published main commit by its exact-source deterministic CI evidence.

    The commit must be on origin/main and its version-bound release branch must
    carry a successful repository-owned run of the fixed deterministic step for
    that exact SHA (the same evidence promote requires before publishing)."""
    if not re.fullmatch('[0-9a-f]{40}', source or ''):
        raise ValueError('Exact 40-character published commit required')
    native.git(root, 'merge-base', '--is-ancestor', source, 'origin/main')
    version = json.loads(blob(root, source, 'package.json'))['version']
    observation = ci_observation(source, 'codex/release-v' + version, read)
    return {'status': 'PUBLISHED_VERIFIED', 'source': source, 'version': version,
            'run': observation['run']['id']}


def promote(root, ref):
    value = read_receipt(root)
    if value.get('spec_mode') != 'native':
        raise ValueError('Publication requires the local native spec execution receipt')
    version = json.loads(blob(root, value['source'], 'package.json'))['version']
    if ref != 'codex/release-v' + version:
        raise ValueError('Exact version-bound release ref required')
    destinations = native.git(root, 'remote', 'get-url', '--push', '--all', 'origin').splitlines()
    owned = {'https://github.com/' + native.REPOSITORY + '.git',
             'git' + chr(64) + 'github.com:' + native.REPOSITORY + '.git'}
    if len(destinations) != 1 or destinations[0] not in owned:
        raise ValueError('Exact owned publication destination required')
    remote = destinations[0]
    branch = native.git(root, 'ls-remote', remote, 'refs/heads/' + ref).split()
    if not branch or branch[0] != value['source']:
        raise ValueError('Remote release ref differs from the verified source')
    observed = ci_observation(value['source'], ref)
    native.private_write(directory(root) / (str(time.time_ns()) + '.remote.json'), native.encoded(observed))
    read_receipt(root)
    if native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0] != value['base']:
        raise ValueError('Publication base moved; integrate and revalidate')
    # Fast-forward push leased on the exact validated base; server protection remains active.
    effect(root, ['git', 'push', '--force-with-lease=refs/heads/main:' + value['base'], remote,
                  value['source'] + ':refs/heads/main'], value)
    actual = native.git(root, 'ls-remote', remote, 'refs/heads/main').split()
    if not actual or actual[0] != value['source']:
        raise ValueError('Main publication was not confirmed; read state before retrying')
    return {'status': 'RELEASE_PUBLISHED', 'source': value['source'],
            'ci_run_id': observed['run']['id'], 'deployment_authorized': False}


def ci(root, base, requested):
    """Spec gate first, then the admitting lane, then the sealed spec's own tests."""
    head = native.git(root, 'rev-parse', 'HEAD')
    admitted = contract.gate(root, base, head)  # Missing or mismatched sealed spec: fail now.
    print(json.dumps({'spec_gate': admitted['status'], 'seal': admitted.get('seal')}))
    try:
        native.scope(root, base, head)
    except ValueError:
        lane = None
    else:
        lane = native.validate(root, base, requested, ci=True)
    if lane is None:
        try:
            scope(root, base, head)
        except ValueError:
            lane = None
        else:
            lane = validate(root, base, requested, ci=True)
    if lane is None and admitted['status'] == 'DOCS_ONLY':
        for command in (['git', 'diff', '--check', base, head], ['npm', 'run', 'check:privacy'],
                        ['npm', 'run', 'check:publication']):
            subprocess.run(command, cwd=root, check=True)
    if admitted['status'] == 'SPEC_SEALED' and lane is None:
        # A deterministic lane already executed and bound every selected category; run them once.
        tests = contract.ci_execute(root, head)
        print(json.dumps({'spec_tests': tests['status'], 'seal': tests['seal']}))
    if lane is None:
        # Outside both deterministic lanes the native contract still governs: CI imports the
        # exact native approval status and command coverage, executing any uncovered command.
        subprocess.run([sys.executable, 'tools/command_coverage.py', 'ci', '--candidate', head], cwd=root, check=True)
    print(json.dumps({'kind': lane['kind'] if lane else 'boc-oracle-spec-ci/1', 'status': 'VERIFIED',
                      'source': head, 'sla_status': 'CI_PHASE_ONLY'}))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['validate', 'verify', 'push', 'merge', 'promote', 'ci',
                                           'verify-published', 'python-category'])
    parser.add_argument('component', nargs='?')
    parser.add_argument('--base')
    parser.add_argument('--requested-at')
    parser.add_argument('--ref')
    parser.add_argument('--pr')
    parser.add_argument('--source')
    args = parser.parse_args(argv)
    root = Path(native.git(Path.cwd(), 'rev-parse', '--show-toplevel'))
    if args.action == 'python-category':
        if args.component != 'unittest' or any((args.base,args.requested_at,args.ref,args.pr,args.source)):
            raise ValueError('Exact fixed Python category required')
        _PYTHON_CANCELLED.clear()
        signal.signal(signal.SIGTERM, cancel_python_category)
        signal.signal(signal.SIGINT, cancel_python_category)
        output, code = run_python_category(root, reset=False)
        sys.stdout.buffer.write(output); sys.stdout.buffer.flush()
        return code
    if args.component is not None: raise ValueError('Unexpected category component')
    if args.action in {'validate', 'ci'}:
        requested = (datetime.now(timezone.utc).isoformat() if args.action == 'ci' else
                     args.requested_at or os.environ.get('BOS_REVIEW_STARTED_AT') or 'unknown')
        if not args.base:
            args.base = native.git(root, 'rev-parse', 'origin/main^{commit}')
        if args.action == 'ci':
            return ci(root, args.base, requested)
        value = validate(root, args.base, requested)
    elif args.action == 'verify':
        value = read_receipt(root)
    elif args.action == 'verify-published':
        value = verify_published(root, args.source)
    elif args.action == 'promote':
        value = promote(root, args.ref)
    else:
        value = publish(root, args.ref, args.pr if args.action == 'merge' else None)
    print(json.dumps({key: value[key] for key in ('kind', 'status', 'source', 'sla_status',
                                                 'deployment_authorized') if key in value}))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
