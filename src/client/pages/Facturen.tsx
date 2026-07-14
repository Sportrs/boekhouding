import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { handleApiError } from '../App';
import type { Account, FactuurData } from '../lib/types';
import { Button, Card, PageHeader } from '../components/ui';
import BookingModal from '../components/BookingModal';
import { useToast } from '../components/Toast';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Facturen({ onUnauthorized }: { onUnauthorized: () => void }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [modal, setModal] = useState<{ initial?: Partial<FactuurData>; type: 'inkoop' | 'verkoop' } | null>(
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);

  function loadAccounts() {
    api
      .get<Account[]>('/api/accounts')
      .then(setAccounts)
      .catch((err) => toast(handleApiError(err, onUnauthorized), 'error'));
  }

  useEffect(loadAccounts, [onUnauthorized]);

  async function verwerkPdf(file: File) {
    if (file.type !== 'application/pdf') {
      return toast('Alleen PDF-bestanden worden ondersteund', 'error');
    }
    setReading(true);
    try {
      const base64 = await fileToBase64(file);
      const data = await api.post<FactuurData>('/api/invoice/read', { pdf: base64 });
      toast('Factuur uitgelezen ✓', 'success');
      setModal({ initial: data, type: 'inkoop' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Uitlezen mislukt', 'error');
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div>
      <PageHeader
        title="Facturen invoeren"
        subtitle="Upload een PDF om automatisch uit te lezen, of voer handmatig in."
        actions={
          <Button variant="ghost" onClick={() => setModal({ type: 'inkoop' })}>
            Handmatig invoeren
          </Button>
        }
      />

      <Card
        className={
          'flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-16 text-center transition-colors ' +
          (dragOver ? 'border-brand bg-brand/5' : 'border-line')
        }
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) verwerkPdf(file);
        }}
      >
        <div className="text-4xl">📄</div>
        {reading ? (
          <div className="text-brand">Factuur wordt uitgelezen door de AI…</div>
        ) : (
          <>
            <div className="text-ink">Sleep een PDF-factuur hierheen of klik om te kiezen</div>
            <div className="text-sm text-muted">De gegevens worden automatisch voorinvuld.</div>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) verwerkPdf(file);
          }}
        />
      </Card>

      {modal && (
        <BookingModal
          accounts={accounts}
          initial={modal.initial}
          initialType={modal.type}
          onClose={() => setModal(null)}
          onBooked={loadAccounts}
        />
      )}
    </div>
  );
}
