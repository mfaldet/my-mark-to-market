# Connect Claude

My Mark-to-Market includes an MCP server, so Claude can log your hunches, help sharpen them into predictions, and tell you what is due, in the middle of a conversation. It is hosted by the app itself at:

```
https://YOUR-APP-ADDRESS/api/mcp
```

It offers ten tools: `preview_claim`, `log_claim`, `confirm_proposal`, `edit_claim`, `withdraw_claim`, `answer_question`, `update_confidence`, `link_parent`, `list_claims` and `resolve_claim`. The tool names say "claim" for technical reasons; a claim is the same thing as a hunch or prediction, and Claude is told to say "hunch" and "prediction" to you. Everything Claude logs is recorded as entered through an **agent**, which shows on the claim and in its history.

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

**Nothing is saved until you approve it.** The server sends Claude these instructions with the tools:

- Log a hunch only when you ask, or clearly state one and want it recorded.
- Every item has two texts. Your raw words are saved unchanged underneath. On top goes a **headline**: your words rewritten by Claude into one clear, sharp sentence. The approved headline is what shows everywhere; your raw words show on the detail page and in the history as "Originally said".
- Clean aggressively, up front: write the headline, the shape, every outcome part (for an event, including a way to tell), a deadline and a suggested confidence, using precise terms even where yours were loose, and guessing sensibly at anything you left out. If your words hold several predictions, make one piece for each, each with its own headline.
- The hard rules that stay: each piece is one outcome, with no "if … then", and an event needs a way to tell.
- Call `preview_claim` first. It saves nothing; it returns how the app would grade and store the proposal.
- Show you the headline and every part in **one reply**, with the grade and whether each would be a hunch or a prediction. Ask you to approve or steer it all at once, and expect you to steer.
- Only when you approve (or approve with edits) call `log_claim`, with the version you approved. Those parts are saved as yours. Nothing Claude guessed is saved unless you said yes to it.
- The date is when you first said it, not when you approved it.
- If you say "just log it as it is", save your words alone as a hunch.
- Pass your confidence as you said it: "30%", "0.3" or a word such as "likely". For a bare number like "3", ask what you mean.
- Change the headline, outcome parts or dates later with `edit_claim` (this is also how to add a headline to an older item). Your raw words are changed only when you say they were recorded wrongly.
- Withdraw, never delete.
- Record how a prediction turned out only when you say. A hunch can't be resolved.

The app enforces the main rule itself: `log_claim` refuses a proposal that is not marked as approved, and saves nothing.

## Try it

> Log a hunch: The board won't fire the CEO, and the stock will still beat the Mag 7 average over 2027.

Claude should reply once with a preview: two proposed predictions (each with a headline, an outcome, a deadline, a way to tell and a suggested confidence), the grade each would get, and a note that nothing is saved yet. Answer in one message:

> Yes to both. 80% on the first, toss-up on the second, and make the second one price return.

Only then are they saved. Later:

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
