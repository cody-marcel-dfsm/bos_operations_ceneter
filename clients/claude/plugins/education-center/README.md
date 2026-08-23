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

The remote HTTPS MCP uses OAuth 2.1 through the account-level
`education-center` Web connector under **Customize → Connectors**.
Install the plugin, add or select that account connector, select **Connect**,
and complete BOS sign-in. Private installations use the package-owned
resource URL documented in `CONNECTORS.md`; published installations use
the same resource through Anthropic's Connector Directory or organization
provisioning.
Claude stores and refreshes the resulting authorization, and the plugin never
asks the user to paste a BOS key.
The customer-facing franchise or brand name is supplied during tenant setup
and applies only to customer-facing copy and output.
Credentials are never included in this package,
conversation content, logs, or tool arguments.

## Privacy and support

Privacy policy: https://dfsm.ai/apps/bos/privacy.html

Support and product documentation: https://dfsm.ai/apps/bos/
