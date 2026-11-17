# TSSReg

An unofficial rework of UC San Diego's Triton Student System for Chrome and Firefox.

![TSSReg in the Triton Student System](./media/readme-screenshot.png)

TSS was poised as a replacement for WebReg, but as we've seen, there have been problems with it. While we can't fix the backend issues, we can make the frontend a whole lot nicer and easier to use! TSSReg brings the schedule planner back from WebReg, restructures many pages, fixes unintuitive interactions throughout, and gives course search some helpful new filters.

<u><b style="font-size: 20px;">New: Also fixes the page on Firefox!</b></u>

## Features

- A __course planner__, back from the dead! A unified place to plan your schedule, find courses that work for you, and see your conflicts before you commit to anything.
- __More Schedule of Classes filters__, and reorganization of the existing ones for easier use and a smoother class finding experience! New filters include time of day and hiding conflicting courses.
- __A Finals tab__, alongside the schedule, so you can actually see your finals schedule!
- __A completely reworked student home page__, with proper organizaiton, a more readable weekly course calendar, and notifications for events such as enrollment appointment times (with a countdown for the procrastinators!).

## Fixes

- Multi-day classes showing as if they meet once
- Missing room codes on the detail page and calendar
- Dates rendering wrongly, or throwing outright, on TSS's bad time zone names
- `tss.ucsd.edu` returning "service unavailable" when `/fiori` is missing
- Issues with the day, seat, and credits selectors in the course filters
- An expired session showing a blank or blocked sign-in frame instead of saying what went wrong
- TSN not being copyable from the identity card

## Installation

- [Chrome Web Store](https://chromewebstore.google.com/detail/tssreg/ckfdgbabfoflahhggbpcmbjbgjekoifm)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tssreg/)

## Development

Run `npm run build` with Node.js to create `dist/`.

- In Chrome, enable **Developer mode** on `chrome://extensions` and load `dist/` with **Load unpacked**. [Chrome's instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
- In Firefox 142 or later, open **This Firefox** in `about:debugging` and load `dist/manifest.json` as a temporary add-on. [Firefox's instructions](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

## Privacy

Plans and custom events stay in your browser. TSSReg sends requests only to UC San Diego’s official TSS servers and collects no telemetry. [Privacy policy](./PRIVACY.md)

TSSReg is an independent project, unaffiliated with UC San Diego.
