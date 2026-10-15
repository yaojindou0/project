import { Suspense } from "react";
import { StudioWorkspace } from "@/components/StudioWorkspace";

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-5 py-16 text-sm text-muted">
          加载创作台…
        </div>
      }
    >
      <StudioWorkspace />
    </Suspense>
  );
}
