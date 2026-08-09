# iCode Operations Center

This plugin supports legitimate school administration by authenticated adult
iCode staff. Students and minors are data subjects; they are never intended
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

The remote HTTPS MCP uses the client-configured `BOS_API_KEY` bearer credential
and `BOS_INSTALLED_APP_ID`. Credentials are never included in this package,
conversation content, logs, or tool arguments.

## Privacy and support

Privacy policy: https://dfsm.ai/apps/bos/privacy.html

Support and product documentation: https://dfsm.ai/apps/bos/
