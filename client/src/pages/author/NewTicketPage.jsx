import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Paperclip, Send, X } from 'lucide-react';
import { api } from '../../api/client.js';
import { useFetch } from '../../api/hooks.js';
import { Alert, Card, Field, PageHeader, PageSkeleton } from '../../components/Common.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatBytes } from '../../utils/format.js';

const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.txt';
const LIMITS = { subject: 150, description: 5000 };

export default function NewTicketPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef(null);
  const { data, loading } = useFetch(() => api.get('/books'), []);

  const [form, setForm] = useState({ bookId: params.get('book') ?? 'general', subject: '', description: '' });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFiles = (list) => {
    const next = [...files];
    const problems = [];
    for (const f of list) {
      if (next.length >= MAX_FILES) { problems.push(`You can attach up to ${MAX_FILES} files.`); break; }
      if (f.size > MAX_BYTES) { problems.push(`"${f.name}" is larger than 5 MB.`); continue; }
      next.push(f);
    }
    setFiles(next);
    setErrors((e) => ({ ...e, attachments: problems.join(' ') || undefined }));
    if (fileInput.current) fileInput.current.value = '';
  };

  const validate = () => {
    const e = {};
    if (form.subject.trim().length < 3) e.subject = 'Please add a short subject (at least 3 characters).';
    if (form.description.trim().length < 10) e.description = 'Please describe your query in a bit more detail (at least 10 characters).';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e); setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set('bookId', form.bookId);
      body.set('subject', form.subject.trim());
      body.set('description', form.description.trim());
      files.forEach((f) => body.append('attachments', f));
      const ticket = await api.post('/tickets', body);
      toast.success(`Ticket ${ticket.ticketNumber} submitted. We will reply within 24-48 hours.`);
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      if (err.status === 422) setErrors(err.fieldErrors);
      else setFormError(err.message);
    } finally { setBusy(false); }
  };

  if (loading) return <PageSkeleton label="Loading…" />;
  const books = data?.items ?? [];

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Support" title="Submit a support query" subtitle="Tell us what is going on - the more detail, the faster we can help." />
      <div className="two-col">
        <Card>
          <form onSubmit={submit} noValidate>
            {formError && <Alert kind="error">{formError}</Alert>}

            <Field label="Which book is this about?" htmlFor="bookId" error={errors.bookId} hint="Choose General / Account Level for anything not tied to one book.">
              <select id="bookId" value={form.bookId} onChange={set('bookId')}>
                <option value="general">General / Account Level</option>
                {books.map((b) => <option key={b.bookId} value={b.bookId}>{b.title} ({b.isPublished ? 'Published' : b.productionStage ?? 'In production'})</option>)}
              </select>
            </Field>

            <Field label="Subject" htmlFor="subject" error={errors.subject} hint={`${form.subject.length}/${LIMITS.subject}`}>
              <input id="subject" value={form.subject} maxLength={LIMITS.subject} onChange={set('subject')} placeholder="e.g. Royalty not received for my book" />
            </Field>

            <Field label="Describe your query" htmlFor="description" error={errors.description} hint={`${form.description.length}/${LIMITS.description}`}>
              <textarea id="description" rows={8} value={form.description} maxLength={LIMITS.description} onChange={set('description')}
                placeholder="What happened, when did it start, and what would you like us to do? Include dates, platforms or amounts if relevant." />
            </Field>

            <Field label="Attachments (optional)" error={errors.attachments} hint={`Up to ${MAX_FILES} files · 5 MB each · PNG, JPG, WEBP, PDF or TXT. Photos help with print-quality issues.`}>
              <input ref={fileInput} type="file" multiple accept={ACCEPT} onChange={(e) => addFiles([...e.target.files])} aria-label="Attachments" />
              {files.length > 0 && (
                <ul className="attachments">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      <Paperclip size={14} />{f.name} <span className="muted xs">{formatBytes(f.size)}</span>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>

            <div className="form-actions">
              <Link className="btn btn-ghost" to="/tickets">Cancel</Link>
              <button className="btn btn-primary" disabled={busy}>{busy ? <><span className="spinner sm" />Submitting…</> : <><Send size={16} />Submit query</>}</button>
            </div>
          </form>
        </Card>

        <aside className="side-tips">
          <Card title="What happens next">
            <ol className="steps">
              <li>Your ticket is routed automatically to the right team.</li>
              <li>We reply here - you will see it appear without refreshing.</li>
              <li>We aim to respond within 24–48 hours, sooner for urgent issues.</li>
            </ol>
          </Card>
          <Card title="Helpful to include">
            <ul className="tips">
              <li><strong>Royalties:</strong> the book and the period you are asking about.</li>
              <li><strong>Print quality:</strong> clear photos of the affected pages.</li>
              <li><strong>Availability / ISBN:</strong> the platform and a link or screenshot.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
