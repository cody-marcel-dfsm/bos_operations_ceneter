# Education Operation Center for GitHub Copilot

Education Operation Center coordinates complex, evidence-backed work across an education company's authorized email, calendars, advertising, enrollment, staffing, and billing systems. For example, Acme Learning Center could ask it to find Acme.com partnership invoices in its billing inbox, reconcile them against payment records in its configured accounting system, and produce a source-linked exception ledger. Other workflows connect outreach to trials and enrollments, balance camps against registrations and instructor availability, prepare parent communications, and trace advertising outcomes. The plugin requires BOS and each focused skill follows its deterministic workflow through the BOS platform connection with server-enforced application scope while preserving human judgment, approvals, organizational settings, roles, application scope, and provider boundaries.

Copy `skills/` into the target repository's `.agents/skills/` directory.
Install BOS first. This product uses the BOS connection and its native authentication action.

Verify this product in the target repository with `npm run install:verify:copilot-runtime -- --target <repository> --product education-center`.
Copilot reads repository configuration directly and has no BOS package-cache layer.
