# Tournament next-stage action

- Replace the passive completed-Swiss message with qualification status, the next stage name, and a primary **Generate [stage] Draw** button.
- Open the existing stage setup or qualifier-preview dialog. Initial clicks only open the dialog; existing preflight and explicit creation confirmation remain authoritative.
- Use category-specific stage readiness; show blocked/in-play/completed status rather than offer duplicate generation. Keep Swiss standings accessible.
- Move completed-round send/resend and delivery history into **Previous round notifications**. Keep ongoing-round controls unchanged.
- Remove duplicate promoted stage controls. Leave round-robin and other existing progression controls unchanged where promoting them would broaden scope.

## Technical approach
- Pass a category/stage request through tournament management and the run overview to the existing stage panel; reuse its lifecycle data and dialogs without adding queries or generation logic.
- Add focused UI tests for completed/ongoing/blocked stages and confirmation-only opening.
- Check Riverside desktop/mobile with all writes and notification calls blocked; run relevant tests and inspect preview build diagnostics. Do not publish.