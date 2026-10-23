import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Code2, 
  Smartphone, 
  Download, 
  Layers, 
  FileCode, 
  Activity, 
  Radio, 
  Mountain, 
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface FlutterArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FlutterArchitectureModal: React.FC<FlutterArchitectureModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'screen' | 'ble' | 'climbpro' | 'painter' | 'pubspec' | 'setup'>('screen');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const codeFiles = {
    screen: `// lib/widgets/magene_c706_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../models/cycling_metrics.dart';
import 'climb_pro_painter.dart';

/// ImageneCycle Screen Widget
/// Responsive layout for the ImageneCycle bike computer
/// Adapts seamlessly to iOS & Android screen sizes and orientations.
class ImageneCycleScreen extends StatelessWidget {
  final RideMetrics metrics;
  final ClimbProState climbState;
  final List<LatLng> routePolyline;
  final LatLng currentPosition;
  final double heading;

  const ImageneCycleScreen({
    Key? key,
    required this.metrics,
    required this.climbState,
    required this.routePolyline,
    required this.currentPosition,
    this.heading = 0.0,
  }) : super(key: key);

  String _formatDuration(int seconds) {
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    return '00:\${m.toString().padLeft(2, '0')}:\${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Container(
          color: Colors.white,
          child: Column(
            children: [
              // 1. Top Bar: Ride Duration Timer (00:02:15)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0), width: 1.5)),
                ),
                child: Center(
                  child: Text(
                    _formatDuration(metrics.timeElapsed),
                    style: const TextStyle(
                      fontFamily: 'ChakraPetch',
                      fontSize: 34,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
              ),

              // 2. Second Row: DIST.REMAIN & REM. ASCENT (2 Split Columns)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0), width: 1.5)),
                ),
                child: Row(
                  children: [
                    // Left Column: DIST.REMAIN
                    Expanded(
                      child: Column(
                        children: [
                          const Text(
                            'DIST.REMAIN',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF94A3B8),
                              letterSpacing: 0.8,
                            ),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(
                                (climbState.distRemainingToTop / 1000).toStringAsFixed(2),
                                style: const TextStyle(
                                  fontFamily: 'ChakraPetch',
                                  fontSize: 26,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(width: 2),
                              const Text(
                                'km',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Container(width: 1.5, height: 42, color: const Color(0xFFE2E8F0)),
                    // Right Column: REM. ASCENT
                    Expanded(
                      child: Column(
                        children: [
                          const Text(
                            'REM. ASCENT',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF94A3B8),
                              letterSpacing: 0.8,
                            ),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(
                                climbState.remAscent.round().toString(),
                                style: const TextStyle(
                                  fontFamily: 'ChakraPetch',
                                  fontSize: 26,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                              const SizedBox(width: 2),
                              const Text(
                                'm',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // 3. Middle Section: Map with Navigation Track, Puck & Compass
              Expanded(
                flex: 4,
                child: Stack(
                  children: [
                    FlutterMap(
                      options: MapOptions(
                        center: currentPosition,
                        zoom: 16.0,
                        interactiveFlags: InteractiveFlag.all,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                          subdomains: const ['a', 'b', 'c', 'd'],
                        ),
                        PolylineLayer(
                          polylines: [
                            Polyline(
                              points: routePolyline,
                              strokeWidth: 5.5,
                              color: const Color(0xFFEAB308),
                            ),
                          ],
                        ),
                        MarkerLayer(
                          markers: [
                            Marker(
                              point: currentPosition,
                              width: 32,
                              height: 32,
                              builder: (ctx) => Transform.rotate(
                                angle: (heading * 3.14159 / 180),
                                child: Container(
                                  decoration: const BoxDecoration(
                                    color: Colors.white,
                                    shape: BoxShape.circle,
                                    boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)],
                                  ),
                                  child: const Icon(
                                    Icons.navigation,
                                    color: Color(0xFF2563EB),
                                    size: 20,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    // Street name label
                    Positioned(
                      top: 8,
                      left: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.85),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text('via Arsicana', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500)),
                      ),
                    ),
                    // Scale indicator
                    const Positioned(
                      bottom: 8,
                      left: 10,
                      child: Text('200m |---|', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                    // Compass
                    Positioned(
                      top: 40,
                      right: 10,
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(
                          color: Color(0xCC1E293B),
                          shape: BoxShape.circle,
                        ),
                        child: const Center(
                          child: Icon(Icons.explore, color: Colors.white, size: 24),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // 4. ClimbPro Real-Time Elevation Profile & Gradient Bands
              Expanded(
                flex: 3,
                child: Column(
                  children: [
                    Expanded(
                      child: CustomPaint(
                        painter: ClimbProPainter(
                          climb: climbState.currentClimb,
                          currentDist: metrics.distanceTraveled,
                          currentGrade: metrics.currentGrade,
                        ),
                        size: Size.infinite,
                      ),
                    ),
                    // AVG GRADE REMAIN. Footer
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        border: Border(
                          top: BorderSide(color: Color(0xFFE2E8F0)),
                          bottom: BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'AVG GRADE REMAIN.',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                          Text(
                            '\${climbState.avgGradeRemaining.toStringAsFixed(1)}%',
                            style: const TextStyle(
                              fontFamily: 'ChakraPetch',
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // 5. Bottom Row: ELEVATION m & SPEED km/h
              Container(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Color(0xFFE2E8F0), width: 1.5)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        children: [
                          const Text('ELEVATION m', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
                          Text(
                            metrics.currentElevation.round().toString(),
                            style: const TextStyle(
                              fontFamily: 'ChakraPetch',
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(width: 1.5, height: 48, color: const Color(0xFFE2E8F0)),
                    Expanded(
                      child: Column(
                        children: [
                          const Text('SPEED km/h', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
                          Text(
                            metrics.speed.toStringAsFixed(1),
                            style: const TextStyle(
                              fontFamily: 'ChakraPetch',
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          Container(width: 48, height: 4, decoration: BoxDecoration(color: const Color(0xFF2563EB), borderRadius: BorderRadius.circular(2))),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}`,

    ble: `// lib/services/ble_service.dart
import 'dart:async';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// Standard Bluetooth SIG Cycling GATT Service UUIDs
class CyclingBleUuids {
  static final Guid heartRateService = Guid('180D');
  static final Guid heartRateMeasurement = Guid('2A37');

  static final Guid cyclingSpeedCadenceService = Guid('1816');
  static final Guid cscMeasurement = Guid('2A5B');

  static final Guid cyclingPowerService = Guid('1818');
  static final Guid powerMeasurement = Guid('2A63');

  static final Guid batteryService = Guid('180F');
  static final Guid batteryLevel = Guid('2A19');
}

/// Real-Time BLE Cycling Hardware Service
class BleService {
  final _heartRateController = StreamController<int>.broadcast();
  final _cadenceController = StreamController<int>.broadcast();
  final _speedController = StreamController<double>.broadcast();
  final _powerController = StreamController<int>.broadcast();

  Stream<int> get heartRateStream => _heartRateController.stream;
  Stream<int> get cadenceStream => _cadenceController.stream;
  Stream<double> get speedStream => _speedController.stream;
  Stream<int> get powerStream => _powerController.stream;

  int? _prevCrankRevs;
  int? _prevCrankTime;
  int? _prevWheelRevs;
  int? _prevWheelTime;
  final double wheelCircumferenceMeters = 2.105; // 700x25c road wheel

  /// Scan for cycling sensors advertising standard GATT services
  Future<void> scanAndConnectCyclingSensors() async {
    FlutterBluePlus.scanResults.listen((results) async {
      for (ScanResult r in results) {
        final uuids = r.advertisementData.serviceUuids;
        if (uuids.contains(CyclingBleUuids.heartRateService) ||
            uuids.contains(CyclingBleUuids.cyclingSpeedCadenceService) ||
            uuids.contains(CyclingBleUuids.cyclingPowerService)) {
          await FlutterBluePlus.stopScan();
          await _connectAndSubscribe(r.device);
        }
      }
    });

    await FlutterBluePlus.startScan(
      withServices: [
        CyclingBleUuids.heartRateService,
        CyclingBleUuids.cyclingSpeedCadenceService,
        CyclingBleUuids.cyclingPowerService,
      ],
      timeout: const Duration(seconds: 15),
    );
  }

  Future<void> _connectAndSubscribe(BluetoothDevice device) async {
    await device.connect(autoConnect: true);
    List<BluetoothService> services = await device.discoverServices();

    for (var service in services) {
      // 1. Heart Rate Monitor (0x180D)
      if (service.uuid == CyclingBleUuids.heartRateService) {
        for (var char in service.characteristics) {
          if (char.uuid == CyclingBleUuids.heartRateMeasurement) {
            await char.setNotifyValue(true);
            char.lastValueStream.listen(_parseHeartRate);
          }
        }
      }

      // 2. Cycling Speed & Cadence (0x1816)
      if (service.uuid == CyclingBleUuids.cyclingSpeedCadenceService) {
        for (var char in service.characteristics) {
          if (char.uuid == CyclingBleUuids.cscMeasurement) {
            await char.setNotifyValue(true);
            char.lastValueStream.listen(_parseCscMeasurement);
          }
        }
      }

      // 3. Cycling Power Meter (0x1818)
      if (service.uuid == CyclingBleUuids.cyclingPowerService) {
        for (var char in service.characteristics) {
          if (char.uuid == CyclingBleUuids.powerMeasurement) {
            await char.setNotifyValue(true);
            char.lastValueStream.listen(_parsePowerMeasurement);
          }
        }
      }
    }
  }

  void _parseHeartRate(List<int> data) {
    if (data.isEmpty) return;
    int flags = data[0];
    bool is16Bit = (flags & 0x01) != 0;
    int hr = is16Bit ? (data[1] | (data[2] << 8)) : data[1];
    _heartRateController.add(hr);
  }

  void _parseCscMeasurement(List<int> data) {
    if (data.isEmpty) return;
    int flags = data[0];
    int offset = 1;

    // Wheel Revolution Data Present (bit 0)
    if ((flags & 0x01) != 0 && data.length >= offset + 6) {
      int wheelRevs = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
      offset += 4;
      int wheelTime = data[offset] | (data[offset + 1] << 8); // 1/1024 s
      offset += 2;

      if (_prevWheelRevs != null && _prevWheelTime != null) {
        int dRevs = wheelRevs - _prevWheelRevs!;
        double dTime = (wheelTime - _prevWheelTime!) / 1024.0;
        if (dTime < 0) dTime += 65536.0 / 1024.0; // Rollover
        if (dTime > 0 && dRevs >= 0) {
          double speedKmh = (dRevs * wheelCircumferenceMeters / dTime) * 3.6;
          _speedController.add(speedKmh);
        }
      }
      _prevWheelRevs = wheelRevs;
      _prevWheelTime = wheelTime;
    }

    // Crank Revolution Data Present (bit 1)
    if ((flags & 0x02) != 0 && data.length >= offset + 4) {
      int crankRevs = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      int crankTime = data[offset] | (data[offset + 1] << 8); // 1/1024 s

      if (_prevCrankRevs != null && _prevCrankTime != null) {
        int dRevs = crankRevs - _prevCrankRevs!;
        double dTime = (crankTime - _prevCrankTime!) / 1024.0;
        if (dTime < 0) dTime += 65536.0 / 1024.0;
        if (dTime > 0 && dRevs >= 0) {
          int cadenceRpm = ((dRevs / dTime) * 60).round();
          _cadenceController.add(cadenceRpm);
        }
      }
      _prevCrankRevs = crankRevs;
      _prevCrankTime = crankTime;
    }
  }

  void _parsePowerMeasurement(List<int> data) {
    if (data.length < 4) return;
    // Bytes 2 and 3: Instantaneous Power in Watts (SINT16)
    int power = data[2] | (data[3] << 8);
    if (power > 32767) power -= 65536;
    _powerController.add(power.clamp(0, 2500));
  }

  void dispose() {
    _heartRateController.close();
    _cadenceController.close();
    _speedController.close();
    _powerController.close();
  }
}`,

    climbpro: `// lib/services/climb_pro_service.dart
import 'dart:math';
import '../models/cycling_metrics.dart';

class ClimbProService {
  /// Detects climbs from route point elevations
  List<ClimbSegment> detectClimbs(List<RoutePoint> points) {
    List<ClimbSegment> climbs = [];
    int climbStartIdx = -1;

    for (int i = 1; i < points.length; i++) {
      final prev = points[i - 1];
      final curr = points[i];
      final dDist = curr.distFromStart - prev.distFromStart;
      final dEle = curr.ele - prev.ele;
      final grade = dDist > 0 ? (dEle / dDist) * 100 : 0.0;

      if (climbStartIdx == -1 && grade >= 2.5) {
        climbStartIdx = i - 1;
      } else if (climbStartIdx != -1) {
        bool isDescent = grade < -2.0 && (i > climbStartIdx + 5);
        bool isRouteEnd = i == points.length - 1;

        if (isDescent || isRouteEnd) {
          final startPt = points[climbStartIdx];
          final endPt = isRouteEnd ? curr : points[i - 1];
          final length = endPt.distFromStart - startPt.distFromStart;
          final gain = max(0.0, endPt.ele - startPt.ele);
          final avgGrade = length > 0 ? (gain / length) * 100 : 0.0;

          if (length >= 400 && gain >= 25 && avgGrade >= 2.8) {
            climbs.add(ClimbSegment(
              id: 'climb-\${climbs.length + 1}',
              name: 'Climb \${climbs.length + 1}',
              startDist: startPt.distFromStart,
              endDist: endPt.distFromStart,
              totalLength: length,
              startEle: startPt.ele,
              topEle: endPt.ele,
              totalGain: gain,
              avgGrade: avgGrade,
              points: points.sublist(climbStartIdx, i),
            ));
          }
          climbStartIdx = -1;
        }
      }
    }
    return climbs;
  }

  /// Calculates real-time distance remaining, remaining ascent, and remaining average grade
  ClimbProState computeLiveState(double currentDist, double currentElevation, List<ClimbSegment> climbs) {
    for (int i = 0; i < climbs.length; i++) {
      final c = climbs[i];
      if (currentDist >= c.startDist && currentDist <= c.endDist) {
        final distRemain = max(0.0, c.endDist - currentDist);
        final remAscent = max(0.0, c.topEle - currentElevation);
        final avgGradeRemain = distRemain > 0 ? (remAscent / distRemain) * 100 : 0.0;

        return ClimbProState(
          isInClimb: true,
          currentClimbIndex: i + 1,
          totalClimbsCount: climbs.length,
          currentClimb: c,
          distRemainingToTop: distRemain,
          remAscent: remAscent,
          avgGradeRemaining: avgGradeRemain,
        );
      }
    }
    return ClimbProState.empty();
  }
}`,

    painter: `// lib/widgets/climb_pro_painter.dart
import 'package:flutter/material.dart';
import '../models/cycling_metrics.dart';

/// 60fps High-Performance CustomPainter for ClimbPro Elevation Graph
class ClimbProPainter extends CustomPainter {
  final ClimbSegment? climb;
  final double currentDist;
  final double currentGrade;

  ClimbProPainter({
    required this.climb,
    required this.currentDist,
    required this.currentGrade,
  });

  Color _getGradeColor(double grade) {
    if (grade < 3.0) return const Color(0xFF22C55E); // Green
    if (grade < 6.0) return const Color(0xFFEAB308); // Yellow
    if (grade < 9.0) return const Color(0xFFF97316); // Orange
    if (grade < 12.0) return const Color(0xFFEF4444); // Red
    return const Color(0xFFC026D3); // Purple / Wall
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (climb == null || climb!.points.isEmpty) return;

    final pts = climb!.points;
    final climbStart = climb!.startDist;
    final climbLength = climb!.totalLength;
    final double chartBottom = size.height - 14.0;
    final double chartTop = 18.0;
    final double chartHeight = chartBottom - chartTop;

    double minEle = pts.map((p) => p.ele).reduce((a, b) => a < b ? a : b);
    double maxEle = pts.map((p) => p.ele).reduce((a, b) => a > b ? a : b);
    double eleSpan = (maxEle - minEle).clamp(10.0, 5000.0);

    // Draw Colored Gradient Polygons
    final int step = (pts.length / 28).ceil().clamp(1, 10);
    for (int i = 0; i < pts.length - 1; i += step) {
      final p1 = pts[i];
      final p2 = pts[(i + step).clamp(0, pts.length - 1)];

      final x1 = ((p1.distFromStart - climbStart) / climbLength) * size.width;
      final x2 = ((p2.distFromStart - climbStart) / climbLength) * size.width;

      final y1 = chartBottom - ((p1.ele - minEle) / eleSpan) * chartHeight;
      final y2 = chartBottom - ((p2.ele - minEle) / eleSpan) * chartHeight;

      final grade = (p2.distFromStart - p1.distFromStart) > 0
          ? ((p2.ele - p1.ele) / (p2.distFromStart - p1.distFromStart)) * 100
          : 0.0;

      final paint = Paint()
        ..color = _getGradeColor(grade)
        ..style = PaintingStyle.fill;

      final path = Path()
        ..moveTo(x1, chartBottom)
        ..lineTo(x1, y1)
        ..lineTo(x2, y2)
        ..lineTo(x2, chartBottom)
        ..close();

      canvas.drawPath(path, paint);
    }

    // Draw Rider Pin & Real-Time Grade Pill
    final double progress = ((currentDist - climbStart) / climbLength).clamp(0.0, 1.0);
    final double riderX = progress * size.width;

    // Pin line
    final linePaint = Paint()
      ..color = const Color(0xFF2563EB)
      ..strokeWidth = 2.0;
    canvas.drawLine(Offset(riderX, chartTop - 4), Offset(riderX, chartBottom), linePaint);

    // Progress Bar Track with chevron marker ▶
    final trackPaint = Paint()..color = const Color(0xFFDBEAFE);
    canvas.drawRect(Rect.fromLTWH(0, chartBottom, size.width, 10), trackPaint);

    final progressPaint = Paint()..color = const Color(0xFF2563EB);
    canvas.drawRect(Rect.fromLTWH(0, chartBottom, riderX, 10), progressPaint);
  }

  @override
  bool shouldRepaint(covariant ClimbProPainter oldDelegate) {
    return oldDelegate.currentDist != currentDist || oldDelegate.currentGrade != currentGrade;
  }
}`,

    pubspec: `# pubspec.yaml
name: magene_c706_flutter
description: ImageneCycle Bike Computer with ClimbPro and BLE Integration
version: 1.0.0+1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  flutter_blue_plus: ^1.34.0   # Cross-platform Bluetooth Low Energy (iOS & Android)
  flutter_map: ^6.1.0          # High-performance OpenStreetMap vector map tiles
  latlong2: ^0.9.0             # GPS Coordinate math & geodesic distance
  provider: ^6.1.2             # State management for live metrics streams
  geolocator: ^11.0.0          # Native device GPS sensor integration
  shared_preferences: ^2.2.2   # Offline ride route persistence

flutter:
  uses-material-design: true
  fonts:
    - family: ChakraPetch
      fonts:
        - asset: fonts/ChakraPetch-Bold.ttf
          weight: 700`,

    setup: `// Native Platform Permissions Setup

// 1. Android Configuration (android/app/src/main/AndroidManifest.xml):
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Bluetooth Low Energy Permissions for Android 12+ -->
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

    <!-- GPS Location for outdoor rides & ClimbPro positioning -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
</manifest>

// 2. iOS Configuration (ios/Runner/Info.plist):
<dict>
    <!-- CoreBluetooth Permissions -->
    <key>NSBluetoothAlwaysUsageDescription</key>
    <string>ImageneCycle requires Bluetooth to connect to Heart Rate, Cadence, and Cycling Power meters.</string>
    <key>NSBluetoothPeripheralUsageDescription</key>
    <string>Connect to cycling sensors during rides.</string>

    <!-- CoreLocation Permissions -->
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>ImageneCycle requires GPS to track route positioning and ClimbPro elevation profiles.</string>
    <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
    <string>Continuous ride GPS tracking when phone is mounted or screen locked.</string>
</dict>`
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-zinc-800/80 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-sports tracking-wide">
                  FLUTTER CROSS-PLATFORM CODE EXPORTER
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  iOS & Android Ready
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Production-ready Flutter widgets, 60fps CustomPainters, and BLE GATT streaming
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-4 bg-zinc-850 border-b border-zinc-750 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('screen')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'screen'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            magene_c706_screen.dart
          </button>

          <button
            onClick={() => setActiveTab('ble')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'ble'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            ble_service.dart
          </button>

          <button
            onClick={() => setActiveTab('climbpro')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'climbpro'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Mountain className="w-3.5 h-3.5" />
            climb_pro_service.dart
          </button>

          <button
            onClick={() => setActiveTab('painter')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'painter'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            climb_pro_painter.dart
          </button>

          <button
            onClick={() => setActiveTab('pubspec')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'pubspec'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            pubspec.yaml
          </button>

          <button
            onClick={() => setActiveTab('setup')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'setup'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            iOS / Android Setup
          </button>
        </div>

        {/* Code Content Box */}
        <div className="relative flex-1 p-4 bg-zinc-950 overflow-y-auto">
          <div className="absolute top-6 right-6 z-10 flex gap-2">
            <button
              onClick={() => handleCopy(codeFiles[activeTab], activeTab)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md border border-zinc-700 transition-colors"
            >
              {copiedKey === activeTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <pre className="font-mono text-[12px] text-zinc-300 leading-relaxed overflow-x-auto p-2">
            <code>{codeFiles[activeTab]}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-850 border-t border-zinc-700 flex items-center justify-between text-xs text-zinc-400">
          <div>
            Built with <span className="text-blue-400 font-semibold">Flutter Blue Plus</span> &{' '}
            <span className="text-blue-400 font-semibold">FlutterMap</span> for high-performance 60fps rendering
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors shadow-sm"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
