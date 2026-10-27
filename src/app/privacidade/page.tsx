import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <p className="text-[13.5px] text-ink-3">Nexo Assist</p>
      <h1 className="mt-2 font-display text-[40px]">Privacidade e uso de dados</h1>
      <div className="mt-6 space-y-4 text-[15.5px] leading-relaxed text-ink-2">
        <p>Um chamado só é mostrado para quem o abriu e para o analista que está na conversa dessa pessoa.</p>
        <p>A senha desta demonstração não é gravada. Qualquer senha entra para um e-mail que já existe na base.</p>
        <p>A chave do modelo, quando houver, fica só no ambiente. Ela não vai para o navegador nem para o repositório.</p>
      </div>
      <Link href="/" className="mt-8 inline-block text-primary-text">Voltar</Link>
    </main>
  );
}
