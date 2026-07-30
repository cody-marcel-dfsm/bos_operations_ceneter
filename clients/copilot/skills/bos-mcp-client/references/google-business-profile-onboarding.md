# Google Business Profile Customer Onboarding

Use this reference when a customer connects Google Business Profile, requests
Google review or reputation capabilities, completes a Google API access form,
or asks whether their organization needs its own Google Cloud project.

## Standard hosted BOS values

Give the customer these non-secret BOS integration identifiers when Google asks
for the project associated with the Google Business Profile integration:

- Google Cloud project ID: `scientific-now-473406-g7`
- Google Cloud project number: `201414430343`
- API: `Google Business Profile APIs`
- When Google presents the legacy/specific option, select:
  `My Business Account Management API`

Treat live values returned by a published BOS onboarding operation as
authoritative. If BOS production onboarding returns a replacement production
project ID or number, give the returned values instead of the static values
above.

## Customer explanation

Standard hosted BOS customers use the shared BOS Google Cloud project. They do
not create an individual Google Cloud project.

BOS is the shared OAuth application and integration platform. Each customer
connects its own Google Business Profile account through the secure BOS
authorization flow. BOS stores a separate tenant-scoped provider credential
and verified provider binding for that customer's organization.

The shared project identifiers identify BOS to Google. They do not grant access
to BOS, Google Cloud, or a customer's Business Profile and are safe to provide
on Google's onboarding or API access forms.

## Four-step customer experience

1. Give the customer the BOS project ID, project number, and API name above
   when Google requests them.
2. Ask the customer to complete the Google form or enablement step using the
   shared BOS project information.
3. Initiate the published BOS Google Business Profile setup operation and ask
   the customer to open the secure BOS URL, sign in to the Google account that
   manages the correct Business Profile, and approve the displayed scopes.
4. Verify the tenant-scoped provider identity, location access, required
   scopes, health, and capability status through BOS before reporting setup
   complete.

## Dedicated deployment exception

A separate Google Cloud project is appropriate only when the BOS deployment
contract explicitly provides independent customer OAuth branding, Google
billing/quota ownership, or compliance isolation. Never instruct a standard
hosted customer to create a project merely because their organization is a
separate BOS tenant.

## Security boundary

Never provide or request:

- OAuth client secrets;
- service-account keys;
- Google access or refresh tokens;
- BOS API keys;
- provider API keys;
- private signing material; or
- another tenant's provider account or location identifiers.

Project ID and project number are identifiers, not credentials. Provider
authorization still occurs through the secure BOS browser flow and produces
one credential scoped to the exact BOS organization, installed app, plugin,
credential name, and verified Google account.

## Capacity and operations

The shared project owns aggregate Google Business Profile API quota. BOS
operations must monitor quota and usage by tenant and request central quota
increases as adoption grows. A quota error is an operations/capacity condition,
not a reason for a customer to create a new project or reconnect credentials.
