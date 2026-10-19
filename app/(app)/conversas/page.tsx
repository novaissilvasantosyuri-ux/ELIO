import { ElioMark } from "@/components/brand";
import { t } from "@/lib/i18n";

/** Detalhe vazio (desktop): convite para escolher uma conversa. */
export default function ConversasIndex() {
  return (
    <div className="flex-1 min-h-0 hidden tablet:flex flex-col items-center justify-center text-center p-8 bg-surface tablet:rounded-3xl tablet:m-3 tablet:ml-0">
      <ElioMark size={72} />
      <h2 className="font-display font-extrabold text-2xl mt-4">{t("conversations.selectChat")}</h2>
      <p className="text-muted mt-2 max-w-xs">{t("conversations.selectChatDesc")}</p>
    </div>
  );
}
