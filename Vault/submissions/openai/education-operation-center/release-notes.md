# Release notes

## Version 0.4.46 — initial OpenAI marketplace submission

Education Operation Center is a BOS subservice plugin for authorized adult
education-center staff. It combines focused operational skills for enrollment,
student, class, camp, lead,
calendar, email-draft, file, attribution, review-outreach, campaign, and agent
call workflows.

The plugin uses the separately installed and authenticated BOS connection. It
contains no MCP endpoint, registered app, connector, or separate BOS login.
Review credentials resolve only the synthetic review tenant and require no MFA
or private-network access. The submitted test suite uses fictional data and covers context,
students, enrollments, camp rosters, leads, cross-tenant isolation, input
validation, and consequential-action controls.

Provider-backed capabilities appear only when the authenticated tenant, role,
installed application, and provider configuration authorize them. External
calls, campaign delivery, and conversion uploads remain governed actions.
