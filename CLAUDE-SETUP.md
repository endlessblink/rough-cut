# Optional Claude graphics

Install the official Claude Code CLI separately and sign in through its own login flow with a Claude plan that includes Claude Code. Rough Cut requires CLI 2.1.248 or newer and verifies the official subscription route. `claude auth status` is a local connection check; do not share its account fields or credentials.

In Graphics, use Check connection. A missing CLI, unsupported route or missing subscription is explained there. The app rejects API-key, token/base-URL and alternate cloud billing-route overrides. Normal recording/editing does not need Claude. The app does not install Claude, store passwords or make a generation request during connection checking.

When you request a graphic, your text and the selected design context go to Claude through that CLI. Requests/answers are kept locally for diagnostics; plan limits apply. Review the selected context before generating.

Official setup: https://code.claude.com/docs/en/setup . Authentication: https://code.claude.com/docs/en/authentication .
