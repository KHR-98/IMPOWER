import type { Zone, ZoneType } from "@/lib/types";

const EARTH_RADIUS_M = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function getDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const originLatitude = toRadians(latitudeA);
  const targetLatitude = toRadians(latitudeB);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(targetLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

export function findMatchingZone(
  zones: Zone[],
  zoneType: ZoneType,
  latitude: number,
  longitude: number,
): Zone | null {
  const candidates = zones
    .filter((zone) => zone.isActive && zone.type === zoneType)
    .map((zone) => ({
      zone,
      distance: getDistanceMeters(latitude, longitude, zone.latitude, zone.longitude),
    }))
    .filter((entry) => entry.distance <= entry.zone.radiusM)
    .sort((left, right) => left.distance - right.distance);

  return candidates[0]?.zone ?? null;
}
