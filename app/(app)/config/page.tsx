import {
  AboutSettings, AccountSettings, AppearanceSettings, NotificationSettings, PrivacySettings,
} from "@/components/settings/SettingsSections";
import { t } from "@/lib/i18n";

/** Configurações: aparência, notificações, privacidade, conta e sobre. */
export default function ConfigPage() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-4 tablet:px-6 py-5 pb-28 tablet:pb-10 flex flex-col gap-4">
        <h1 className="font-display font-extrabold text-[22px]">{t("settings.title")}</h1>
        <AppearanceSettings />
        <NotificationSettings />
        <PrivacySettings />
        <AccountSettings />
        <AboutSettings />
      </div>
    </div>
  );
}
