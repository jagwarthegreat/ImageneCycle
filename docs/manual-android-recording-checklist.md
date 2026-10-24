# Manual Android lock-screen recording checklist

1. Install/debug build with `npx cap sync android` then Android Studio run.
2. Start a ride → grant **precise** / while-using location, confirm rationale, then on the system **Location** page choose **Allow all the time**.
3. Confirm notification: status · distance · gain · time + Pause/Stop.
4. Lock screen 2+ minutes while moving → distance/time still advance; notification updates.
5. Shade → Pause → Resume → metrics resume.
6. Shade → Stop → app opens Save / Resume / Discard summary.
7. Save → notification clears.
8. Map: north-up while recording (labels upright); puck tip points travel/facing (use Invert Heading if opposite). HDG UP is manual only.
9. Auto-pause: stop &lt; 3 km/h for 3s (GPS and BLE both low) → Auto-paused; move again → resumes. Manual Pause does not auto-resume on movement.
