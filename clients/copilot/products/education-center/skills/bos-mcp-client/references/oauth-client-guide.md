# Standard BOS OAuth client guide

BOS uses standard authorization-code OAuth with required S256 PKCE. The user
signs in through canonical BOS/Google OAuth; the agent supplies no credentials,
automates no sign-in and receives no tokens or authorization codes in chat.
Native Codex, Claude, Copilot and Gemini retain their generated MCP bindings and
host-owned credential storage, callback handling and refresh. Dependent products
continue using the single BOS connection and credential-free readiness handoff.

Discover the protected-resource metadata from the signed-out MCP response's
`WWW-Authenticate` resource_metadata URL. Follow its authorization_servers to
OAuth authorization-server metadata for authorization_endpoint, token_endpoint,
registration_endpoint and code_challenge_methods_supported (`S256`). Public
`resource_documentation` and `service_documentation` identify the service-owned
[OAuth client example](https://dfsm.ai/apps/bos/oauth-client-example.html).
Before presenting the user-operated Connect action, the client onboarding owner
uses the discovered registration_endpoint to register its public OAuth client
automatically, then constructs the authorization request with the returned
client_id, registered redirect URI, private state and S256 challenge. This is
client onboarding responsibility; users supply no client ID or API key. The
user completes OAuth login, and the host validates the callback and exchanges
the code, retaining access/refresh tokens in its protected credential store.
The agent discovers services and uses the authenticated host connection; it
receives no login credentials, PKCE verifier, authorization code or tokens in
chat, model content, tool arguments or logs. Native hosts perform their existing
registration and Connect lifecycle. No custom authentication adapter is added.

Authenticated MCP initialization and service discovery also reference this guide;
private tool/context descriptions still require authentication and current access.

MCP-aware clients send `resource=https://dfsm.ai/mcp/apps/bos/platform` at
OAuth authorization and token exchange. Generic OAuth clients may omit this
standard resource parameter; BOS defaults omission specifically to BOS Platform.
An explicit resource keeps its exact audience meaning. Omission never chooses
another application's resource or widens current organization/role permissions.
PKCE remains required: generate a private high-entropy verifier, send its SHA-256
base64url challenge with code_challenge_method=S256, validate state on the callback,
and exchange the code with the original verifier and registered redirect URI.
Keep verifier/state/code/token handling inside the client's protected runtime.

Register and use a redirect URI reachable by the user's login browser and handled
by the client. A loopback callback requires browser and listener on the same
machine. Split-host clients use their existing reachable registered HTTPS or
supported custom-scheme callback; an absent callback facility is an integration
limitation. Do not invent a relay, inbound listener, temporary ingress, callback
URL or replacement authentication adapter on behalf of the user.

Run `npm run contract:check`, strict `contract:oauth-discovery-live`, optional
`contract:oauth-discovery-live -- --documentation --format json`, and the existing
`contract:oauth-live` authorize/Google-handoff check. The authorize evidence gate
accepts omitted resource only for BOS Platform and still requires S256 PKCE;
explicit resource remains supported. Public smoke discovery reads only metadata
and sanitizes documentation URLs. These checks establish discovery/login initiation,
not completed user OAuth or token/tool/context access. Retain genuine native-host
and supported client completion evidence separately before claiming acceptance.
