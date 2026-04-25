import type { AgentRecommendationItem } from "./api";
import type { Exhibition } from "@/data/mock";
import {
  addItemToTripList,
  agentRecommendationToExhibition,
  createTripList,
  getTripListById,
  getTripLists,
} from "./tripLists";

export type RecommendationList = {
  id: string;
  name: string;
  createdAt: string;
  eventIds: string[];
  events: AgentRecommendationItem[];
};

/** @deprecated Use trip lists via `getTripLists` from `@/lib/tripLists`. */
export function getRecommendationLists(): RecommendationList[] {
  return getTripLists().map((list) => ({
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    eventIds: list.items.filter((i) => i.kind === "event").map((i) => i.payload.id),
    events: list.items
      .filter((i): i is { kind: "event"; payload: Exhibition } => i.kind === "event")
      .map((i) => ({
        id: i.payload.id,
        title: i.payload.title,
        dateStr: i.payload.dateStr,
        location: i.payload.location,
        imageUrl: i.payload.imageUrl,
      })),
  }));
}

export function saveRecommendationList(name: string, events: AgentRecommendationItem[]): RecommendationList {
  const list = createTripList(name);
  for (const event of events) {
    addItemToTripList(list.id, {
      kind: "event",
      payload: agentRecommendationToExhibition(event),
    });
  }
  const updated = getTripListById(list.id)!;
  return {
    id: updated.id,
    name: updated.name,
    createdAt: updated.createdAt,
    eventIds: events.map((e) => e.id),
    events,
  };
}
