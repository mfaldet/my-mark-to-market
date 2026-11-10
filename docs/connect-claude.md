# Connect Claude

My Mark-to-Market includes an MCP server, so Claude can log and update your claims in the middle of a conversation. It is hosted by the app itself at:

```
https://YOUR-APP-ADDRESS/api/mcp
```

It offers six tools: `log_claim`, `answer_question`, `update_confidence`, `link_parent`, `list_claims` and `resolve_claim`. Everything Claude logs is recorded as entered through an **agent**, which shows on the claim and in its history.

## Before you start

1. Deploy the app and sign in.
2. Open **API** in the menu (`/api-setup`) and click **Generate**. Copy the key; it is shown only once.

In the steps below, replace `YOUR-APP-ADDRESS` with your address and `YOUR_API_KEY` with that key.

## Claude Code

```bash
claude mcp add --transport http my-mark-to-market https://YOUR-APP-ADDRESS/api/mcp --header "Authorization: Bearer YOUR_API_KEY"
```

Then run `/mcp` inside Claude Code to check that it connected. Adding a server does not test the key.

To use a copy running on your own machine, use `http://localhost:3000/api/mcp` as the address.

## Claude on the web, desktop and phone

Custom connectors are added once, on the web or desktop app, and are then available in the phone app.

1. In Claude, open **Settings → Connectors → Add custom connector**.
2. Enter a name and the address `https://YOUR-APP-ADDRESS/api/mcp`.
3. For sign-in choose **No sign-in**, and under **Request headers** add:
   - name: `authorization`
   - value: `Bearer YOUR_API_KEY` (include the word `Bearer`)
4. Save, then start a chat and ask Claude to "list my claims".

### If your account has no "Request headers" field

At the time of writing, request headers on custom connectors are in beta and not on every account. If yours does not show the field, there is a fallback: let the key travel in the address.

1. Set the environment variable `MCP_ALLOW_URL_KEY=true` on your deployment and redeploy.
2. Use this as the connector address, with sign-in set to **No sign-in**:

```
https://YOUR-APP-ADDRESS/api/mcp?key=YOUR_API_KEY
```

**Know the trade-off.** A key in an address can end up in server logs and in anything that records addresses. That is why this is off by default. If you use it, treat the address itself as the secret, and regenerate your key on the API page if it is ever exposed. The proper fix is OAuth sign-in, which this server does not implement yet.

## How Claude is told to behave

The server sends Claude these instructions with the tools:

- Log a claim only when you ask, or clearly state a prediction and want it recorded.
- Pass your claim in your own words, exactly as you said it, without tidying or completing it.
- After logging, ask you the app's one question (with its suggested default) and wait for your reply, not answer it itself.
- Treat grades 1 to 3 as fine. They are hunches and stay private.

## Try it

> Log this claim: unemployment will hit 6% by 2028, probably.

Claude should reply with the grade and the app's question, something like "By Dec 31, 2028?". Answer it, then:

> Actually I'm less sure now. Make that unlikely, because the jobs report came in strong.

## What has and has not been tested

The endpoint was tested with the official MCP client library: sign-in, the tool list and all six tools. It has **not** yet been tested from inside the Claude apps themselves, so the app steps above follow Anthropic's documentation and may need small adjustments.

## Troubleshooting

| What you see                       | Likely cause                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| "Missing or unknown API key"       | The key is wrong, was regenerated, or the header value is missing the word `Bearer` |
| Claude connects but shows no tools | The address is missing `/api/mcp`                                                   |
| 401 with `?key=` in the address    | `MCP_ALLOW_URL_KEY` is not set to `true` on the deployment                          |
| "Method not allowed"               | Something opened the address in a browser. It only answers MCP requests             |
