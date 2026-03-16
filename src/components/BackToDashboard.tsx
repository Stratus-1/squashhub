import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function BackToDashboard({ label = "Back to Dashboard" }: { label?: string }) {
  const navigate = useNavigate();
  return (
    <div className="px-4 py-4 mt-4">
      <Button
        variant="outline"
        className="w-full h-10 text-sm"
        onClick={() => navigate("/dashboard")}
      >
        <ChevronLeft className="w-4 h-4 mr-1.5" />
        {label}
      </Button>
    </div>
  );
}
