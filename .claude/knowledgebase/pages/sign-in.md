# Sign-in and invite-only

**Area:** account · **Who uses it:** everyone · **Reached from:** the home page

## What this page is for
Lets an invited developer sign in with GitHub, and tells anyone not yet invited that PaySandbox is invite-only.

## What it shows
- The home page with the product name, a short description and a "Sign in with GitHub" button.
- For a GitHub account that is not on the allowlist: the "PaySandbox is invite-only for now" page explaining the account isn't on the list yet, with a link to request access by email.

## What the user can do
- Sign in with GitHub. An invited user lands on their projects; a first-time invited user gets an account created automatically.
- An uninvited user can request access from the invite-only page.

## Rules
- The system shall create an account only for GitHub usernames on the admin's allowlist; the admin is always allowed.
- The system shall not create any account or data for an uninvited visitor.
- The system shall send a signed-in user who opens `/dashboard` to their projects.

## Open questions
- None.

## Screenshots
![Invite-only page](../assets/screenshots/account/invite-only.png)
