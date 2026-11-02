import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { api } from '../../api/client.js';
import { useFetch } from '../../api/hooks.js';
import { useMeta } from '../../api/meta.js';
import { Alert, EmptyState, ErrorState, PageHeader, PageSkeleton } from '../../components/Common.jsx';
import { formatDate, inr } from '../../utils/format.js';

const MIN_PAYOUT = 1000;

/** Horizontal production tracker. It never wraps: below ~460px of card width it becomes a vertical list (container query). */
function ProductionProgress({ book, stages }) {
  const idx = book.productionStageIndex;
  const steps = stages.slice(0, -1);
  return (
    <div className="progress" aria-label={`Production progress: ${book.productionStage}`}>
      <ol className="stages" style={{ '--n': steps.length }}>
        {steps.map((s, i) => (
          <li key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''} aria-current={i === idx ? 'step' : undefined}><span className="pip" /><span className="stage-name">{s}</span></li>
        ))}
      </ol>
      <p className="muted small">Currently in <strong>{book.productionStage ?? book.status}</strong>. We email you at every stage. Royalties start once the book is live.</p>
    </div>
  );
}

function RoyaltyNote({ book }) {
  if (!book.isPublished) return null;
  if (book.totalCopiesSold === 0) return <p className="note">No sales recorded yet.</p>;
  if (book.royaltyPaid === 0 && book.royaltyPending > 0 && book.royaltyPending < MIN_PAYOUT) {
    return <p className="note">Your pending royalty is below the {inr(MIN_PAYOUT)} minimum payout, so it rolls over to the next quarter.</p>;
  }
  if (book.royaltyPaid === 0 && book.royaltyPending > 0) return <p className="note note-warn">No payout received yet. Royalties are calculated quarterly and paid within 45 days of the quarter end. <Link to={`/tickets/new?book=${book.bookId}`}>Ask us about it</Link></p>;
  if (book.royaltyPending === 0) return <p className="note note-ok"><CheckCircle2 size={16} />All earned royalty has been paid out.</p>;
  return null;
}

function BookCard({ book, stages }) {
  return (
    <article className="card book">
      <header className="book-head">
        <span className="book-tile" aria-hidden><BookOpen size={22} strokeWidth={1.75} /></span>
        <div className="book-title">
          <h3>{book.title}</h3>
          <p className="muted small">{book.genre}</p>
        </div>
        <span className={`badge ${book.isPublished ? 'status-resolved' : 'status-in-progress'}`}>{book.status}</span>
      </header>

      <dl className="facts">
        <div><dt>ISBN</dt><dd className="mono">{book.isbn ?? '—'}</dd></div>
        <div><dt>Publication date</dt><dd>{book.publicationDate ? formatDate(book.publicationDate) : 'Not yet published'}</dd></div>
        <div><dt>MRP</dt><dd>{book.mrp != null ? inr(book.mrp) : '—'}</dd></div>
        <div><dt>Print partner</dt><dd>{book.printPartner ?? '—'}</dd></div>
      </dl>

      {book.isPublished ? (
        <>
          <div className="royalty-grid">
            <div><span className="label">Copies sold</span><strong>{book.totalCopiesSold.toLocaleString('en-IN')}</strong></div>
            <div><span className="label">Royalty earned</span><strong>{inr(book.totalRoyaltyEarned)}</strong></div>
            <div><span className="label">Royalty paid</span><strong className="pos">{inr(book.royaltyPaid)}</strong></div>
            <div className={book.royaltyPending > 0 ? 'pending' : ''}><span className="label">Royalty pending</span><strong>{inr(book.royaltyPending)}</strong></div>
          </div>
          <p className="muted small">
            Last payout: {book.lastRoyaltyPayoutDate ? formatDate(book.lastRoyaltyPayoutDate) : 'none yet'}
            {book.royaltyPerCopy != null && <> · {inr(book.royaltyPerCopy)} royalty per copy</>}
          </p>
          <RoyaltyNote book={book} />
          <div className="chips" aria-label="Available on">
            {book.availableOn.length ? book.availableOn.map((p) => <span className="chip" key={p}>{p}</span>) : <span className="muted small">Not listed on any platform yet</span>}
          </div>
        </>
      ) : <ProductionProgress book={book} stages={stages} />}

      <footer className="book-foot">
        <Link className="btn btn-sm" to={`/tickets/new?book=${book.bookId}`}><MessageSquarePlus size={16} />Ask about this book</Link>
      </footer>
    </article>
  );
}

export default function BooksPage() {
  const meta = useMeta();
  const { data, error, loading, reload } = useFetch(() => api.get('/books'), []);

  if (loading) return <PageSkeleton label="Loading your books…" />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;
  const { items, summary } = data;

  return (
    <div className="page">
      <PageHeader eyebrow="Author portal" title="My Books" subtitle={`${summary.totalBooks} title${summary.totalBooks === 1 ? '' : 's'} · ${summary.published} published · ${summary.inProduction} in production`}>
        <Link className="btn btn-primary" to="/tickets/new">Submit a support query</Link>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No books on your account yet" action={{ to: '/tickets/new', label: 'Contact support' }}>
          Once your manuscript is received, your book will appear here with its production progress.
        </EmptyState>
      ) : (
        <>
          {summary.totalRoyaltyPending > 0 && (
            <Alert kind="info">You have <strong>{inr(summary.totalRoyaltyPending)}</strong> in pending royalties across your books. Royalties are calculated quarterly and paid within 45 days of the quarter end.</Alert>
          )}
          <div className="books">
            {items.map((b) => <BookCard key={b.bookId} book={b} stages={meta?.productionStages ?? []} />)}
          </div>
        </>
      )}
    </div>
  );
}
