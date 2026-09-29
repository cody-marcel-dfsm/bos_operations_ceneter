# Independent product dependency v1

`bos.independent-product-dependency/v1` describes a required BOS-family client
product that is installed from its own distribution. It never creates a host
connection, OAuth binding, credential lifecycle, server route, or authority.

The dependency is ready only when one enabled installed product with the exact
`name` provides every `required_skills` entry and advertises every
`required_runtime_verification_tools` entry. A missing or incomplete product
returns an explicit dependency-required result before the dependent workflow
executes. Installers never synthesize a same-marketplace selector for an
independently distributed dependency.
