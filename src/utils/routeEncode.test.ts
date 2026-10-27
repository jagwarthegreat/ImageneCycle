/** Self-check — run: npx tsx src/utils/routeEncode.test.ts */
import {
  getNextTurn,
  remapTurnsOntoPolyline,
  buildRoutePointsFromCoords
} from './routeEncode';
import { RoutePoint, RouteTurn } from '../types/cycling';

function makeTurn(
  partial: Partial<RouteTurn> & Pick<RouteTurn, 'index' | 'maneuverType' | 'distFromRouteStart'>
): RouteTurn {
  return {
    instruction: partial.instruction || partial.maneuverType,
    distanceMeters: partial.distanceMeters ?? 100,
    name: partial.name || '',
    modifier: partial.modifier,
    location: partial.location || { lat: 0, lng: 0 },
    ...partial
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

export function runRouteEncodeValidation(): void {
  // getNextTurn skips depart / notification
  const turns: RouteTurn[] = [
    makeTurn({
      index: 0,
      maneuverType: 'depart',
      distFromRouteStart: 0,
      distanceMeters: 50,
      instruction: 'Depart'
    }),
    makeTurn({
      index: 1,
      maneuverType: 'turn',
      modifier: 'left',
      distFromRouteStart: 50,
      distanceMeters: 200,
      instruction: 'Turn left',
      location: { lat: 10.1, lng: 122.1 }
    }),
    makeTurn({
      index: 2,
      maneuverType: 'arrive',
      distFromRouteStart: 250,
      distanceMeters: 0,
      instruction: 'Arrive',
      location: { lat: 10.2, lng: 122.2 }
    })
  ];

  const atStart = getNextTurn(turns, 0);
  assert(!!atStart, 'cue at start');
  assert(atStart!.turn.maneuverType === 'turn', `expected turn, got ${atStart!.turn.maneuverType}`);
  assert(atStart!.metersToManeuver === 50, `meters to left turn should be 50, got ${atStart!.metersToManeuver}`);

  // Just past maneuver but within epsilon — still cue the turn at 0 m
  const atManeuver = getNextTurn(turns, 55);
  assert(!!atManeuver && atManeuver.turn.maneuverType === 'turn', 'still on left turn until epsilon');
  assert(atManeuver!.metersToManeuver === 0, `at/after maneuver should be 0 m, got ${atManeuver!.metersToManeuver}`);

  // Past maneuver + epsilon — advance to arrive
  const mid = getNextTurn(turns, 65);
  assert(!!mid && mid.turn.maneuverType === 'arrive', 'advance to arrive after left turn');
  assert(mid!.metersToManeuver === 185, `meters to arrive ~185, got ${mid!.metersToManeuver}`);

  const nearEnd = getNextTurn(turns, 251);
  assert(!!nearEnd && nearEnd.turn.maneuverType === 'arrive', 'arrive cue');

  // remapTurnsOntoPolyline projects onto densified points
  const coords = [
    { lat: 10.0, lng: 122.0 },
    { lat: 10.001, lng: 122.0 },
    { lat: 10.002, lng: 122.0 }
  ];
  const points: RoutePoint[] = buildRoutePointsFromCoords(
    coords,
    coords.map(() => 10)
  );
  const rawTurns: RouteTurn[] = [
    makeTurn({
      index: 0,
      maneuverType: 'turn',
      modifier: 'right',
      distFromRouteStart: 9999,
      distanceMeters: 500,
      instruction: 'Turn right',
      location: { lat: points[1].lat, lng: points[1].lng }
    }),
    makeTurn({
      index: 1,
      maneuverType: 'arrive',
      distFromRouteStart: 20000,
      distanceMeters: 0,
      instruction: 'Arrive',
      location: { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng }
    })
  ];

  const remapped = remapTurnsOntoPolyline(rawTurns, points);
  assert(
    Math.abs(remapped[0].distFromRouteStart - points[1].distFromStart) <= 2,
    `first turn remapped near point[1] dist (${points[1].distFromStart}), got ${remapped[0].distFromRouteStart}`
  );
  assert(
    remapped[0].distanceMeters ===
      Math.max(0, remapped[1].distFromRouteStart - remapped[0].distFromRouteStart),
    'step length should match successive remapped starts'
  );

  console.log('ALL routeEncode VALIDATIONS PASSED:');
  console.log('- getNextTurn skips depart and surfaces actionable maneuvers');
  console.log('- remapTurnsOntoPolyline aligns distFromRouteStart to polyline');
}

runRouteEncodeValidation();
