import fs from 'fs';

const p = 'src/App.tsx';
let s = fs.readFileSync(p, 'utf8');
const a = s.indexOf('      {/* DISCREET SLIDE-OVER MENU DRAWER');
const b = s.indexOf('      {/* Sensor Pairing, Manual Climb');
if (a < 0 || b < 0) throw new Error(`bounds not found a=${a} b=${b}`);

const insert = `      <MenuSheet
        open={isMenuDrawerOpen}
        onOpenChange={setIsMenuDrawerOpen}
        activeRoute={activeRoute}
        routes={routes}
        selectedRouteId={selectedRouteId}
        rideHistory={rideHistory}
        activeSession={activeSession}
        isPaused={isPaused}
        ridingTime={ridingTime}
        saddleTime={saddleTime}
        timeElapsed={timeElapsed}
        distanceTraveled={distanceTraveled}
        gpsStatus={gpsStatus}
        currentCoords={currentCoords}
        autoCenter={autoCenter}
        invertHeading={invertHeading}
        autoLapDistance={autoLapDistance}
        batterySaver={batterySaver}
        ftp={ftp}
        maxHeartRate={maxHeartRate}
        restingHeartRate={restingHeartRate}
        metrics={metrics}
        historyExportNotice={historyExportNotice}
        historyMapRideId={historyMapRideId}
        isOnline={isOnline}
        stravaConnected={stravaConnected}
        onActivateRoute={activateRouteAsCurrentRide}
        onClearRoute={handleClearRoute}
        onOpenRouteBuilder={() => setIsRouteBuilderOpen(true)}
        onUseSavedRoute={handleUseSavedRoute}
        onDeleteSavedRoute={handleDeleteSavedRoute}
        onLocateMe={handleLocateMe}
        onOpenSensors={() => setIsSensorModalOpen(true)}
        onOpenClimbModal={() => setIsClimbModalOpen(true)}
        onFileUpload={handleFileUpload}
        onToggleAutoCenter={handleToggleAutoCenter}
        onToggleInvertHeading={handleToggleInvertHeading}
        onSetAutoLapDistance={handleSetAutoLapDistance}
        onStopActivity={handleStopActivity}
        onClearAllHistory={handleClearAllHistory}
        onDeleteHistoryItem={handleDeleteHistoryItem}
        onSetHistoryMapRideId={setHistoryMapRideId}
        onSetHistoryExportNotice={setHistoryExportNotice}
        onSaveFtp={handleSaveFtp}
        onSaveMaxHr={handleSaveMaxHr}
        onSaveRestingHr={handleSaveRestingHr}
        onToggleBatterySaver={handleToggleBatterySaver}
        onOpenDownloadMaps={() => setIsDownloadMapsOpen(true)}
        onOpenMapsStorage={() => setIsMapsStorageOpen(true)}
        onResetRide={handleResetRide}
        onStravaConnectedChange={setStravaConnected}
      />

`;

s = s.slice(0, a) + insert + s.slice(b);

if (!s.includes("from './components/MenuSheet'")) {
  s = s.replace(
    "import { MageneDevice } from './components/MageneDevice';",
    "import { MageneDevice } from './components/MageneDevice';\nimport { MenuSheet } from './components/MenuSheet';"
  );
}

s = s.replace(/const \[drawerTab, setDrawerTab\][^\n]*\n/, '');

fs.writeFileSync(p, s);
console.log('wired MenuSheet into App.tsx');
