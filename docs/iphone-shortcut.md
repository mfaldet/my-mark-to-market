# Log a prediction from your iPhone

A Shortcut that takes a prediction by voice or keyboard, lets you read it back before anything is sent, and then shows the grade the app gave it. Anything logged this way is marked as entered by **phone**.

This is the version I use on my own phone. It takes about ten minutes to build, once.

## Before you start

1. The app must be deployed at a public address. A copy running on your laptop cannot be reached from your phone.
2. Sign in, open **Claude, iPhone and scripts** in the menu, click **Generate**, and copy the key. It is shown only once.

Below, replace `YOUR-APP-ADDRESS` with your address and `YOUR_API_KEY` with your key.

The address says "claims" for technical reasons. A claim is the same thing as a prediction.

## How it works

1. A text box opens. Type, or tap the microphone on the keyboard and speak. You can fix any word before going on.
2. If the box is empty, the shortcut stops. Nothing is sent.
3. A menu shows your words with three choices: **Send**, **Redo** or **Don't send**.
4. **Send** logs the prediction and shows its grade.

## Build it

Open the **Shortcuts** app, tap **+**, and name the shortcut **Log a hunch** (the app's own entry box and button still say "hunch", and so does mine; any name works). Add these actions in order. To add one, tap the search bar at the bottom and type its name.

### 1. Ask for Input

- Ask for **Text**.
- Prompt: `What's your hunch?`

This is used in place of "Dictate Text" on purpose. Dictate Text sends whatever it heard the moment you pause, mistakes included. A text box lets you dictate with the keyboard's microphone and still correct the words first.

### 2. If

- Set it to: **If** `Provided Input` **has any value**.

Everything in steps 3 to 5 goes **inside** this If. Leave **Otherwise** empty: with no words, the shortcut simply ends and nothing is sent.

### 3. Choose from Menu

- **Prompt:** insert the **Provided Input** variable, so you see your words.
- Three options, named exactly: `Send`, `Redo`, `Don't send`.

Shortcuts now shows three empty sections, one per option.

### 4. Under "Send"

Add **Get Contents of URL**:

- **URL:** `https://YOUR-APP-ADDRESS/api/v0/claims/log`
- Tap the arrow to show more options.
- **Method:** `POST`
- **Headers:** one header only
  - Key: `Authorization`
  - Value: `Bearer YOUR_API_KEY` (keep the word `Bearer` and the space)
- **Request Body:** `JSON`, with two fields:
  - **Text** field. Key: `text`. Value: the **Provided Input** variable.
  - **Text** field. Key: `source`. Value: `phone`

> **Check for an empty header row.** If you tap "Add new header" a second time and leave it blank, the request fails with **"The network connection was lost."** That message has nothing to do with your signal. Swipe the empty row away so only `Authorization` is left.

Then add **Get Dictionary Value**:

- Get **Value** for `grade` in **Contents of URL**.

Then add **Show Notification** (or **Show Alert**):

- Text: `Logged. Grade ` followed by the **Dictionary Value** variable.

### 5. Under "Redo" and "Don't send"

- **Under "Redo":** add **Run Shortcut** and choose **Log a hunch** (this same shortcut). It starts again with an empty box.
- **Under "Don't send":** leave it empty. The shortcut ends and nothing is sent.

## Run it

- Say **"Hey Siri, log a hunch"**, or
- add it to your Home Screen: open the shortcut, tap the name at the top, then **Add to Home Screen**, or
- put it on the Action Button: **Settings → Action Button → Shortcut**.

Try: _"Unemployment will hit six percent by 2028, probably."_ Choose **Send** and you should see **"Logged. Grade"** and a number from 1 to 5.

## Things to know

- **The grade says how checkable it is.** Grades 4 and 5 are checkable; 1 to 3 are not yet. A prediction logged from the phone is usually a low grade at first. Open the app, or ask Claude, to sharpen it and give it a headline.
- **Your words are saved exactly as sent.** That is why the shortcut shows them to you first.
- **Your key is stored inside the shortcut.** Do not share the shortcut with anyone. If your phone is lost, open the same page in the app and click **Regenerate**; the old key stops working at once.

## If something goes wrong

| What you see                       | Likely cause                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| "The network connection was lost." | An empty extra header row in **Get Contents of URL**. Delete it                      |
| "Missing or unknown API key"       | The header value is missing `Bearer `, or the key was regenerated                    |
| The grade is blank                 | The request failed. Open the shortcut, run it from there and read the error it shows |
| Nothing happens after the text box | The box was empty, which is the shortcut doing its job                               |
| Nothing happens, no error          | The address is wrong, or the app is not deployed where your phone can reach it       |

## What has and has not been tested

I built this shortcut and use it on my own iPhone. It has been tried on one phone and one iOS version, so a menu label may sit somewhere slightly different on yours. The web request it makes is also covered by the app's automated tests.
