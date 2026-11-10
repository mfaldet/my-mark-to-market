# Log a hunch from your iPhone

A Shortcut that listens to you say a hunch, sends it to My Mark-to-Market, and shows the first question that would help turn it into a prediction. Anything logged this way is marked as entered by **phone**.

It takes about ten minutes to build. You only do it once.

## Before you start

1. The app must be deployed at a public address. A copy running on your laptop cannot be reached from your phone.
2. Sign in, open **API** in the menu, click **Generate**, and copy the key. It is shown only once.

Below, replace `YOUR-APP-ADDRESS` with your address and `YOUR_API_KEY` with your key.

The address and the `claimId` field say "claim" for technical reasons. A claim is the same thing as a hunch or prediction.

## Part 1: dictate and log

Open the **Shortcuts** app, tap **+**, and name the shortcut **Log a hunch**. Add these actions in order. To add one, tap the search bar at the bottom and type its name.

### 1. Dictate Text

- Leave **Language** as it is.
- Tap the arrow and set **Stop Listening** to **After Pause**.

### 2. Get Contents of URL

- **URL:** `https://YOUR-APP-ADDRESS/api/v0/claims/log`
- Tap the arrow to show more options.
- **Method:** `POST`
- **Headers:** tap **Add new header**
  - Key: `Authorization`
  - Value: `Bearer YOUR_API_KEY` (keep the word `Bearer` and the space)
- **Request Body:** `JSON`. Add two fields:
  - **Text** field. Key: `text`. Value: tap the field and choose the **Dictated Text** variable.
  - **Text** field. Key: `source`. Value: `phone`

### 3. Get Dictionary Value

- Get **Value** for `grade` in **Contents of URL**.
- Tap the result's name and rename it **Grade** (this makes it easier to pick later).

### 4. Get Dictionary Value

- Get **Value** for `id` in **Contents of URL**. (Tap the input and pick **Contents of URL** from step 2, since it will default to the previous step.)
- Rename the result **Item ID**.

### 5. Get Dictionary Value

- Get **Value** for `nextQuestion.question` in **Contents of URL**.
- Rename the result **Question**.

The dot reaches inside: it reads `question` from within `nextQuestion`.

### 6. Get Dictionary Value

- Get **Value** for `nextQuestion.suggestion.label` in **Contents of URL**.
- Rename the result **Suggestion**.

At this point you have a working shortcut that logs a hunch. Part 2 makes it show the question and take your answer.

## Part 2: show the question and answer it

### 7. If

- Set it to: **If** `Question` **has any value**.

Everything in steps 8 to 10 goes **inside** this If, above **Otherwise**.

### 8. Choose from Menu

- **Prompt:** type `Grade `, insert the **Grade** variable, type `. `, then insert the **Question** variable.
- Give it three options, named exactly:
  - `Yes` (then insert the **Suggestion** variable after it, so it reads like "Yes By Dec 31, 2028?")
  - `Answer myself`
  - `Skip`

Shortcuts now shows three empty sections, one per option. Fill them in:

### 9. Under each menu option

**Under "Yes":** add **Get Contents of URL**

- URL: `https://YOUR-APP-ADDRESS/api/v0/claims/answer`
- Method `POST`, the same `Authorization` header as step 2
- Request Body `JSON`:
  - Text. Key `claimId`. Value: **Item ID**
  - Boolean. Key `accept`. Value: **True**
  - Text. Key `source`. Value: `phone`

**Under "Answer myself":** add **Dictate Text**, then **Get Contents of URL**

- Same URL, method and header as above
- Request Body `JSON`:
  - Text. Key `claimId`. Value: **Item ID**
  - Text. Key `value`. Value: **Dictated Text** (the one from this step, not step 1)
  - Text. Key `source`. Value: `phone`

**Under "Skip":** add **Get Contents of URL**

- Same URL, method and header
- Request Body `JSON`:
  - Text. Key `claimId`. Value: **Item ID**
  - Boolean. Key `skip`. Value: **True**
  - Text. Key `source`. Value: `phone`

### 10. After the menu, still inside the If: Show Notification

- Add **Get Dictionary Value**: Value for `grade` in **Menu Result**.
- Add **Show Notification** with the text: `Logged. Grade ` followed by that value.

### 11. Under "Otherwise": Show Notification

- Text: `Logged. Grade ` followed by the **Grade** variable.

This is what you see when the engine has nothing to ask.

## Run it

- Say **"Hey Siri, log a hunch"**, or
- add it to your Home Screen: open the shortcut, tap the name at the top, then **Add to Home Screen**, or
- put it on the Action Button: **Settings → Action Button → Shortcut**.

Try: _"Unemployment will hit six percent by 2028, probably."_ You should see something like **"Grade 4. Is this the deadline you meant?"** with **"Yes By Dec 31, 2028?"** as the first choice.

## Things to know

- **The app asks up to three questions**, one at a time. This shortcut shows the first. Open the app, or ask Claude, to see the rest.
- **Dictation writes numbers its own way** ("6%" or "six percent"). Your hunch is saved exactly as dictated. If it misheard you, edit the text in the app; the edit goes into the claim's history.
- **Dates you dictate as an answer** need to be in the form `2027-12-31` for the deadline question. If that is awkward to say, choose "Yes" for the suggestion or fix the date in the app.
- **Your key is stored inside the shortcut.** Do not share the shortcut with anyone. If your phone is lost, open the API page and click **Regenerate**; the old key stops working at once.

## If something goes wrong

| What you see                               | Likely cause                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| "Missing or unknown API key"               | The header value is missing `Bearer `, or the key was regenerated                                                         |
| The menu never appears                     | Step 5's key is not exactly `nextQuestion.question`, or it was already a complete prediction and there was nothing to ask |
| "Send exactly one of: accept, value, skip" | A menu branch is sending more than one of those fields                                                                    |
| "Expected a date like 2027-12-31"          | You answered the deadline question in words. Run it again and choose "Yes"                                                |
| Nothing happens, no error                  | The address is wrong, or the app is not deployed where your phone can reach it                                            |

## What has and has not been tested

The two web requests this shortcut makes were tested against the running app with the same headers and JSON. The Shortcut itself was written from Apple's action names and has **not** been built and run on an iPhone, so a menu label or option may sit somewhere slightly different on your iOS version.
