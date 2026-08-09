# Velutinous Manul — Project Workflow

This document records the collaboration rules for this project.

## Incremental development

- Break work into tiny, independently reviewable steps.
- After each meaningful step, run the relevant checks and make the result available for manual testing.
- Clearly tell the user what changed and what to test.
- Pause until the user has tested the step and explicitly approved continuing.
- If the user requests adjustments, revise the current step before starting the next one.
- Keep `docs/DEVELOPMENT_PLAN.md` current after each approved milestone and important decision.

## Design decision protocol

Every material design decision must be discussed and aligned with the user before implementation.

For each decision:

1. State the decision that needs to be made and why it matters.
2. Propose exactly three meaningfully distinct directions.
3. Describe the practical trade-offs of each direction.
4. Let the user choose one, request adjustments, or request more directions.
5. Record the decision, rejected alternatives, and any open follow-up questions in the project documentation.
6. Implement only after the direction is aligned.

The attached visual is an approximate reference. It establishes mood, composition, and visual ambition, but it does not silently decide details such as camera angle, UI layout, colors, building proportions, lighting, road markings, or asset style.

## Testing and approval

- Automated checks are useful, but they do not replace the user's manual test.
- The user is the approval gate for visual feel, interaction feel, and the decision to begin the next milestone.
- Manual test instructions should be short, concrete, and tied to the current milestone.
- A milestone is not considered approved merely because the app builds or launches.

## Git boundary

- The assistant must not stage files.
- The assistant must not commit files.
- The assistant must not push files.
- The assistant may inspect Git state and report what is ready for review.
- The user decides whether and when to stage, commit, or push.

If the user asks whether staged changes are ready to be committed or pushed, report the review status and include a proposed commit message. The assistant should not perform the commit or push unless the user separately and explicitly authorizes that action.

## File ownership and documentation

- `docs/GAME_DESIGN.md` describes the final intended game.
- `docs/DEVELOPMENT_PLAN.md` describes current implementation state and the incremental path.
- `docs/PROJECT_WORKFLOW.md` describes collaboration and Git boundaries.
- No generated or temporary files should be treated as approved game content without review.

## Current project state

The repository started empty. The first responsibility is to establish a minimal, inspectable browser/Three.js foundation. No production systems or visual asset library should be created until the first camera and scene direction has been selected and manually reviewed.

