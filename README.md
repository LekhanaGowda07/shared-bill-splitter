## Decisions

1. **Used Cloudflare D1 (SQLite) for data storage:** Chose D1 because it provides persistent relational storage and supports relationships between homes, members, bills, and shares using foreign keys.

2. **Stored monetary values as integer cents:** Instead of using floating-point numbers, all bill amounts and shares are stored in cents. This avoids rounding errors and ensures that the total of all member shares exactly matches the original bill amount.

3. **Used idempotency keys for payments:** Added an `Idempotency-Key` header when marking a share as paid. This prevents duplicate payment processing when the same request is retried and handles concurrent payment requests safely.
