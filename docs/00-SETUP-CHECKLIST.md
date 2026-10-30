# Before you build, setup checklist

Do this the night before. About thirty minutes. We want to spend the build time building, not troubleshooting.

## 1. A GitHub account, free
Why: it is where your code will live, and where you own it, rather than renting it inside Lovable.
https://github.com
Done when you can log in.

## 2. The Nova starter kit
Why: it is the thing we transform, from a fake demo into a real product. It replaces the Lovable prototype: the same help chat and agent inbox, but as code that runs on your own computer.
- Download `nova-support-copilot.zip` and unzip it somewhere easy to find, such as Documents.
- Your Lovable prototype is still useful as the picture of what the screens should look like. Keep it open for reference.
Done when you can see the `nova-support-copilot` folder with `server.js` inside.

## 3. An Anthropic API key
Why: this is the key that lets your app actually call the AI. Right now the AI in the starter is fake.
https://console.anthropic.com
- Sign in, or sign up if this is your first time.
- API Keys, Create Key, name it (for example `nova-local`), copy it. It starts with sk-ant-
- Save it somewhere private. You cannot see it again.
- Billing, add a payment method, add $5 of credit. A full build and a few eval runs cost well under a dollar.

Keep it secret. Never share it, never paste it into a chat, never let it appear in a screenshot.

Optional, for comparing vendors in Stage 3: an OpenAI key (platform.openai.com, with US$5 of credit) and a Google AI Studio key (aistudio.google.com, free tier). Same rules for every key. See [05-TEST-OTHER-MODELS.md](05-TEST-OTHER-MODELS.md).

That includes the Claude Code chat. In step 5 of the build guide you paste the key into the `.env` file yourself, in a text editor, never into a prompt.

Done when you have your sk-ant- key saved and $5 of credit added.

## 4. Claude Code, the builder
Why: this is the tool you build with. You tell it what you want in plain words and it writes the code.
https://claude.ai/download
Done when you can open it and see the Code side.

## 5. Node.js
Why: it is the player that runs your app on your computer. Your app is like a DVD and Node.js is the DVD player.
https://nodejs.org (take the LTS version)
Done when it is installed. To check, open a terminal and type `node -v`. You should see v18 or newer.

## 6. GitHub Desktop, optional but easier
Why: getting your code from your computer onto GitHub, and back, normally needs typed commands. This makes it one click.
https://desktop.github.com

## On the day, bring
- Laptop and charger
- Your Anthropic API key to hand, in a private note
- Every account already logged in: GitHub, Claude, Anthropic Console
- The unzipped starter kit folder

## Quick self check
- I can log into GitHub
- The starter kit is unzipped and I can see `server.js`
- I have my sk-ant- key saved and $5 of credit added
- The Claude desktop app is installed and I am signed in
- Node.js is installed and `node -v` shows v18 or newer

Stuck on any step? Message us before the session, not during it.
