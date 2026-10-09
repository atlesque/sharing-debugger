# Security

Do not publish credentials or private inspection results in issues. For a suspected vulnerability, use the repository's private security advisory reporting feature if enabled, or report it privately to its maintainer.

This application must remain behind Cloudflare Access. Keep the Worker email allowlist aligned with the Access policy and leave alternative public Worker URLs disabled. No private-network bindings should be attached to the inspection Worker.

See README.md for destination validation, resource bounds, privacy behavior, and the DNS-rebinding constraint.
