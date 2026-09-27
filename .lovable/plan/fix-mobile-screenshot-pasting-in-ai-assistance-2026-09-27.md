# Fix mobile screenshot pasting in AI Assistance

## Goal
Allow screenshots copied from Android/Samsung keyboards, galleries, and browsers to attach reliably in the AI Assistance message box.

## Changes
- Update the chat composer to inspect both clipboard files and clipboard items, because some mobile browsers expose pasted images only as items.
- Add a safe clipboard-read fallback for mobile paste events that contain no directly exposed file.
- Keep normal text pasting unchanged and retain the existing three-image and 8 MB limits.
- Show a clear message when the mobile browser does not provide pasted image data, while keeping the attachment picker available.
- Add focused tests for direct clipboard files, item-only images, and text-only paste.
- Record the fix in the project issue history.

## Verification
- Run the focused tests and project checks.
- Test the composer at the reported portrait phone size, including attachment preview and removal.
- Confirm no upload or member data leaves the existing club-scoped AI Assistance flow.
