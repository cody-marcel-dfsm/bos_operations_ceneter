# Marketplace listing

## Paste-ready fields

**Plugin name**

Education Operation Center

**Developer identity**

Infinite State Machines LLC — select the verified business identity in the
publishing OpenAI organization.

**Category**

Productivity

**Short description**

Agent-first education operations for complex, human-centered work.

**Long description**

Education Operation Center helps authorized adult education-center staff plan
and execute work across the growth and enrollment lifecycle: outreach, free
trials, enrollment, classes, camps, parent communication, instructor
operations, attribution, and reimbursement. Its focused skills coordinate
tenant-scoped data from BOS and customer-authorized services, including student
and enrollment systems, email, calendars, files, advertising, calling, and
campaign delivery. Read workflows summarize evidence with provenance. Write or
external-communication workflows preserve the user's authority, required
approvals, organizational settings, and provider boundaries. Installing the
plugin does not create an education-center account or grant access to an
organization; each user must sign in and can access only the BOS tenant, role,
application, tools, and provider connections authorized for that identity.

**Website URL**

Required final URL: a public product page owned by Infinite State Machines LLC.
Current company URL: `https://dfsm.ai`.

Recommended path: `https://dfsm.ai/products/education-operation-center`

**Support URL**

Recommended path: `https://dfsm.ai/support/education-operation-center`

**Privacy policy URL**

Recommended path: `https://dfsm.ai/legal/education-operation-center/privacy`

**Terms URL**

Recommended path: `https://dfsm.ai/legal/education-operation-center/terms`

**Logo**

Candidate: `assets/icon-candidate.png` (1254 × 1254 PNG with a solid white
background). Brand approval and portal-format export remain required.

## Audience and eligibility

- Authorized adult staff of education centers that have an active BOS tenant
  and Education Operation Center entitlement.
- The plugin is an operational staff tool. It is not designed for direct use by
  children or students.
- Each user signs in with an individual identity. Access is limited by the
  server-resolved organization, role, installed application, resource group,
  and connected-provider permissions.

## Recommended initial availability

United States.

This conservative launch scope aligns with the current business, customer, and
support footprint. Expand availability after legal terms, support coverage, and
provider behavior are validated for additional countries.

## Production MCP configuration

- URL type: Universal
- URL: `https://dfsm.ai/mcp/apps/leaddirector/education-center`
- Authentication: OAuth 2.1 authorization-code flow with PKCE and refresh-token
  support; the grant is resource-scoped to this exact MCP URL.
- MCP UI: none identified in the current route contract. A content security
  policy is therefore not expected for the initial submission. Confirm this
  after Scan Tools.
- Workspace domain restrictions: optional. The current authorization metadata
  does not advertise the UserInfo endpoint and `openid email` support OpenAI
  requires for that optional feature.

## Starter prompts

1. Initialize my education center, including its customer-facing brand name.
2. Create today's education center operations plan.
3. Give me a weekly summary for my director.

Recommended reviewer-friendly additions:

4. Show the students and enrollments in my authorized review tenant for the
   configured test week, and cite the source of each result.
5. Build a camp roster summary for the configured test dates, including daily
   attendance and open-seat counts.

## Public listing limitations

- Results depend on the customer's enabled BOS capabilities and separately
  authorized provider connections.
- The plugin does not bypass provider permissions or provision customer data.
- Calls, campaign execution, conversion uploads, and other consequential
  actions require the applicable role, provider readiness, and workflow
  approvals.
- The initial listing should make no claim of student-information regulatory
  compliance until counsel has approved the final policy and operational
  controls for the intended customer population.
