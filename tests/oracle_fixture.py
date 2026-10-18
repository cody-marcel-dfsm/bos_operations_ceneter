"""Full synthetic reviewer contracts for pre-existing receipt/governance tests.

These tests exercise receipt and authorization invariants. Review-series tests
construct their own results and never install this adapter.
"""


def _oracle_fixture_result(result, context):
    paths = context["required_coverage_paths"]
    inputs = lambda path: [{"path": path, "digest": context["input_hashes"][path]}]
    findings = []
    for number, original in enumerate(result.get("findings", []), 1):
        path = original.get("file", paths[0])
        findings.append(dict(original, id=f"F{number:03d}", severity=original.get("severity", "high"),
                             file=path, line=original.get("line", 1), root_cause="synthetic fixture cause",
                             reproduction="synthetic fixture reproduction", required_behavior="satisfy synthetic invariant",
                             recommendation="repair synthetic invariant", affected_paths=[path],
                             acceptance_checks=["synthetic acceptance"], origin="INITIAL",
                             origin_reason="synthetic reviewer fixture"))
    open_ids = [key for key, item in context["prior_findings"].items() if item["state"] == "OPEN"]
    return dict(result, protected_effects=result.get("protected_effects", {"active": [], "dispositions": []}), review_status="COMPLETE", findings=findings,
                coverage=[{"path": path, "status": "REVIEWED", "inputs": inputs(path),
                           "reason": "synthetic test assessment"} for path in paths],
                resolutions=[{"id": key, "explanation": "synthetic resolution", "inputs": inputs(paths[0])}
                             for key in open_ids if key not in {item["id"] for item in findings}],
                validations=[], limitations=[], repair_plan="synthetic consolidated repair plan")


def _install_oracle_fixture(module):
    actual_issue = module.issue

    def issue(root, evidence, owner, reviewer=None):
        if reviewer is None:
            return actual_issue(root, evidence, owner)

        def structured(*args):
            result = reviewer(*args)
            context = module.json.loads((module._RUN.get() / "review-context.json").read_text())
            return _oracle_fixture_result(result, context)

        return actual_issue(root, evidence, owner, structured)

    module.issue = issue


_install_oracle_fixture(o)
