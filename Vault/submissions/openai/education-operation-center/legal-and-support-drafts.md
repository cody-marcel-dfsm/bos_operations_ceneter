# Legal and support page drafts

Status: DRAFT FOR BUSINESS AND COUNSEL REVIEW — NOT PUBLISHED

These drafts organize verified product facts for final legal review. Counsel or
the authorized business owner must set effective dates, retention periods,
governing-law terms, support commitments, and any education-record obligations
before publication.

## Privacy policy draft

### Education Operation Center Privacy Notice

Infinite State Machines LLC provides Education Operation Center, a
tenant-scoped operational plugin for authorized adult staff of participating
education centers.

#### Information processed

The service processes the prompts and parameters a user supplies, the user's
authenticated BOS identity and authorization context, and records returned by
services the user's organization has connected. Depending on enabled
capabilities, those records may include leads, students, parents or guardians,
enrollments, classes, camps, instructors, schedules, email evidence and drafts,
calendar events, files, advertising attribution, reviews, campaign records,
delivery events, and call status. The service also processes security,
authorization, audit, error, and operational metadata needed to provide and
protect the service.

Provider passwords, OAuth tokens, API keys, and authorization headers are not
intended to appear in ChatGPT or Codex conversations or marketplace skill
files. Provider authorization occurs through BOS-hosted flows and the applicable
provider.

#### How information is used

Information is used to authenticate users, enforce tenant and role scope,
perform requested workflows, show results, maintain operational continuity,
prevent abuse, diagnose failures, and support customers. Information is also
used to create or update records and communicate externally when an authorized
user invokes a capability that performs those actions.

#### Connected services and disclosure

Education Operation Center can exchange data with customer-authorized systems
such as student/enrollment systems, Google services, advertising services,
email-delivery services, voice/calling services, CRM systems, and BOS services.
The exact services depend on the customer's configuration. Data is disclosed to
those services only to perform an authorized workflow, operate the service,
comply with law, or protect users and the service. The final published notice
must link a verified subprocessor list and describe each production provider.

#### Retention

The final policy must state verified retention periods for BOS identity and
authorization records, operational records, audit/security logs, cached
provider data, campaign and delivery records, call records, and support data.
Customer-source records remain subject to the customer's provider settings and
contracts. Do not publish a retention period until the production configuration
and contractual commitments have been verified.

#### Customer choices and deletion

Users can disconnect the plugin through ChatGPT or Codex and can revoke
connected-provider access through BOS or the provider. An authorized customer
administrator may request access, correction, export, or deletion of eligible
BOS-controlled data through the published privacy contact. Provider-controlled
records may require a separate request to the provider. Legal, security,
contractual, and backup obligations may limit or delay deletion; the final
policy must state the verified process and timing.

#### Children and student information

The plugin is intended for authorized adult staff and is not directed to
children. Participating education centers control whether their authorized
systems contain student or family information. The final policy and contracts
must describe the parties' responsibilities for education records, parental
rights, and applicable child-privacy requirements before the marketplace
listing makes any compliance claim.

#### Security

The service uses resource-scoped OAuth, server-resolved tenant and role
authorization, encrypted provider-credential storage, and credential-free
client packages. No service can guarantee absolute security. Security reports
must use the private channel listed on the public support or security page and
must not include live credentials or customer records.

#### Contact

Publisher: Infinite State Machines LLC

Privacy contact candidate: `cody.marcel@dfsm.ai` — verify ownership and approve
for public use.

Effective date: `[COUNSEL TO SET]`

## Terms of service draft

### Education Operation Center Terms of Service

These terms govern access to Education Operation Center, provided by Infinite
State Machines LLC. The final agreement must identify the contracting customer,
authorized users, effective date, and incorporated order form or subscription.

#### Authorized use

The service is for authorized adult personnel of participating organizations.
Users must use individual accounts, follow their organization's policies, keep
authentication methods secure, and access only organizations and data they are
authorized to use.

#### Customer responsibilities

The customer is responsible for its source-system accounts, provider
permissions, data accuracy, user administration, required notices and consents,
and review of consequential actions. The customer must ensure it has a lawful
basis to process and communicate with students, families, leads, employees, and
other individuals through the service.

#### Automated and consequential actions

