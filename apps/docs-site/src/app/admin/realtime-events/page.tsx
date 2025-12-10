import { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Real-Time Events Guide",
  description:
    "Guide to the admin panel real-time event system using WebSocket and Redis pub/sub",
};

export default function RealtimeEventsPage() {
  return (
    <DocPage
      title="Real-Time Events Guide"
      description="Guide to the admin panel real-time event system using WebSocket and Redis pub/sub"
      docPaths={["admin/REALTIME_EVENTS_GUIDE.md"]}
    />
  );
}
