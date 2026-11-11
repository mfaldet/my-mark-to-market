# Connect Claude

My Mark-to-Market includes an MCP server, so Claude can log your hunches, help sharpen them into predictions, and tell you what is due, in the middle of a conversation. It is hosted by the app itself at:

```
https://YOUR-APP-ADDRESS/api/mcp
```

It offers nine tools: `log_claim`, `confirm_proposal`, `edit_claim`, `withdraw_claim`, `answer_question`, `update_confidence`, `link_parent`, `list_claims` and `resolve_claim`. The tool names say "claim" for technical reasons; a claim is the same thing as a hunch or prediction, and Claude is told to say "hunch" and "prediction" to you. Everything Claude logs is recorded as entered through an **agent**, which shows on the claim and in its history.

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
4. Save, then start a chat and ask Claude "what's due?".

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

- Log a hunch only when you ask, or clearly state one and want it recorded.
- Your exact words are always kept as the hunch text.
- Do the sharpening in conversation. In the same step as logging, Claude proposes the shape, the outcome, a deadline and a way to tell. If your words hold several predictions, it proposes one piece for each, linked back to what you said.
- Each piece must be one outcome: no "if … then", no "and/or", no two results joined by "and". An event needs a way to tell. Claude must not swap in a different measure from the one you named.
- Everything Claude proposes is saved as "extracted". It is not yours until you confirm it.
- Show you the whole proposal in **one reply**, with a suggested confidence, and ask you to confirm or correct it all at once. Not one field per message.
- Pass your confidence as you said it: "30%", "0.3" or a word such as "likely". For a bare number like "3", ask what you mean.
- Tell you about any flag the app raises, such as an outcome that names a measure your words did not.
- Change outcome parts or dates with `edit_claim`. Your text is changed only when you say it was recorded wrongly.
- Withdraw, never delete.
- Record how a prediction turned out only when you say. A hunch can't be resolved.
- Leave a hunch as a hunch if you want. It stays private.

## Try it

> Log a hunch: The board won't fire the CEO, and the stock will still beat the Mag 7 average over 2027.

Claude should log your words as one hunch, propose two predictions from it in a single reply (each with an outcome, a deadline, a way to tell and a suggested confidence), and ask you to confirm. Answer in one message:

> Yes to both. 80% on the first, toss-up on the second, and make the second one price return.

Later:

> Actually I'm less sure about the first one now. Make that unlikely, because the board called a special meeting.

> Withdraw the second one.

And any time:

> What's due?

## Dates and time zone

Dates follow the time zone saved on your account (the default is America/Chicago; change it in the app's account menu, top right). An entry logged at 8:30pm is dated that day, not the next. If you tell Claude you are somewhere else, it can pass a time zone for that one entry.

## What has and has not been tested

The endpoint was tested with the official MCP client library: sign-in, the tool list and the tools. It has **not** yet been tested from inside the Claude apps themselves, so the app steps above follow Anthropic's documentation and may need small adjustments.

## Troubleshooting

| What you see                       | Likely cause                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| "Missing or unknown API key"       | The key is wrong, was regenerated, or the header value is missing the word `Bearer` |
| Claude connects but shows no tools | The address is missing `/api/mcp`                                                   |
| 401 with `?key=` in the address    | `MCP_ALLOW_URL_KEY` is not set to `true` on the deployment                          |
| "Method not allowed"               | Something opened the address in a browser. It only answers MCP requests             |
