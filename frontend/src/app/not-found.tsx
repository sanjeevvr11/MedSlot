import { Compass } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        body="The page you're looking for doesn't exist or has moved."
        action={<ButtonLink href="/">Back to home</ButtonLink>}
      />
    </div>
  );
}
