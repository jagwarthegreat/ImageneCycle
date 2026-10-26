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
10. Offline basemap: with pack installed, open map offline → lock 30s → unlock → tiles paint again (not blank).
11. Created route: climb segments colored by Cat on map; flats stay yellow.
12. Voice on (speaker): approaching climb (~1 km / 500 m / start) and turns (~200 m / 50 m); beeps still fire.
13. Weak GPS: trail continues (dim) through low signal; no distance inflate on weak points.
14. Download Maps → Install full pack once → M / N / T badges all show installed from the same zip.
