# BOS native shared-cache boundary

This directory is native-host implementation code. Package generation never
copies it into a BOS-family plugin, skill archive, or dependent product.

`shared-cache-host.mjs` is the only composition point. The installed BOS host
supplies the current validated identity/provider binding and its private cache
root, then injects the returned ready consumer into products. Public products
can submit only the closed `bos.shared-cache-consumer/v1` request. They cannot
construct the host, select authority/provider account, or select storage.

`document-cache.mjs` and `journey-contract-cache.mjs` implement the private
filesystem mechanics behind that boundary. They remain host implementation and
test evidence; their constructors and CLI are absent from generated clients and
published archives.
