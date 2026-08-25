# Release notes

## Version 0.4.46 — initial OpenAI marketplace submission

Education Operation Center is a skills-plus-MCP plugin for authorized adult
education-center staff. It combines focused operational skills with a
tenant-scoped BOS connection for enrollment, student, class, camp, lead,
calendar, email-draft, file, attribution, review-outreach, campaign, and agent
call workflows.

This is the initial public OpenAI marketplace submission. The production MCP
resource is
`https://dfsm.ai/mcp/apps/leaddirector/education-center`. Review credentials
resolve only the synthetic review tenant and require no MFA or private-network
access. The submitted test suite uses fictional data and covers context,
students, enrollments, camp rosters, leads, cross-tenant isolation, input
validation, and consequential-action controls.

Provider-backed capabilities appear only when the authenticated tenant, role,
installed application, and provider configuration authorize them. External
calls, campaign delivery, and conversion uploads remain governed actions.
