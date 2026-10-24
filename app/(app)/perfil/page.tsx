import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { AccountActions } from "./AccountActions";

export default function PerfilPage() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <ProfileEditor />
      <AccountActions />
    </div>
  );
}
