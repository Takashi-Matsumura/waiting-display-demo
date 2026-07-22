import { Suspense } from "react";
import EventWorkspace from "./EventWorkspace";

export default function EventPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <Suspense fallback={null}>
        <EventWorkspace />
      </Suspense>
    </div>
  );
}
