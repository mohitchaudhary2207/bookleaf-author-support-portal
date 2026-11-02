import { EmptyState } from '../components/Common.jsx';

export default function NotFoundPage() {
  return (
    <div className="page narrow">
      <EmptyState icon="🧭" title="Page not found" action={{ to: '/', label: 'Go to my dashboard' }}>
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  );
}
