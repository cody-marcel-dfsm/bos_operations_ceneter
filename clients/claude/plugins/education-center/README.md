# Education Operation Center

This plugin is a childhood education franchise-in-a-box operating system for
authenticated adult education center staff. Students and minors are data subjects;
they are never intended
users or operators of this plugin.

## Data access and purpose

The plugin accesses only the tenant-scoped school records needed for a
user-requested operational task such as rosters, enrollment reconciliation,
class capacity, trial scheduling, parent or guardian communication, and
progress-report administration. BOS enforces organization, installation, role,
and capability authorization on every private operation.

The workflows require minimum-necessary disclosure, exclude unrelated family
notes and opaque identifiers, and prohibit publishing or distributing student
or family records without a separate authorized request. They do not make
admissions, disciplinary, eligibility, or other high-impact decisions about
students.

## Authentication and security

The plugin declares the immutable `education-center` remote HTTPS MCP resource
and uses Claude's host-managed OAuth 2.1 flow. Install the plugin and start
a request that uses it; Claude loads the connector and presents BOS sign-in
when required. No custom connector URL or
separate account/organization connector registration is required.
Claude stores and refreshes the resulting authorization, and the plugin never
asks the user to paste a BOS key.
The customer-facing franchise or brand name is supplied during tenant setup
and applies only to customer-facing copy and output.
Credentials are never included in this package,
conversation content, logs, or tool arguments.

## Privacy and support

Privacy policy: https://dfsm.ai/apps/bos/privacy.html

Support and product documentation: https://dfsm.ai/apps/bos/