Outputs can contain errors and require human judgment. Users must review
audiences, recipients, content, dates, amounts, records, and approvals before
calls, messages, campaigns, advertising uploads, or other consequential actions.
The service enforces configured permissions and workflow controls; those
controls do not replace the customer's review obligations.

#### Acceptable use

Users may not attempt unauthorized access, bypass tenant or role controls,
introduce malicious content, misuse personal information, interfere with the
service, reverse engineer protected portions of the service where prohibited,
or use the service in violation of law, provider terms, or OpenAI policies.

#### Connected services

Third-party services remain governed by their own terms, availability,
security, and data practices. The service's ability to perform a workflow can
change when a provider connection, permission, API, or customer configuration
changes.

#### Ownership and feedback

The customer retains its rights in customer data. Infinite State Machines LLC
and its licensors retain rights in the service, software, workflows, and
documentation. The final terms must state the approved license for submitted
content, customer outputs, feedback, and open-source components.

#### Fees, suspension, termination, warranties, liability, indemnity, disputes,
and governing law

Counsel must supply these provisions from the approved customer agreement and
ensure they match the marketplace listing, subscription model, and business
entity. Do not publish generic template provisions.

#### Contact

Support URL: `[APPROVED PUBLIC URL]`

Legal contact: `[COUNSEL/BUSINESS OWNER TO APPROVE]`

Effective date: `[COUNSEL TO SET]`

## Support page draft

### Education Operation Center Support

Education Operation Center support covers installation, sign-in, tenant and
role selection, provider authorization, tool discovery, workflow errors,
privacy requests, and security escalation.

Before contacting support, record the client used, approximate time, the
customer-safe error message, and the workflow attempted. Exclude passwords,
OAuth tokens, API keys, authorization headers, student/family records, and full
provider payloads.

Support contact candidate: `cody.marcel@dfsm.ai` — verify and approve.

Published service hours: `[BUSINESS OWNER TO SET]`

Published initial-response target: `[BUSINESS OWNER TO SET]`

Security reports: use a separate private channel approved by the security
owner. Include a privacy-safe reproduction and severity. Never submit live
credentials or customer records.

### Connection removal and data requests

1. Disconnect Education Operation Center in ChatGPT or Codex to remove the
   client's active connection.
2. Revoke separately connected providers through BOS or the provider when the
   provider grant should also end.
3. Ask an authorized customer administrator to submit any BOS-controlled data
   access, export, correction, or deletion request through the published
   privacy contact.
4. The support team verifies the requester and organization before acting and
   explains any provider-owned records or legal retention that remain.

Published verification method and completion target:
`[PRIVACY/SECURITY OWNER TO SET]`

## Marketplace data-handling disclosure

| Data flow | Purpose | Destination | User-visible effect |
| --- | --- | --- | --- |
| User prompt and tool parameters | Select and perform the requested workflow | OpenAI client and tenant-scoped BOS service | Produces a result or governed action |
| BOS identity and authorization context | Resolve tenant, role, application, resource, and capabilities | BOS authorization/runtime services | Limits every tool invocation |
| Student, enrollment, class, camp, lead, and instructor records | Operational search, reconciliation, planning, and reporting | Customer-authorized source systems and BOS workflow layer | Read results; authorized create/update where supported |
| Gmail, Calendar, and Drive records | Evidence search, draft/event/file workflows | Customer-authorized Google services | Read evidence or create/update private records |
| SendGrid audience, template, campaign, and event data | Prepare, approve, deliver, and reconcile email campaigns | Customer-authorized SendGrid account and BOS campaign records | Can send external email after required approvals |
| Advertising identifiers and conversions | Attribution and approved conversion upload | Customer-authorized advertising service | Can change third-party advertising records |
| Lead and phone data | Approved agent-call workflow and status | Customer-authorized calling provider and BOS call records | Can place an external call |
| Review campaign and profile data | Review outreach planning, approval, delivery, and reconciliation | Customer-authorized review, messaging, and BOS services | Can send external outreach after approvals |
| Security, audit, and error metadata | Authorization, integrity, support, and abuse prevention | BOS operational services | Supports audit and troubleshooting |

Before publication, reconcile this table with the production tool scan, public
privacy policy, subprocessor list, retention schedule, and customer contracts.
