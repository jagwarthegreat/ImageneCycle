# Manual Android lock-screen recording checklist

1. Install/debug build with `npx cap sync android` then Android Studio run.
2. Start a ride → grant **precise** location, then **Allow all the time** (settings if prompted).
3. Confirm notification: status · distance · gain · time + Pause/Stop.
4. Lock screen 2+ minutes while moving → distance/time still advance; notification updates.
5. Shade → Pause → Resume → metrics resume.
6. Shade → Stop → app opens Save / Resume / Discard summary.
7. Save → notification clears.
8. Map puck: while recording, HDG UP; needle matches travel (use Invert Heading if opposite).
9. Auto-pause: stop &lt; 3 km/h for 3s (GPS and BLE both low) → Auto-paused; move again → resumes. Manual Pause does not auto-resume on movement.
